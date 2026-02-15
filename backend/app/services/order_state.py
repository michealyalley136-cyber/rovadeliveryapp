"""Order status transitions + side effects (auto-dispatch on Ready)."""
from datetime import datetime
from typing import Optional

from ..extensions import db
from ..models import Order
from .dispatch import dispatch_order


class OrderStatusError(Exception):
    pass


_STATUS_ALIASES = {
    "CREATED": Order.STATUS_CREATED,
    "SENT_TO_VENDOR": Order.STATUS_SENT_TO_VENDOR,
    "SENTTOVENDOR": Order.STATUS_SENT_TO_VENDOR,
    "ACCEPTED": Order.STATUS_ACCEPTED,
    "PREPARING": Order.STATUS_PREPARING,
    "READY": Order.STATUS_READY,
    "ASSIGNED": Order.STATUS_ASSIGNED,
    "PICKED_UP": Order.STATUS_PICKED_UP,
    "PICKEDUP": Order.STATUS_PICKED_UP,
    "DELIVERED": Order.STATUS_DELIVERED,
    "CANCELLED": Order.STATUS_CANCELLED,
    "NEEDS_REASSIGN": Order.STATUS_NEEDS_REASSIGN,
    "NEEDSREASSIGN": Order.STATUS_NEEDS_REASSIGN,
}


def _normalize_status(status: str) -> str:
    if not status:
        raise OrderStatusError("Missing status")
    key = status.strip().upper().replace(" ", "_")
    mapped = _STATUS_ALIASES.get(key)
    if not mapped:
        raise OrderStatusError(f"Invalid status: {status}")
    return mapped


def _validate_transition(current: str, new_status: str, actor: Optional[str] = None) -> None:
    if current == new_status:
        return
    if current in (Order.STATUS_CANCELLED, Order.STATUS_DELIVERED):
        raise OrderStatusError(f"Cannot change status from {current}")

    if new_status == Order.STATUS_DELIVERED:
        if actor == "vendor" and current in (Order.STATUS_ASSIGNED, Order.STATUS_READY):
            return
        if actor == "driver" and current in (Order.STATUS_ASSIGNED, Order.STATUS_PICKED_UP):
            return

    allowed = {
        Order.STATUS_ACCEPTED: {Order.STATUS_CREATED, Order.STATUS_SENT_TO_VENDOR},
        Order.STATUS_PREPARING: {Order.STATUS_CREATED, Order.STATUS_SENT_TO_VENDOR, Order.STATUS_ACCEPTED},
        Order.STATUS_READY: {Order.STATUS_ACCEPTED, Order.STATUS_PREPARING},
        Order.STATUS_ASSIGNED: {Order.STATUS_READY, Order.STATUS_NEEDS_REASSIGN},
        Order.STATUS_PICKED_UP: {Order.STATUS_ASSIGNED},
        Order.STATUS_DELIVERED: {Order.STATUS_PICKED_UP},
        Order.STATUS_CANCELLED: {Order.STATUS_CREATED, Order.STATUS_SENT_TO_VENDOR, Order.STATUS_ACCEPTED, Order.STATUS_PREPARING},
        Order.STATUS_SENT_TO_VENDOR: {Order.STATUS_CREATED},
    }.get(new_status)

    if allowed is None or current not in allowed:
        raise OrderStatusError(f"Cannot move from {current} to {new_status}")


def set_order_status(order: Order, new_status: str, actor: Optional[str] = None) -> Order:
    """Validate and persist order status transitions. Auto-dispatch on Ready."""
    if not order:
        raise OrderStatusError("Order not found")

    new_status_norm = _normalize_status(new_status)
    current = order.status

    _validate_transition(current, new_status_norm, actor=actor)

    now = datetime.utcnow()
    if new_status_norm == Order.STATUS_ACCEPTED:
        order.vendor_accepted_at = now
    if new_status_norm == Order.STATUS_PREPARING:
        if order.vendor_accepted_at is None:
            order.vendor_accepted_at = now
    if new_status_norm == Order.STATUS_ASSIGNED:
        order.driver_assigned_at = now
    if new_status_norm == Order.STATUS_PICKED_UP:
        order.picked_up_at = now
    if new_status_norm == Order.STATUS_DELIVERED:
        order.delivered_at = now

    if current != new_status_norm:
        order.status = new_status_norm
        db.session.commit()
    elif new_status_norm == Order.STATUS_READY:
        # Ready is idempotent but can still trigger dispatch.
        db.session.commit()

    if new_status_norm == Order.STATUS_READY:
        dispatch_order(order.id)
        db.session.refresh(order)

    return order
