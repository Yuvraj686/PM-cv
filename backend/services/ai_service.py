import json
import logging
from anthropic import AsyncAnthropic
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from models.project import Project
from models.task import Task
from models.project_member import ProjectMember
from models.user import User
from core.config import settings

logger = logging.getLogger(__name__)
client = AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)


async def build_project_context(project_id: str, db: AsyncSession) -> str:
    """Assemble live project context for Claude system prompt."""
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
    overdue = [t for t in tasks if t.due_date and t.status != "done"]

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
- Completion: {round(len(done)/len(tasks)*100) if tasks else 0}%

TEAM MEMBERS:
{chr(10).join([f"- {m.User.name} ({m.ProjectMember.role})" for m in members])}

ACTIVE TASKS (In Progress):
{chr(10).join([f"- [{t.priority.upper()}] {t.title}" for t in in_progress[:10]]) or "None"}

HIGH PRIORITY TASKS:
{chr(10).join([f"- {t.title} (status: {t.status}, due: {t.due_date})" for t in tasks if t.priority in ("high", "critical")][:5]) or "None"}
""".strip()

    return context


async def stream_chat_response(messages: list[dict], system_context: str):
    """Async generator that yields text chunks from Claude streaming API."""
    async with client.messages.stream(
        model="claude-3-5-sonnet-20240620",
        max_tokens=1024,
        system=f"""You are an intelligent AI assistant for ProjectHub, a project management tool.
You have access to the following live project context:

{system_context}

Be helpful, specific, and concise. When answering questions about the project,
reference the actual data provided. You can suggest task priorities, identify
bottlenecks, recommend next steps, and answer questions about the project timeline.""",
        messages=messages,
    ) as stream:
        async for text in stream.text_stream:
            yield text


async def summarize_commits(commit_data: list[dict]) -> str:
    """Generate AI summary of GitHub commits for non-technical team members."""
    commit_text = "\n".join([
        f"- {c.get('author', 'Unknown')}: {c.get('message', '')}"
        for c in commit_data
    ])

    message = await client.messages.create(
        model="claude-3-5-sonnet-20240620",
        max_tokens=300,
        messages=[{
            "role": "user",
            "content": f"""Summarize these Git commits in 3-4 sentences for a non-technical 
team member. Be specific about what changed and why it matters.

Commits:
{commit_text}"""
        }]
    )
    return message.content[0].text
