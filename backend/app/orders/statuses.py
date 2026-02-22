"""Order status constants and transition rules."""
from __future__ import annotations

STATUS_PLACED = "placed"
STATUS_ACCEPTED = "accepted"
STATUS_NEW = STATUS_PLACED
STATUS_PREPARING = "preparing"
STATUS_READY = "ready"
STATUS_ASSIGNED = "assigned"
STATUS_PICKED_UP = "picked_up"
STATUS_DELIVERED = "delivered"
STATUS_DECLINED = "declined"
STATUS_CANCELLED = "cancelled"

STATUSES = [
    STATUS_PLACED,
    STATUS_ACCEPTED,
    STATUS_PREPARING,
    STATUS_READY,
    STATUS_ASSIGNED,
    STATUS_PICKED_UP,
    STATUS_DELIVERED,
    STATUS_DECLINED,
    STATUS_CANCELLED,
]

TERMINAL = {STATUS_DELIVERED, STATUS_DECLINED, STATUS_CANCELLED}

ROLE_TRANSITIONS = {
    "vendor": {
        STATUS_PLACED: {STATUS_ACCEPTED, STATUS_PREPARING, STATUS_DECLINED},
        STATUS_ACCEPTED: {STATUS_PREPARING},
        STATUS_PREPARING: {STATUS_READY},
        STATUS_READY: {STATUS_PICKED_UP},
        STATUS_PICKED_UP: {STATUS_DELIVERED},
    },
    "driver": {
        STATUS_READY: {STATUS_ASSIGNED},
        STATUS_ASSIGNED: {STATUS_PICKED_UP},
        STATUS_PICKED_UP: {STATUS_DELIVERED},
    },
    "customer": {
        STATUS_PLACED: {STATUS_CANCELLED},
        STATUS_ACCEPTED: {STATUS_CANCELLED},
    },
    "admin": "ANY",
}

_STATUS_ALIASES = {
    # Canonical uppercase values
    "PLACED": STATUS_PLACED,
    "NEW": STATUS_PLACED,
    "PREPARING": STATUS_PREPARING,
    "READY": STATUS_READY,
    "ASSIGNED": STATUS_ASSIGNED,
    "PICKED_UP": STATUS_PICKED_UP,
    "PICKEDUP": STATUS_PICKED_UP,
    "ACCEPTED": STATUS_ACCEPTED,
    "DELIVERED": STATUS_DELIVERED,
    "DECLINED": STATUS_DECLINED,
    "CANCELLED": STATUS_CANCELLED,
    "CANCELED": STATUS_CANCELLED,
    "COMPLETED": STATUS_DELIVERED,
    # Legacy aliases
    "CREATED": STATUS_PLACED,
    "SENT_TO_VENDOR": STATUS_PLACED,
    "SENTTOVENDOR": STATUS_PLACED,
    "NEEDS_REASSIGN": STATUS_READY,
    "NEEDSREASSIGN": STATUS_READY,
}


def normalize_status(status: str) -> str:
    if status is None:
        raise ValueError("Missing status")
    raw = str(status).strip()
    if not raw:
        raise ValueError("Missing status")
    if raw in STATUSES:
        return raw
    key = raw.upper().replace(" ", "_")
    mapped = _STATUS_ALIASES.get(key)
    if mapped:
        return mapped
    raise ValueError(f"Invalid status: {status}")


def validate_transition(current_status: str, next_status: str, role: str, *, allow_admin_override: bool = False) -> None:
    current = normalize_status(current_status)
    next_norm = normalize_status(next_status)

    if current == next_norm:
        return

    if role == "admin":
        if current in TERMINAL and next_norm not in TERMINAL and not allow_admin_override:
            raise ValueError("Cannot change status from terminal state")
        return

    if current in TERMINAL:
        raise ValueError("Cannot change status from terminal state")

    role_rules = ROLE_TRANSITIONS.get(role)
    if role_rules is None or role_rules == "ANY":
        raise ValueError("Unknown actor role")

    allowed = role_rules.get(current, set())
    if next_norm not in allowed:
        raise ValueError(f"Role '{role}' cannot move from {current} to {next_norm}")
