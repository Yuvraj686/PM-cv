"""
RBAC permission dependencies for project routes.

Each function returns a FastAPI dependency that checks the current user's
role in the project. Uses the same pattern as the existing require_role()
in core/dependencies.py but maps to the new ProjectRole enum values.

Legacy roles (developer, project_lead) are mapped to their closest new
equivalents for backward compatibility.
"""

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from core.database import get_db
from core.dependencies import get_current_user

# ─── Role hierarchy (higher = more permissions) ───────────────────────────────
# owner > admin > member > viewer
# Legacy mappings: project_lead → admin, developer → member

# Roles that satisfy each permission level (including legacy values)
_OWNER_ROLES = {"owner", "admin"}
_ADMIN_ROLES = {"owner", "admin", "project_lead"}
_MEMBER_ROLES = {"owner", "admin", "member", "project_lead", "developer"}
_VIEWER_ROLES = {"owner", "admin", "member", "viewer", "project_lead", "developer"}


def _check_project_role(allowed_roles: set[str], action_label: str):
    """
    Factory that returns a FastAPI dependency checking that the current user
    has one of the allowed roles in the given project.

    The project_id MUST be a path parameter named 'project_id'.
    """

    async def role_checker(
        project_id: str,
        current_user=Depends(get_current_user),
        db: AsyncSession = Depends(get_db),
    ):
        from models.project_member import ProjectMember

        result = await db.execute(
            select(ProjectMember).where(
                ProjectMember.project_id == project_id,
                ProjectMember.user_id == str(current_user.id),
            )
        )
        membership = result.scalar_one_or_none()

        if not membership or membership.role not in allowed_roles:
            from utils.exceptions import ForbiddenError

            raise ForbiddenError(
                message=f"This action requires {action_label} permissions"
            )
        return current_user

    return role_checker


def require_project_owner():
    """Only project owner (or admin for backward compat) can perform this action."""
    return _check_project_role(_OWNER_ROLES, "project owner")


def require_project_admin():
    """Owner or admin can perform this action."""
    return _check_project_role(_ADMIN_ROLES, "project admin")


def require_project_member():
    """Owner, admin, or member can perform this action."""
    return _check_project_role(_MEMBER_ROLES, "project member")


def require_project_viewer():
    """Any project member (including viewers) can perform this action."""
    return _check_project_role(_VIEWER_ROLES, "project viewer")
