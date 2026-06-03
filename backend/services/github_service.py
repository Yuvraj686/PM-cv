import httpx
import structlog
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from models.task import Task
from core.config import settings
from datetime import datetime, timezone

logger = structlog.get_logger()


async def fetch_github_issues(repo_url: str) -> list[dict]:
    """Fetch open issues from a GitHub repository."""
    logger.info("fetch_github_issues_started", repo_url=repo_url)
    # repo_url example: https://github.com/owner/repo
    parts = repo_url.rstrip("/").split("/")
    if len(parts) < 2:
        return []

    owner = parts[-2]
    repo = parts[-1]
    api_url = f"https://api.github.com/repos/{owner}/{repo}/issues"

    headers = {
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "ProjectHub-Sync",
    }
    if settings.GITHUB_TOKEN:
        headers["Authorization"] = f"token {settings.GITHUB_TOKEN}"

    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(
                api_url, headers=headers, params={"state": "all"}
            )
            response.raise_for_status()
            return response.json()
        except Exception as e:
            logger.error(f"GitHub API error for {repo_url}: {e}")
            return []


async def sync_repo_issues(
    project_id: str, repo_url: str, db: AsyncSession | None = None
):
    """Sync issues from GitHub to ProjectHub tasks."""
    logger.info("sync_repo_issues_started", project_id=project_id, repo_url=repo_url)
    if not repo_url or "github.com" not in repo_url:
        return

    issues = await fetch_github_issues(repo_url)
    if not issues:
        return

    # If no session provided (e.g. background task), create a new one
    if db is None:
        from core.database import AsyncSessionLocal

        async with AsyncSessionLocal() as session:
            await _sync_logic(project_id, issues, session)
    else:
        await _sync_logic(project_id, issues, db)


async def _sync_logic(project_id: str, issues: list[dict], db: AsyncSession):
    """The actual upsert logic for GitHub issues."""
    # Get existing tasks for this project that came from GitHub
    result = await db.execute(
        select(Task).where(
            Task.project_id == project_id, Task.external_source == "github"
        )
    )
    existing_tasks = {str(t.external_id): t for t in result.scalars().all()}

    for issue in issues:
        # GitHub API returns both issues and PRs; we check for "pull_request" key
        if "pull_request" in issue:
            continue

        external_id = str(issue["id"])
        title = issue.get("title", "No Title")
        body = issue.get("body", "")
        github_status = issue.get("state")

        # Map GitHub state to ProjectHub status
        status = "todo"
        if github_status == "closed":
            status = "done"

        if external_id in existing_tasks:
            task = existing_tasks[external_id]
            task.title = title
            task.description = body
            task.status = status
            task.updated_at = datetime.now(timezone.utc)
        else:
            new_task = Task(
                project_id=project_id,
                title=title,
                description=body,
                status=status,
                external_id=external_id,
                external_source="github",
                priority="medium",
                position=0,
            )
            db.add(new_task)

    await db.commit()
    logger.info(f"Synced {len(issues)} items from GitHub for project {project_id}")
