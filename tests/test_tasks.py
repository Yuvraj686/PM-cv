"""Tests for task endpoints including sanitization."""
import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_create_task(test_client: AsyncClient, auth_headers, test_project):
    resp = await test_client.post("/api/tasks", json={
        "project_id": str(test_project.id),
        "title": "My New Task",
        "description": "Task description",
        "status": "todo",
        "priority": "high",
    }, headers=auth_headers)
    assert resp.status_code == 201
    data = resp.json()
    assert data["title"] == "My New Task"
    assert data["status"] == "todo"
    assert data["priority"] == "high"


@pytest.mark.asyncio
async def test_create_task_sanitizes_html(test_client: AsyncClient, auth_headers, test_project):
    resp = await test_client.post("/api/tasks", json={
        "project_id": str(test_project.id),
        "title": "<script>alert(1)</script>Clean Task",
        "description": "<b>Bold</b> and <a href='evil'>link</a>",
    }, headers=auth_headers)
    assert resp.status_code == 201
    data = resp.json()
    # HTML should be stripped
    assert "<script>" not in data["title"]
    assert "alert(1)" in data["title"]  # Text content preserved
    assert "Clean Task" in data["title"]
    assert "<b>" not in data["description"]
    assert "Bold" in data["description"]


@pytest.mark.asyncio
async def test_create_task_with_story_points(test_client: AsyncClient, auth_headers, test_project):
    resp = await test_client.post("/api/tasks", json={
        "project_id": str(test_project.id),
        "title": "Pointed Task",
        "story_points": 8,
    }, headers=auth_headers)
    assert resp.status_code == 201
    data = resp.json()
    assert data["story_points"] == 8


@pytest.mark.asyncio
async def test_create_task_rejects_invalid_story_points(test_client: AsyncClient, auth_headers, test_project):
    resp = await test_client.post("/api/tasks", json={
        "project_id": str(test_project.id),
        "title": "Out of range points",
        "story_points": 101,
    }, headers=auth_headers)
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_update_task_status(test_client: AsyncClient, auth_headers, test_task):
    resp = await test_client.patch(
        f"/api/tasks/{test_task.id}/status",
        json={"status": "in_progress"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "in_progress"


@pytest.mark.asyncio
async def test_assign_task_to_member(test_client: AsyncClient, auth_headers, test_task, test_user):
    resp = await test_client.put(
        f"/api/tasks/{test_task.id}",
        json={"assignee_id": str(test_user.id)},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["assignee_id"] == str(test_user.id)


@pytest.mark.asyncio
async def test_delete_task(test_client: AsyncClient, auth_headers, test_task):
    resp = await test_client.delete(
        f"/api/tasks/{test_task.id}",
        headers=auth_headers,
    )
    assert resp.status_code == 204

    # Verify it's gone
    get_resp = await test_client.get(
        f"/api/tasks?project_id={test_task.project_id}",
        headers=auth_headers,
    )
    task_ids = [t["id"] for t in get_resp.json()]
    assert str(test_task.id) not in task_ids
