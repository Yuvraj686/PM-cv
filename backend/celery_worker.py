import asyncio
import logging
from datetime import datetime, timedelta, timezone, date
from celery import Celery
from celery.schedules import crontab
from core.config import settings

logger = logging.getLogger(__name__)

celery_app = Celery(
    "projecthub",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    beat_schedule={
        "check-deadlines-hourly": {
            "task": "services.notification.check_deadlines",
            "schedule": crontab(minute=0),  # every hour
        },
        "daily-digest-9am": {
            "task": "services.notification.daily_digest",
            "schedule": crontab(hour=9, minute=0),
        },
        "sync-github-4hourly": {
            "task": "services.github.sync_all",
            "schedule": crontab(minute=0, hour="*/4"),
        },
    },
)


@celery_app.task(name="services.notification.check_deadlines")
def check_deadlines():
    """Check tasks due within 48 hours and send alerts."""
    asyncio.run(_async_check_deadlines())


@celery_app.task(name="services.notification.daily_digest")
def send_daily_digest():
    """Send daily digest email to project admins."""
    asyncio.run(_async_daily_digest())


@celery_app.task(name="services.github.sync_all")
def sync_all_github():
    """Sync issues for all projects with GitHub repos."""
    asyncio.run(_async_sync_all_github())


async def _async_check_deadlines():
    from core.database import AsyncSessionLocal
    from sqlalchemy import select, and_
    from models.task import Task
    from models.user import User
    from models.project import Project
    from services.notification import send_deadline_alert_email, create_notification_record
    from websocket.manager import manager

    today = datetime.now(timezone.utc).date()
    cutoff = today + timedelta(days=2)

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Task)
            .where(
                and_(
                    Task.due_date != None,
                    Task.due_date <= cutoff,
                    Task.status != "done",
                    Task.alert_sent == False,
                    Task.assignee_id != None,
                )
            )
        )
        tasks = result.scalars().all()

        for task in tasks:
            # Fetch assignee
            user_result = await db.execute(select(User).where(User.id == task.assignee_id))
            user = user_result.scalar_one_or_none()
            if not user:
                continue

            project_name: str | None = None
            proj_res = await db.execute(select(Project.name).where(Project.id == task.project_id))
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
                content=f'Deadline approaching: {task.title}',
            )

            # Push WebSocket notification
            await manager.send_to_user(str(user.id), {
                "type": "notification",
                "notification": {
                    "id": str(notif.id),
                    "type": notif.type,
                    "content": notif.content,
                    "created_at": notif.created_at.isoformat(),
                },
            })

            # Mark alert sent
            task.alert_sent = True

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
    from datetime import date

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
                    admin_tasks[str(admin.id)] = {"user": admin, "tasks": [], "projects": {}}
                admin_tasks[str(admin.id)]["tasks"].append(task)
                admin_tasks[str(admin.id)]["projects"][str(project.id)] = project.name

        # Send digest to each admin
        for admin_data in admin_tasks.values():
            try:
                await send_daily_digest_email(admin_data["user"], admin_data["tasks"], admin_data["projects"])
            except Exception as e:
                logger.error(f"Daily digest failed: {e}")

        logger.info(f"Daily digest: sent to {len(admin_tasks)} admins")


async def _async_sync_all_github():
    from core.database import AsyncSessionLocal
    from sqlalchemy import select
    from models.project import Project
    from services.github_service import sync_repo_issues

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Project).where(Project.repo_url != None))
        projects = result.scalars().all()
        
        for project in projects:
            if "github.com" in project.repo_url:
                try:
                    await sync_repo_issues(str(project.id), project.repo_url, db)
                except Exception as e:
                    logger.error(f"Periodic sync failed for {project.id}: {e}")
        
        logger.info(f"Periodic GitHub sync completed for {len(projects)} projects")
