"""Simple request validation helpers."""
import re

EMAIL_RE = re.compile(r"^[^@]+@[^@]+\.[^@]+$")


def validate_email(email: str) -> bool:
    return bool(email and EMAIL_RE.match(email.strip()))


def validate_required(data: dict, keys: list) -> list:
    """Return list of missing keys."""
    return [k for k in keys if not data.get(k)]


def validate_positive_int(value, key: str) -> tuple:
    """Return (None, None) if valid else (error_message, 400)."""
    try:
        n = int(value)
        if n < 0:
            return f"{key} must be non-negative", 400
        return None, None
    except (TypeError, ValueError):
        return f"{key} must be an integer", 400
