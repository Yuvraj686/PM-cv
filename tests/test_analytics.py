"""Tests for advanced analytics endpoints."""

from datetime import date, datetime, timedelta, timezone
import uuid

import pytest
from httpx import AsyncClient

from core.security import create_access_token, hash_password
from models.activity import Activity
from models.project_member import ProjectMember
from models.task import Task
from models.user import User


@pytest.mark.asyncio
async def test_burndown_endpoint_returns_series(
    test_client: AsyncClient,
    auth_headers,
    test_project,
    test_user,
    db_session,
):
    now = datetime.now(timezone.utc)
    open_task = Task(
        id=uuid.uuid4(),
        project_id=test_project.id,
        title="Open scoped task",
        status="todo",
        priority="high",
        story_points=8,
        due_date=date.today() + timedelta(days=5),
        created_at=now - timedelta(days=2),
        updated_at=now - timedelta(days=2),
    )
    done_task = Task(
        id=uuid.uuid4(),
        project_id=test_project.id,
        title="Done scoped task",
        status="done",
        priority="medium",
        story_points=5,
        due_date=date.today() + timedelta(days=4),
        created_at=now - timedelta(days=3),
        updated_at=now - timedelta(days=1),
    )
    db_session.add_all([open_task, done_task])
    await db_session.flush()

    db_session.add(
        Activity(
            id=uuid.uuid4(),
            project_id=test_project.id,
            actor_id=test_user.id,
            action="task_moved",
            target_id=done_task.id,
            target_type="task",
            metadata_={"from_status": "in_progress", "to_status": "done"},
            created_at=now - timedelta(days=1),
        )
    )
    await db_session.commit()

    resp = await test_client.get(
        f"/api/projects/{test_project.id}/analytics/burndown",
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) > 0
    assert {"date", "remaining_points", "ideal_remaining"} <= set(data[0].keys())


@pytest.mark.asyncio
async def test_workload_uses_open_task_story_points(
    test_client: AsyncClient,
    auth_headers,
    test_project,
    db_session,
):
    teammate = User(
        id=uuid.uuid4(),
        name="Teammate",
        email="teammate@example.com",
        hashed_password=hash_password("Pass1234"),
    )
    db_session.add(teammate)
    await db_session.flush()

    db_session.add(
        ProjectMember(
            project_id=test_project.id,
            user_id=teammate.id,
            role="member",
        )
    )
    await db_session.flush()

    db_session.add_all(
        [
            Task(
                id=uuid.uuid4(),
                project_id=test_project.id,
                title="Open task",
                status="in_progress",
                priority="high",
                assignee_id=teammate.id,
                story_points=8,
            ),
            Task(
                id=uuid.uuid4(),
                project_id=test_project.id,
                title="Done task",
                status="done",
                priority="low",
                assignee_id=teammate.id,
                story_points=13,
            ),
        ]
    )
    await db_session.commit()

    resp = await test_client.get(
        f"/api/projects/{test_project.id}/analytics/workload",
        headers=auth_headers,
    )
    assert resp.status_code == 200
    rows = resp.json()
    teammate_row = next((row for row in rows if row["user"]["id"] == str(teammate.id)), None)
    assert teammate_row is not None
    assert teammate_row["open_tasks"] == 1
    assert teammate_row["total_points"] == 8


@pytest.mark.asyncio
async def test_analytics_requires_project_viewer(
    test_client: AsyncClient,
    test_project,
    db_session,
):
    outsider = User(
        id=uuid.uuid4(),
        name="Outsider",
        email="outsider-analytics@example.com",
        hashed_password=hash_password("Pass1234"),
    )
    db_session.add(outsider)
    await db_session.flush()

    token = create_access_token({"sub": str(outsider.id), "email": outsider.email})
    resp = await test_client.get(
        f"/api/projects/{test_project.id}/analytics/velocity",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 403
