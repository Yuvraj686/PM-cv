"""Celery tasks for async AI operations."""

import asyncio
import logging

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


@celery_app.task(name="services.ai.generate_tasks", bind=True)
def generate_tasks_celery(
    self,
    project_id: str,
    project_goal: str,
    context: str | None,
    user_id: str,
):
    """Generate tasks via OpenAI and auto-create them in the project."""
    return asyncio.run(
        _run_and_cleanup(
            _async_generate_tasks(
                self.request.id, project_id, project_goal, context, user_id
            )
        )
    )


async def _async_generate_tasks(
    task_id: str,
    project_id: str,
    project_goal: str,
    context: str | None,
    user_id: str,
) -> dict:
    from core.database import AsyncSessionLocal
    from services.ai_openai import generate_tasks_json, create_tasks_from_generated

    try:
        async with AsyncSessionLocal() as db:
            tasks_data = await generate_tasks_json(project_goal, context)
            created = await create_tasks_from_generated(project_id, tasks_data, db)
            logger.info(f"AI generated {len(created)} tasks for project {project_id}")
            return {
                "status": "success",
                "tasks": created,
                "project_id": project_id,
            }
    except Exception as e:
        logger.error(f"AI task generation failed: {e}")
        return {"status": "error", "error": str(e)}
