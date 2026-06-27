import httpx
import structlog
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from models.task import Task
from core.config import settings
from datetime import datetime, timezone

logger = structlog.get_logger()
GITHUB_API_TIMEOUT = httpx.Timeout(10.0, connect=5.0)


# ---------------------------------------------------------------------------
# Webhook registration helpers
# ---------------------------------------------------------------------------


async def register_github_webhook(project_id: str, repo_url: str) -> bool:
    """
    Register (or update) a GitHub webhook on the given repo so that GitHub
    pushes events to our backend.

    Requires:
      - settings.GITHUB_TOKEN  — PAT with `admin:repo_hook` scope
      - settings.WEBHOOK_BASE_URL — e.g. https://projecthub-backend-wjnl.onrender.com
      - settings.GITHUB_WEBHOOK_SECRET — shared secret for HMAC verification

    Returns True on success, False if registration was skipped or failed.
    Errors are logged but never raised so they never crash the caller.
    """
    from core.config import settings

    if not settings.GITHUB_TOKEN:
        logger.warning(
            "register_github_webhook_skipped",
            reason="GITHUB_TOKEN not set",
            project_id=project_id,
        )
        return False

    if not settings.WEBHOOK_BASE_URL:
        logger.warning(
            "register_github_webhook_skipped",
            reason="WEBHOOK_BASE_URL not set — set it in Render env vars",
            project_id=project_id,
        )
        return False

    # Parse owner/repo from URL like https://github.com/owner/repo
    parts = repo_url.rstrip("/").split("/")
    if len(parts) < 2:
        logger.error(
            "register_github_webhook_failed",
            reason="Cannot parse owner/repo from repo_url",
            repo_url=repo_url,
        )
        return False
    owner, repo = parts[-2], parts[-1]

    payload_url = (
        f"{settings.WEBHOOK_BASE_URL.rstrip('/')}/api/github/webhook/{project_id}"
    )
    api_url = f"https://api.github.com/repos/{owner}/{repo}/hooks"
    headers = {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {settings.GITHUB_TOKEN}",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "ProjectHub-Webhook-Registrar",
    }
    hook_body = {
        "name": "web",
        "active": True,
        "events": ["push", "pull_request", "issues"],
        "config": {
            "url": payload_url,
            "content_type": "json",
            "insecure_ssl": "0",
            **(
                {"secret": settings.GITHUB_WEBHOOK_SECRET}
                if settings.GITHUB_WEBHOOK_SECRET
                else {}
            ),
        },
    }

    async with httpx.AsyncClient(timeout=GITHUB_API_TIMEOUT) as client:
        try:
            # Try to create the hook
            response = await client.post(api_url, json=hook_body, headers=headers)

            if response.status_code == 422:
                # Hook already exists — list existing hooks and update the one
                # whose URL contains our project_id
                list_resp = await client.get(api_url, headers=headers)
                list_resp.raise_for_status()
                existing_hooks = list_resp.json()
                for hook in existing_hooks:
                    if project_id in hook.get("config", {}).get("url", ""):
                        hook_id = hook["id"]
                        patch_resp = await client.patch(
                            f"{api_url}/{hook_id}",
                            json=hook_body,
                            headers=headers,
                        )
                        patch_resp.raise_for_status()
                        logger.info(
                            "register_github_webhook_updated",
                            project_id=project_id,
                            hook_id=hook_id,
                            payload_url=payload_url,
                        )
                        return True
                # No existing hook found — log and move on
                logger.warning(
                    "register_github_webhook_conflict",
                    project_id=project_id,
                    detail=response.text[:200],
                )
                return False

            response.raise_for_status()
            hook_id = response.json().get("id")
            logger.info(
                "register_github_webhook_created",
                project_id=project_id,
                hook_id=hook_id,
                payload_url=payload_url,
            )
            return True

        except Exception as exc:
            logger.error(
                "register_github_webhook_error",
                project_id=project_id,
                repo_url=repo_url,
                error=str(exc),
            )
            return False


async def delete_github_webhook(project_id: str, repo_url: str) -> bool:
    """Delete the ProjectHub webhook from GitHub when a repo is unlinked."""
    from core.config import settings

    if not settings.GITHUB_TOKEN:
        return False

    parts = repo_url.rstrip("/").split("/")
    if len(parts) < 2:
        return False
    owner, repo = parts[-2], parts[-1]
    api_url = f"https://api.github.com/repos/{owner}/{repo}/hooks"
    headers = {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {settings.GITHUB_TOKEN}",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "ProjectHub-Webhook-Registrar",
    }

    async with httpx.AsyncClient(timeout=GITHUB_API_TIMEOUT) as client:
        try:
            list_resp = await client.get(api_url, headers=headers)
            list_resp.raise_for_status()
            for hook in list_resp.json():
                if project_id in hook.get("config", {}).get("url", ""):
                    del_resp = await client.delete(
                        f"{api_url}/{hook['id']}", headers=headers
                    )
                    del_resp.raise_for_status()
                    logger.info(
                        "delete_github_webhook_ok",
                        project_id=project_id,
                        hook_id=hook["id"],
                    )
                    return True
        except Exception as exc:
            logger.error(
                "delete_github_webhook_error",
                project_id=project_id,
                error=str(exc),
            )
    return False


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

    async with httpx.AsyncClient(timeout=GITHUB_API_TIMEOUT) as client:
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
