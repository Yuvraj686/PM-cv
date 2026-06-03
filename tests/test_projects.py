"""Tests for project endpoints and RBAC."""
import uuid
import pytest
from httpx import AsyncClient
from models.project_member import ProjectMember
from models.user import User
from core.security import create_access_token, hash_password


@pytest.mark.asyncio
async def test_create_project_as_owner(test_client: AsyncClient, auth_headers):
    resp = await test_client.post("/api/projects", json={
        "name": "New Project",
        "description": "Created in test",
    }, headers=auth_headers)
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "New Project"
    assert "id" in data


@pytest.mark.asyncio
async def test_get_project_as_member(test_client: AsyncClient, auth_headers, test_project):
    resp = await test_client.get(
        f"/api/projects/{test_project.id}",
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == "Test Project"


@pytest.mark.asyncio
async def test_get_project_unauthorized(test_client: AsyncClient, test_project, db_session):
    # Create a user who is NOT a member
    outsider = User(
        id=uuid.uuid4(),
        name="Outsider",
        email="outsider@example.com",
        hashed_password=hash_password("Pass1234"),
    )
    db_session.add(outsider)
    await db_session.flush()

    token = create_access_token({"sub": str(outsider.id), "email": outsider.email})
    resp = await test_client.get(
        f"/api/projects/{test_project.id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_delete_project_as_non_owner(test_client: AsyncClient, test_project, db_session):
    # Create a viewer member
    viewer = User(
        id=uuid.uuid4(),
        name="Viewer",
        email="viewer@example.com",
        hashed_password=hash_password("Pass1234"),
    )
    db_session.add(viewer)
    await db_session.flush()

    member = ProjectMember(
        project_id=test_project.id,
        user_id=viewer.id,
        role="viewer",
    )
    db_session.add(member)
    await db_session.flush()

    token = create_access_token({"sub": str(viewer.id), "email": viewer.email})
    resp = await test_client.delete(
        f"/api/projects/{test_project.id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_delete_project_as_owner(test_client: AsyncClient, auth_headers, test_project):
    resp = await test_client.delete(
        f"/api/projects/{test_project.id}",
        headers=auth_headers,
    )
    assert resp.status_code == 204


@pytest.mark.asyncio
async def test_update_project_as_admin(test_client: AsyncClient, auth_headers, test_project):
    resp = await test_client.put(
        f"/api/projects/{test_project.id}",
        json={"name": "Updated Name"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == "Updated Name"
