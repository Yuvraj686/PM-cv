"""OpenAI-powered AI features (task generation, risk analysis, etc.)."""

import json
from datetime import date, datetime, timezone
from difflib import SequenceMatcher
from typing import AsyncGenerator

import structlog
from openai import AsyncOpenAI
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import settings
from models.project import Project
from models.project_member import ProjectMember
from models.task import Task
from models.user import User
from utils.sanitize import sanitize_html

logger = structlog.get_logger()

openai_client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

TASK_GENERATION_SYSTEM = """You are a project management expert. Given a project goal, generate a practical list of tasks.
Return JSON with this exact structure:
{"tasks": [{"title": "...", "description": "...", "priority": "low|medium|high|critical", "estimated_hours": number}]}
Generate 5-12 actionable tasks. Priorities should reflect urgency. estimated_hours should be realistic (1-40)."""

RISK_ANALYSIS_SYSTEM = """You are a sprint risk analyst for agile teams. Analyze project data and return JSON:
{"risk_level": "low|medium|high", "top_risks": ["..."], "recommendations": ["..."]}
Be specific and actionable. top_risks and recommendations should each have 3-5 items."""

TRANSCRIPT_SYSTEM = """Extract action items from a meeting transcript. Return JSON:
{"tasks": [{"title": "...", "assignee_mention": "name or null", "due_date_mention": "date phrase or null", "priority": "low|medium|high|critical"}]}
Only include clear action items. assignee_mention is the person mentioned, due_date_mention is natural language dates."""

IMPROVE_TEXT_PROMPTS = {
    "task_description": "Improve this task description to be clear, specific, and actionable for a project team. Keep it concise.",
    "pr_summary": "Improve this pull request summary to be professional, clear, and informative for reviewers.",
}


async def generate_tasks_json(project_goal: str, context: str | None = None) -> list[dict]:
    user_content = f"Project goal: {project_goal}"
    if context:
        user_content += f"\n\nAdditional context:\n{context}"

    response = await openai_client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": TASK_GENERATION_SYSTEM},
            {"role": "user", "content": user_content},
        ],
        response_format={"type": "json_object"},
        max_tokens=2000,
    )
    raw = response.choices[0].message.content or "{}"
    data = json.loads(raw)
    return data.get("tasks", [])


async def create_tasks_from_generated(
    project_id: str,
    tasks_data: list[dict],
    db: AsyncSession,
) -> list[dict]:
    created = []
    for i, item in enumerate(tasks_data):
        priority = item.get("priority", "medium")
        if priority not in ("low", "medium", "high", "critical"):
            priority = "medium"

        task = Task(
            project_id=project_id,
            title=sanitize_html(str(item.get("title", "Untitled task"))[:500]),
            description=sanitize_html(str(item.get("description", ""))) if item.get("description") else None,
            status="todo",
            priority=priority,
            position=i,
        )
        db.add(task)
        await db.flush()
        created.append({
            "id": str(task.id),
            "title": task.title,
            "description": task.description,
            "priority": task.priority,
            "estimated_hours": item.get("estimated_hours"),
            "status": task.status,
        })
    await db.commit()
    return created


