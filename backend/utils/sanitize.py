"""
Input sanitization utilities.

Strips potentially dangerous HTML/script content from user-supplied text
fields to prevent XSS and injection attacks.
"""

import bleach


def sanitize_html(text: str) -> str:
    """
    Remove all HTML tags from the input text.

    Uses bleach.clean() with an empty allow-list so that all tags
    are stripped while the text content is preserved.

    Args:
        text: Raw user input that may contain HTML.

    Returns:
        Cleaned text with all HTML tags removed.
    """
    if not text:
        return text
    return bleach.clean(text, tags=[], attributes={}, strip=True)
