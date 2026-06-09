import asyncio
import logging
from datetime import datetime, timedelta, timezone, date
from core.celery_app import celery_app

logger = logging.getLogger(__name__)


async def _run_and_cleanup(coro):
    try:
        return await coro
    finally:
        try:
            from core.database import engine

            await engine.dispose()
        except Exception:
            pass


@celery_app.task(name="services.notification.check_deadlines")
def check_deadlines():
    """Check tasks due within 48 hours and send alerts."""
    asyncio.run(_run_and_cleanup(_async_check_deadlines()))


@celery_app.task(name="services.notification.daily_digest")
def send_daily_digest():
    """Send daily digest email to project admins."""
    asyncio.run(_run_and_cleanup(_async_daily_digest()))


@celery_app.task(name="services.github.sync_all")
def sync_all_github():
    """Sync issues for all projects with GitHub repos."""
    asyncio.run(_run_and_cleanup(_async_sync_all_github()))


@celery_app.task(name="services.integrations.slack_notify")
def slack_notify(
    project_id: str,
    event: str,
    message: str,
    assignee_user_id: str | None = None,
    mentioned_usernames: list[str] | None = None,
):
    """Send a Slack notification for a project integration event."""
    asyncio.run(
        _run_and_cleanup(
            _async_slack_notify(
                project_id=project_id,
                event=event,
                message=message,
                assignee_user_id=assignee_user_id,
                mentioned_usernames=mentioned_usernames or [],
            )
        )
    )


@celery_app.task(
    name="services.webhooks.deliver", bind=True, max_retries=3, default_retry_delay=10
)
def deliver_webhook(
    self,
    webhook_id: str,
    project_id: str,
    event: str,
    payload: dict,
    attempt: int = 1,
):
    """Deliver a webhook payload with retries and delivery attempt logging."""
    success, error = asyncio.run(
        _run_and_cleanup(
            _async_deliver_webhook(
                webhook_id=webhook_id,
                project_id=project_id,
                event=event,
                payload=payload,
                attempt=attempt,
            )
        )
    )
    if not success and attempt < 3:
        raise self.retry(
            exc=Exception(error or "webhook delivery failed"),
            countdown=10 * attempt,
            kwargs={
                "webhook_id": webhook_id,
                "project_id": project_id,
                "event": event,
                "payload": payload,
                "attempt": attempt + 1,
            },
        )


# Register AI Celery tasks (import side-effect)
import services.ai_tasks  # noqa: E402, F401


async def _async_check_deadlines():
    from core.database import AsyncSessionLocal
    from sqlalchemy import select, and_
    from models.task import Task
    from models.user import User
    from models.project import Project
    from services.notification import (
        send_deadline_alert_email,
        create_notification_record,
    )
    from services.slack import notify_project_channel
    from websocket.manager import manager

    today = datetime.now(timezone.utc).date()
    cutoff = today + timedelta(days=2)

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Task).where(
                and_(
                    Task.due_date is not None,
                    Task.due_date <= cutoff,
                    Task.status != "done",
                    not Task.alert_sent,
                    Task.assignee_id is not None,
                )
            )
        )
        tasks = result.scalars().all()

        for task in tasks:
            # Fetch assignee
            user_result = await db.execute(
                select(User).where(User.id == task.assignee_id)
            )
            user = user_result.scalar_one_or_none()
            if not user:
                continue

            project_name: str | None = None
            proj_res = await db.execute(
                select(Project.name).where(Project.id == task.project_id)
            )
            project_name = proj_res.scalar_one_or_none()

            # Send email
            try:
                await send_deadline_alert_email(task, user, project_name=project_name)
            except Exception as e:
                logger.error(f"Failed to send deadline email for task {task.id}: {e}")

            # Create in-app notification
            notif = await create_notification_record(
                db=db,
                user_id=str(user.id),
                notif_type="deadline_alert",
                content=f"Deadline approaching: {task.title}",
            )

            # Push WebSocket notification
            await manager.send_to_user(
                str(user.id),
                {
                    "type": "notification",
                    "notification": {
                        "id": str(notif.id),
                        "type": notif.type,
                        "content": notif.content,
                        "created_at": notif.created_at.isoformat(),
                    },
                },
            )

            # Mark alert sent
            task.alert_sent = True

            if task.due_date and task.due_date < today:
                try:
                    await notify_project_channel(
                        db,
                        project_id=str(task.project_id),
                        event="task_overdue",
                        message=f"Task overdue: {task.title}",
                        assignee_user_id=(
                            str(task.assignee_id) if task.assignee_id else None
                        ),
                    )
                except Exception as e:
                    logger.error(
                        f"Failed to send Slack overdue notification for task {task.id}: {e}"
                    )

        await db.commit()
        logger.info(f"Deadline check: sent alerts for {len(tasks)} tasks")