async def fetch_risk_context(project_id: str, db: AsyncSession) -> dict:
    today = date.today()
    project_result = await db.execute(select(Project).where(Project.id == project_id))
    project = project_result.scalar_one_or_none()
    if not project:
        return {}

    tasks_result = await db.execute(select(Task).where(Task.project_id == project_id))
    tasks = tasks_result.scalars().all()

    overdue = [
        t for t in tasks
        if t.due_date and t.due_date < today and t.status != "done"
    ]
    blocked = [
        t for t in tasks
        if t.status != "done" and (
            (t.due_date and t.due_date < today)
            or (t.title and "blocked" in t.title.lower())
            or (t.description and "blocked" in (t.description or "").lower())
        )
    ]

    workload_result = await db.execute(
        select(User.name, User.id, func.count(Task.id).label("task_count"))
        .join(Task, Task.assignee_id == User.id)
        .where(Task.project_id == project_id, Task.status != "done")
        .group_by(User.id, User.name)
    )
    workload = [
        {"name": row.name, "open_tasks": row.task_count}
        for row in workload_result.all()
    ]

    return {
        "project_name": project.name,
        "deadline": str(project.deadline) if project.deadline else None,
        "total_tasks": len(tasks),
        "overdue_tasks": [{"title": t.title, "due_date": str(t.due_date), "status": t.status} for t in overdue],
        "blocked_tasks": [{"title": t.title, "status": t.status, "priority": t.priority} for t in blocked],
        "team_workload": workload,
        "status_breakdown": {
            "todo": len([t for t in tasks if t.status == "todo"]),
            "in_progress": len([t for t in tasks if t.status == "in_progress"]),
            "done": len([t for t in tasks if t.status == "done"]),
        },
    }


async def analyze_project_risk(project_id: str, db: AsyncSession) -> dict:
    context = await fetch_risk_context(project_id, db)
    if not context:
        return {"risk_level": "low", "top_risks": [], "recommendations": []}

    response = await openai_client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": RISK_ANALYSIS_SYSTEM},
            {"role": "user", "content": json.dumps(context, indent=2)},
        ],
        response_format={"type": "json_object"},
        max_tokens=1500,
    )
    raw = response.choices[0].message.content or "{}"
    return json.loads(raw)


def fuzzy_match_member(mention: str | None, members: list[tuple[ProjectMember, User]]) -> str | None:
    if not mention or not members:
        return None
    mention_lower = mention.strip().lower()
    best_score = 0.0
    best_id = None
    for _member, user in members:
        if not user.name:
            continue
        name_lower = user.name.lower()
        score = SequenceMatcher(None, mention_lower, name_lower).ratio()
        if mention_lower in name_lower or name_lower in mention_lower:
            score = max(score, 0.85)
        first = name_lower.split()[0] if name_lower else ""
        if first and (mention_lower == first or mention_lower in first):
            score = max(score, 0.9)
        if score > best_score:
            best_score = score
            best_id = str(user.id)
    return best_id if best_score >= 0.6 else None


async def extract_tasks_from_transcript(
    transcript: str,
    project_id: str,
    db: AsyncSession,
) -> list[dict]:
    members_result = await db.execute(
        select(ProjectMember, User)
        .join(User, User.id == ProjectMember.user_id)
        .where(ProjectMember.project_id == project_id)
    )
    members = members_result.all()
    member_names = [m.User.name for m in members if m.User.name]

    response = await openai_client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": TRANSCRIPT_SYSTEM},
            {"role": "user", "content": f"Team members: {', '.join(member_names) or 'Unknown'}\n\nTranscript:\n{transcript}"},
        ],
        response_format={"type": "json_object"},
        max_tokens=2000,
    )
    raw = response.choices[0].message.content or "{}"
    tasks = json.loads(raw).get("tasks", [])

    results = []
    for item in tasks:
        assignee_id = fuzzy_match_member(item.get("assignee_mention"), members)
        results.append({
            "title": item.get("title", ""),
            "assignee_mention": item.get("assignee_mention"),
            "assignee_id": assignee_id,
            "due_date_mention": item.get("due_date_mention"),
            "priority": item.get("priority", "medium"),
        })
    return results


async def stream_improve_text(text: str, context: str) -> AsyncGenerator[str, None]:
    prompt = IMPROVE_TEXT_PROMPTS.get(context, IMPROVE_TEXT_PROMPTS["task_description"])
    stream = await openai_client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": prompt},
            {"role": "user", "content": text},
        ],
        stream=True,
        max_tokens=1000,
    )
    async for chunk in stream:
        delta = chunk.choices[0].delta.content if chunk.choices else None
        if delta:
            yield delta
