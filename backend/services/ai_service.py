import structlog
from anthropic import AsyncAnthropic
from openai import AsyncOpenAI
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from models.project import Project
from models.task import Task
from models.project_member import ProjectMember
from models.user import User
from core.config import settings

logger = structlog.get_logger()
anthropic_client = AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY or "MISSING_KEY")
openai_client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY or "MISSING_KEY")

CHAT_SYSTEM_PROMPT = """You are an intelligent AI assistant for ProjectHub, a project management tool.
You have access to the following live project context:

{system_context}

Be helpful, specific, and concise. When answering questions about the project,
reference the actual data provided. You can suggest task priorities, identify
bottlenecks, recommend next steps, and answer questions about the project timeline."""


def _has_anthropic_key() -> bool:
    return bool(
        settings.ANTHROPIC_API_KEY and settings.ANTHROPIC_API_KEY.startswith("sk-ant-")
    )


def _has_openai_key() -> bool:
    return bool(settings.OPENAI_API_KEY and settings.OPENAI_API_KEY.startswith("sk-"))


def _is_auth_error(exc: Exception) -> bool:
    text = str(exc).lower()
    return (
        "401" in text
        or "authentication" in text
        or "invalid x-api-key" in text
        or "invalid api key" in text
    )


def _provider_config_error() -> RuntimeError:
    return RuntimeError(
        "AI chat is not configured. Set a valid OPENAI_API_KEY or ANTHROPIC_API_KEY in backend/.env."
    )


async def build_project_context(project_id: str, db: AsyncSession) -> str:
    """Assemble live project context for Claude system prompt."""
    logger.info("build_project_context_started", project_id=project_id)
    project_result = await db.execute(select(Project).where(Project.id == project_id))
    project = project_result.scalar_one_or_none()
    if not project:
        return "No project context available."

    tasks_result = await db.execute(select(Task).where(Task.project_id == project_id))
    tasks = tasks_result.scalars().all()

    members_result = await db.execute(
        select(ProjectMember, User)
        .join(User, User.id == ProjectMember.user_id)
        .where(ProjectMember.project_id == project_id)
    )
    members = members_result.all()

    todo = [t for t in tasks if t.status == "todo"]
    in_progress = [t for t in tasks if t.status == "in_progress"]
    done = [t for t in tasks if t.status == "done"]
    [t for t in tasks if t.due_date and t.status != "done"]

    context = f"""
PROJECT: {project.name}
Description: {project.description or "N/A"}
Repository: {project.repo_url or "N/A"}
Deadline: {project.deadline or "N/A"}

TASK SUMMARY:
- Total tasks: {len(tasks)}
- Todo: {len(todo)}
- In Progress: {len(in_progress)}
- Done: {len(done)}
- Completion: {round(len(done) / len(tasks) * 100) if tasks else 0}%

TEAM MEMBERS:
{chr(10).join([f"- {m.User.name} ({m.ProjectMember.role})" for m in members])}

ACTIVE TASKS (In Progress):
{chr(10).join([f"- [{t.priority.upper()}] {t.title}" for t in in_progress[:10]]) or "None"}

HIGH PRIORITY TASKS:
{chr(10).join([f"- {t.title} (status: {t.status}, due: {t.due_date})" for t in tasks if t.priority in ("high", "critical")][:5]) or "None"}
""".strip()

    return context


async def stream_chat_response(messages: list[dict], system_context: str):
    """Async generator that yields text chunks from the configured AI provider."""
    logger.info("stream_chat_response_started", messages_count=len(messages))

    if _has_anthropic_key():
        try:
            async for text in _stream_chat_response_anthropic(messages, system_context):
                yield text
            return
        except Exception as exc:
            if not (_has_openai_key() and _is_auth_error(exc)):
                raise
            logger.warning(
                "anthropic_auth_failed_falling_back_to_openai", error=str(exc)
            )

    if _has_openai_key():
        async for text in _stream_chat_response_openai(messages, system_context):
            yield text
        return

    raise _provider_config_error()


async def _stream_chat_response_anthropic(messages: list[dict], system_context: str):
    """Async generator that yields text chunks from Claude streaming API."""
    async with anthropic_client.messages.stream(
        model="claude-3-5-sonnet-20240620",
        max_tokens=1024,
        system=CHAT_SYSTEM_PROMPT.format(system_context=system_context),
        messages=messages,
    ) as stream:
        async for text in stream.text_stream:
            yield text


async def _stream_chat_response_openai(messages: list[dict], system_context: str):
    """Async generator that yields text chunks from OpenAI streaming API."""
    stream = await openai_client.chat.completions.create(
        model="gpt-4o-mini",
        max_tokens=1024,
        stream=True,
        messages=[
            {
                "role": "system",
                "content": CHAT_SYSTEM_PROMPT.format(system_context=system_context),
            },
            *messages,
        ],
    )
    async for chunk in stream:
        delta = chunk.choices[0].delta.content if chunk.choices else None
        if delta:
            yield delta


async def summarize_commits(commit_data: list[dict]) -> str:
    """Generate AI summary of GitHub commits for non-technical team members."""
    logger.info("summarize_commits_started", commits_count=len(commit_data))
    commit_text = "\n".join(
        [f"- {c.get('author', 'Unknown')}: {c.get('message', '')}" for c in commit_data]
    )

    if not _has_anthropic_key() and _has_openai_key():
        response = await openai_client.chat.completions.create(
            model="gpt-4o-mini",
            max_tokens=300,
            messages=[
                {
                    "role": "system",
                    "content": "Summarize Git commits in plain language for non-technical project stakeholders.",
                },
                {
                    "role": "user",
                    "content": f"""Summarize these Git commits in 3-4 sentences for a non-technical
team member. Be specific about what changed and why it matters.

Commits:
{commit_text}""",
                },
            ],
        )
        return response.choices[0].message.content or ""

    if not _has_anthropic_key():
        raise _provider_config_error()

    message = await anthropic_client.messages.create(
        model="claude-3-5-sonnet-20240620",
        max_tokens=300,
        messages=[
            {
                "role": "user",
                "content": f"""Summarize these Git commits in 3-4 sentences for a non-technical 
team member. Be specific about what changed and why it matters.

Commits:
{commit_text}""",
            }
        ],
    )
    return message.content[0].text
