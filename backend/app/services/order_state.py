"""Order status transitions + side effects (auto-dispatch on ready)."""
from datetime import datetime
from typing import Optional

from ..extensions import db
from ..models import Order
from .dispatch import dispatch_order


class OrderStatusError(Exception):
    pass


_STATUS_ALIASES = {
    # New canonical statuses
    "NEW": Order.STATUS_NEW,
    "PREPARING": Order.STATUS_PREPARING,
    "READY": Order.STATUS_READY,
    "ASSIGNED": Order.STATUS_ASSIGNED,
    "PICKED_UP": Order.STATUS_PICKED_UP,
    "PICKEDUP": Order.STATUS_PICKED_UP,
    "DELIVERED": Order.STATUS_DELIVERED,
    "CANCELLED": Order.STATUS_CANCELLED,
    # Legacy aliases
    "CREATED": Order.STATUS_NEW,
    "SENT_TO_VENDOR": Order.STATUS_NEW,
    "SENTTOVENDOR": Order.STATUS_NEW,
    "ACCEPTED": Order.STATUS_PREPARING,
    "PREPARING": Order.STATUS_PREPARING,
    "READY": Order.STATUS_READY,
    "ASSIGNED": Order.STATUS_ASSIGNED,
    "PICKED_UP": Order.STATUS_PICKED_UP,
    "PICKEDUP": Order.STATUS_PICKED_UP,
    "DELIVERED": Order.STATUS_DELIVERED,
    "CANCELLED": Order.STATUS_CANCELLED,
}


def normalize_status(status: str) -> str:
    if not status:
        raise OrderStatusError("Missing status")
    key = status.strip().upper().replace(" ", "_")
    mapped = _STATUS_ALIASES.get(key)
    if not mapped:
        raise OrderStatusError(f"Invalid status: {status}")
    return mapped


def validate_transition(current_status: str, next_status: str, actor_role: Optional[str]) -> None:
    current = normalize_status(current_status)
    next_norm = normalize_status(next_status)

    if current == next_norm:
        return

    if current in (Order.STATUS_DELIVERED, Order.STATUS_CANCELLED):
        if actor_role == "admin_override":
            return
        raise OrderStatusError("Cannot change status from terminal state")

    if actor_role == "admin":
        return

    allowed = set()
    if actor_role == "vendor":
        allowed = {
            (Order.STATUS_NEW, Order.STATUS_PREPARING),
            (Order.STATUS_PREPARING, Order.STATUS_READY),
        }
    elif actor_role == "driver":
        allowed = {
            (Order.STATUS_READY, Order.STATUS_ASSIGNED),
            (Order.STATUS_ASSIGNED, Order.STATUS_PICKED_UP),
            (Order.STATUS_PICKED_UP, Order.STATUS_DELIVERED),
        }
    elif actor_role == "customer":
        allowed = {
            (Order.STATUS_NEW, Order.STATUS_CANCELLED),
        }
    else:
        raise OrderStatusError("Unknown actor role")

    if (current, next_norm) not in allowed:
        raise OrderStatusError(f"Cannot move from {current} to {next_norm}")


def set_order_status(order: Order, new_status: str, actor: Optional[str] = None) -> Order:
    """Validate and persist order status transitions. Auto-dispatch on ready."""
    if not order:
        raise OrderStatusError("Order not found")

    new_status_norm = normalize_status(new_status)
    current = order.status

    validate_transition(current, new_status_norm, actor_role=actor)

    now = datetime.utcnow()
    if new_status_norm == Order.STATUS_NEW:
        if order.placed_at is None:
            order.placed_at = now
    if new_status_norm == Order.STATUS_PREPARING:
        order.prepared_at = now
    if new_status_norm == Order.STATUS_ASSIGNED:
        order.assigned_at = now
    if new_status_norm == Order.STATUS_PICKED_UP:
        order.picked_up_at = now
    if new_status_norm == Order.STATUS_DELIVERED:
        order.delivered_at = now
    if new_status_norm == Order.STATUS_CANCELLED:
        order.cancelled_at = now

    if current != new_status_norm:
        order.status = new_status_norm
        db.session.commit()
    elif new_status_norm == Order.STATUS_READY:
        db.session.commit()

    if new_status_norm == Order.STATUS_READY:
        dispatch_order(order.id)
        db.session.refresh(order)

    return order