async def _async_daily_digest():
    from core.database import AsyncSessionLocal
    from sqlalchemy import select, and_
    from models.task import Task
    from models.project_member import ProjectMember
    from models.user import User
    from models.project import Project
    from services.notification import send_daily_digest_email

    tomorrow = date.today() + timedelta(days=1)

    async with AsyncSessionLocal() as db:
        # Get all tasks due tomorrow that aren't done
        result = await db.execute(
            select(Task, Project)
            .join(Project, Project.id == Task.project_id)
            .where(
                and_(
                    Task.due_date == tomorrow,
                    Task.status != "done",
                )
            )
        )
        tasks_with_projects = result.all()

        # Group by project admins
        admin_tasks: dict = {}
        for task, project in tasks_with_projects:
            admins_result = await db.execute(
                select(User)
                .join(ProjectMember, ProjectMember.user_id == User.id)
                .where(
                    ProjectMember.project_id == task.project_id,
                    ProjectMember.role == "admin",
                )
            )
            admins = admins_result.scalars().all()
            for admin in admins:
                if str(admin.id) not in admin_tasks:
                    admin_tasks[str(admin.id)] = {
                        "user": admin,
                        "tasks": [],
                        "projects": {},
                    }
                admin_tasks[str(admin.id)]["tasks"].append(task)
                admin_tasks[str(admin.id)]["projects"][str(project.id)] = project.name

        # Send digest to each admin
        for admin_data in admin_tasks.values():
            try:
                await send_daily_digest_email(
                    admin_data["user"], admin_data["tasks"], admin_data["projects"]
                )
            except Exception as e:
                logger.error(f"Daily digest failed: {e}")

        logger.info(f"Daily digest: sent to {len(admin_tasks)} admins")


async def _async_sync_all_github():
    from core.database import AsyncSessionLocal
    from sqlalchemy import select
    from models.project import Project
    from services.github_service import sync_repo_issues

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Project).where(Project.repo_url is not None))
        projects = result.scalars().all()

        for project in projects:
            if "github.com" in project.repo_url:
                try:
                    await sync_repo_issues(str(project.id), project.repo_url, db)
                except Exception as e:
                    logger.error(f"Periodic sync failed for {project.id}: {e}")

        logger.info(f"Periodic GitHub sync completed for {len(projects)} projects")


async def _async_slack_notify(
    *,
    project_id: str,
    event: str,
    message: str,
    assignee_user_id: str | None,
    mentioned_usernames: list[str],
):
    from core.database import AsyncSessionLocal
    from services.slack import notify_project_channel

    async with AsyncSessionLocal() as db:
        await notify_project_channel(
            db,
            project_id=project_id,
            event=event,
            message=message,
            assignee_user_id=assignee_user_id,
            mentioned_usernames=mentioned_usernames,
        )


async def _async_deliver_webhook(
    *,
    webhook_id: str,
    project_id: str,
    event: str,
    payload: dict,
    attempt: int,
) -> tuple[bool, str | None]:
    from services.webhooks import deliver_webhook

    return await deliver_webhook(
        webhook_id=webhook_id,
        project_id=project_id,
        event=event,
        payload=payload,
        attempt=attempt,
    )
