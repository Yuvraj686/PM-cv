import base64
from datetime import datetime
from typing import Generic, List, Optional, TypeVar
from pydantic import BaseModel
from utils.exceptions import ValidationError

T = TypeVar("T")


class CursorPage(BaseModel, Generic[T]):
    items: List[T]
    next_cursor: Optional[str] = None
    has_more: bool


def encode_cursor(created_at: datetime, item_id: str) -> str:
    """Encode created_at datetime and item ID into a base64 cursor string."""
    dt_str = created_at.isoformat()
    raw_str = f"{dt_str}|{item_id}"
    return base64.b64encode(raw_str.encode("utf-8")).decode("utf-8")


def decode_cursor(cursor_str: str) -> tuple[datetime, str]:
    """Decode a base64 cursor string back into its constituent created_at and item ID values."""
    try:
        decoded_bytes = base64.b64decode(cursor_str.encode("utf-8"))
        decoded_str = decoded_bytes.decode("utf-8")
        dt_str, item_id = decoded_str.split("|", 1)
        dt = datetime.fromisoformat(dt_str)
        return dt, item_id
    except Exception:
        raise ValidationError(message="Invalid pagination cursor")
