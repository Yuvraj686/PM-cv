import structlog
import httpx
from core.config import settings
from models.notification import Notification

logger = structlog.get_logger()
EMAIL_API_TIMEOUT = httpx.Timeout(10.0, connect=5.0)


async def send_deadline_alert_email(
    task, user, project_name: str | None = None
) -> None:
    """Send deadline alert email to task assignee."""
    logger.info(
        "send_deadline_alert_email_started", task_id=str(task.id), user_id=str(user.id)
    )
    if not settings.EMAIL_API_KEY:
        logger.warning("EMAIL_API_KEY not set — skipping deadline alert email")
        return

    project_line = (
        f"<strong>Project:</strong> {project_name}<br>" if project_name else ""
    )
    task_url = f"{settings.FRONTEND_URL}/projects/{task.project_id}/tasks"

    html = f"""
    <div style="font-family: Inter, sans-serif; max-width: 600px; margin: 0 auto; background: #0F1117; color: #fff; padding: 32px; border-radius: 12px;">
      <div style="display: flex; align-items: center; margin-bottom: 24px;">
        <span style="font-size: 24px;">⏰</span>
        <h1 style="margin: 0 0 0 12px; font-size: 20px; color: #6366F1;">Deadline Alert</h1>
      </div>
      <p style="color: #94a3b8;">Hi <strong>{user.name}</strong>,</p>
      <p style="color: #94a3b8;">This is a reminder that the following task is due soon:</p>
      <div style="background: #1e293b; border: 1px solid #334155; border-left: 4px solid #F59E0B; border-radius: 8px; padding: 16px; margin: 20px 0;">
        <h2 style="margin: 0 0 8px; font-size: 16px; color: #fff;">{task.title}</h2>
        <p style="margin: 4px 0; color: #94a3b8; font-size: 14px;">
          {project_line}
          <strong>Due Date:</strong> {task.due_date}<br>
          <strong>Priority:</strong> {task.priority.upper()}<br>
          <strong>Status:</strong> {task.status.replace("_", " ").title()}
        </p>
      </div>
      <p style="color: #94a3b8; font-size: 14px;">Please update the task status or reach out to your project lead.</p>
      <a href="{task_url}" 
         style="display: inline-block; background: #6366F1; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; margin-top: 16px;">
        View task in ProjectHub
      </a>
    </div>
    """

    try:
        async with httpx.AsyncClient(timeout=EMAIL_API_TIMEOUT) as client:
            response = await client.post(
                settings.EMAIL_API_URL,
                headers={"Authorization": f"Bearer {settings.EMAIL_API_KEY}"},
                json={
                    "from": settings.FROM_EMAIL,
                    "to": user.email,
                    "subject": f"Deadline Alert: {task.title}",
                    "html": html,
                },
            )
            response.raise_for_status()
        logger.info(f"Deadline alert email sent to {user.email}")
    except Exception as e:
        logger.error(f"Failed to send deadline alert email: {e}")


async def send_daily_digest_email(admin, tasks: list, projects: dict) -> None:
    """Send daily digest of all tasks due tomorrow to project admins."""
    logger.info(
        "send_daily_digest_email_started",
        admin_id=str(admin.id),
        tasks_count=len(tasks),
    )
    if not settings.EMAIL_API_KEY:
        return

    task_rows = "".join(
        [
            f"""<tr>
          <td style="padding: 8px 12px; border-bottom: 1px solid #334155; color: #fff;">{t.title}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #334155; color: #94a3b8;">{projects.get(str(t.project_id), "Unknown")}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #334155; color: #F59E0B;">{t.priority.upper()}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #334155; color: #94a3b8;">{t.status.replace("_", " ").title()}</td>
        </tr>"""
            for t in tasks
        ]
    )

    html = f"""
    <div style="font-family: Inter, sans-serif; max-width: 700px; margin: 0 auto; background: #0F1117; color: #fff; padding: 32px; border-radius: 12px;">
      <h1 style="color: #6366F1; font-size: 20px;">📋 Daily Digest — Tasks Due Tomorrow</h1>
      <p style="color: #94a3b8;">Hi <strong>{admin.name}</strong>, here are all tasks due tomorrow across your projects:</p>
      <table style="width: 100%; border-collapse: collapse; margin-top: 20px; background: #1e293b; border-radius: 8px; overflow: hidden;">
        <thead>
          <tr style="background: #334155;">
            <th style="padding: 12px; text-align: left; color: #94a3b8; font-size: 12px; text-transform: uppercase;">Task</th>
            <th style="padding: 12px; text-align: left; color: #94a3b8; font-size: 12px; text-transform: uppercase;">Project</th>
            <th style="padding: 12px; text-align: left; color: #94a3b8; font-size: 12px; text-transform: uppercase;">Priority</th>
            <th style="padding: 12px; text-align: left; color: #94a3b8; font-size: 12px; text-transform: uppercase;">Status</th>
          </tr>
        </thead>
        <tbody>
          {task_rows}
        </tbody>
      </table>
      <a href="{settings.FRONTEND_URL}/dashboard" 
         style="display: inline-block; background: #6366F1; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; margin-top: 24px;">
        Open ProjectHub
      </a>
    </div>
    """

    try:
        async with httpx.AsyncClient(timeout=EMAIL_API_TIMEOUT) as client:
            response = await client.post(
                settings.EMAIL_API_URL,
                headers={"Authorization": f"Bearer {settings.EMAIL_API_KEY}"},
                json={
                    "from": settings.FROM_EMAIL,
                    "to": admin.email,
                    "subject": f"📋 Daily Digest: {len(tasks)} task(s) due tomorrow",
                    "html": html,
                },
            )
            response.raise_for_status()
    except Exception as e:
        logger.error(f"Daily digest email failed: {e}")


async def create_notification_record(
    db, user_id: str, notif_type: str, content: str
) -> Notification:
    """Create and persist an in-app notification."""
    logger.info(
        "create_notification_record_started", user_id=user_id, notif_type=notif_type
    )
    notif = Notification(user_id=user_id, type=notif_type, content=content)
    db.add(notif)
    await db.flush()
    return notif
