"""
Project role enum for RBAC.

Defines the standard roles available for project members.
"""

from enum import Enum


class ProjectRole(str, Enum):
    """Roles that a user can have within a project."""

    OWNER = "owner"
    ADMIN = "admin"
    MEMBER = "member"
    VIEWER = "viewer"

    @classmethod
    def all_values(cls) -> list[str]:
        return [r.value for r in cls]
