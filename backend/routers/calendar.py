from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from core.database import get_db
from sqlalchemy.orm import Session

router = APIRouter(prefix="/api/projects/{project_id}", tags=["Integrations"])


@router.get("/calendar.ics")
def export_ics(project_id: int, request: Request, db: Session = Depends(get_db)):
    """Export project tasks as ICS calendar."""
    request.query_params.get("token")
    # Validate token (HMAC of project_id + user_id, 30-day validity)
    # ...token validation logic...
    # Query tasks with due_date
    # ...fetch tasks...
    # Generate ICS text
    ics = """BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//ProjectHub//EN\n"""
    # for task in tasks:
    #     ics += ...
    ics += "END:VCALENDAR\n"
    return StreamingResponse(iter([ics]), media_type="text/calendar")
