"""Tests for GitHub sync service."""
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from services.github_service import fetch_github_issues, sync_repo_issues


MOCK_ISSUES = [
    {
        "id": 1001,
        "title": "Fix login bug",
        "body": "Users can't log in with special chars",
        "state": "open",
    },
    {
        "id": 1002,
        "title": "Add dark mode",
        "body": "Implement dark theme support",
        "state": "closed",
    },
    {
        # Pull requests have a "pull_request" key — should be skipped
        "id": 2001,
        "title": "PR: Update deps",
        "body": "",
        "state": "open",
        "pull_request": {"url": "https://api.github.com/repos/o/r/pulls/1"},
    },
]


@pytest.mark.asyncio
@patch("services.github_service.httpx.AsyncClient")
async def test_sync_repo_creates_tasks(mock_client_cls, db_session, test_project):
    """Mocked GitHub API returns issues → tasks should be created."""
    # Mock the HTTP client
    mock_response = MagicMock()
    mock_response.json.return_value = MOCK_ISSUES
    mock_response.raise_for_status = MagicMock()

    mock_client = AsyncMock()
    mock_client.get.return_value = mock_response
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client_cls.return_value = mock_client

    await sync_repo_issues(
        str(test_project.id),
        "https://github.com/testowner/testrepo",
        db_session,
    )

    # Check tasks were created (only issues, not PRs)
    from sqlalchemy import select
    from models.task import Task

    result = await db_session.execute(
        select(Task).where(
            Task.project_id == test_project.id,
            Task.external_source == "github",
        )
    )
    tasks = result.scalars().all()
    assert len(tasks) == 2  # 2 issues, 1 PR skipped

    titles = {t.title for t in tasks}
    assert "Fix login bug" in titles
    assert "Add dark mode" in titles

    # Closed issue should map to "done" status
    done_tasks = [t for t in tasks if t.status == "done"]
    assert len(done_tasks) == 1
    assert done_tasks[0].title == "Add dark mode"


@pytest.mark.asyncio
@patch("services.github_service.httpx.AsyncClient")
async def test_sync_handles_api_error_gracefully(mock_client_cls, db_session, test_project):
    """If GitHub API returns an error, sync should not crash."""
    mock_client = AsyncMock()
    mock_client.get.side_effect = Exception("GitHub API rate limited")
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client_cls.return_value = mock_client

    # Should not raise
    await sync_repo_issues(
        str(test_project.id),
        "https://github.com/testowner/testrepo",
        db_session,
    )

    # No tasks should have been created
    from sqlalchemy import select
    from models.task import Task

    result = await db_session.execute(
        select(Task).where(
            Task.project_id == test_project.id,
            Task.external_source == "github",
        )
    )
    assert len(result.scalars().all()) == 0
