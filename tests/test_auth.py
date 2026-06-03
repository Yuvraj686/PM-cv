"""Tests for authentication endpoints."""
import pytest
from httpx import AsyncClient
from unittest.mock import AsyncMock, patch


@pytest.mark.asyncio
async def test_register_success(test_client: AsyncClient):
    resp = await test_client.post("/api/auth/register", json={
        "name": "New User",
        "email": "newuser@example.com",
        "password": "StrongPass1",
    })
    assert resp.status_code == 201
    data = resp.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["token_type"] == "bearer"


@pytest.mark.asyncio
async def test_login_success(test_client: AsyncClient, test_user):
    resp = await test_client.post("/api/auth/login", json={
        "email": "testuser@example.com",
        "password": "TestPass123",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert "refresh_token" in data


@pytest.mark.asyncio
async def test_login_wrong_password(test_client: AsyncClient, test_user):
    resp = await test_client.post("/api/auth/login", json={
        "email": "testuser@example.com",
        "password": "WrongPassword1",
    })
    assert resp.status_code == 401
    data = resp.json()
    # Standardized error response uses "message" field
    assert "Invalid credentials" in data.get("message", data.get("detail", ""))


@pytest.mark.asyncio
async def test_login_rate_limit(test_client: AsyncClient, test_user):
    """Exceed 5 requests/minute on login → expect 429."""
    for i in range(6):
        resp = await test_client.post("/api/auth/login", json={
            "email": "testuser@example.com",
            "password": "WrongPassword1",
        })
    # The 6th request should be rate-limited
    assert resp.status_code == 429


@pytest.mark.asyncio
async def test_register_duplicate_email(test_client: AsyncClient, test_user):
    resp = await test_client.post("/api/auth/register", json={
        "name": "Duplicate",
        "email": "testuser@example.com",
        "password": "StrongPass1",
    })
    # ConflictError returns 409
    assert resp.status_code == 409
    data = resp.json()
    assert "already registered" in data.get("message", data.get("detail", "")).lower()


@pytest.mark.asyncio
async def test_token_refresh(test_client: AsyncClient, test_user, auth_refresh_token):
    # Mock Redis blacklist functions so we don't need a live Redis
    with patch("routers.auth.is_token_blacklisted", new_callable=AsyncMock, return_value=False), \
         patch("routers.auth.blacklist_token", new_callable=AsyncMock):
        # Use the refresh token to get new tokens
        resp = await test_client.post("/api/auth/refresh", json={
            "refresh_token": auth_refresh_token,
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data
        assert "refresh_token" in data

        # Verify the new access token works
        me_resp = await test_client.get(
            "/api/auth/me",
            headers={"Authorization": f"Bearer {data['access_token']}"},
        )
        assert me_resp.status_code == 200


@pytest.mark.asyncio
async def test_google_oauth_redirect(test_client: AsyncClient):
    # The Google OAuth router is mounted at /api/auth/google with GET "/"
    resp = await test_client.get("/api/auth/google/", follow_redirects=False)
    # Should redirect to Google's OAuth endpoint
    assert resp.status_code in (302, 307)
    location = resp.headers.get("location", "")
    assert "accounts.google.com" in location or "google" in location.lower()
