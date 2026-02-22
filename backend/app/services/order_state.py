"""Order status transitions + side effects (auto-dispatch on ready)."""
from typing import Optional

from ..extensions import db
from ..models import Order
from ..orders.statuses import (
    STATUS_READY,
    normalize_status as _normalize_status,
    validate_transition as _validate_transition,
)
from .dispatch import dispatch_order


class OrderStatusError(Exception):
    pass


def normalize_status(status: str) -> str:
    try:
        return _normalize_status(status)
    except ValueError as e:
        raise OrderStatusError(str(e)) from e


def validate_transition(current_status: str, next_status: str, actor_role: Optional[str], *, allow_admin_override: bool = False) -> None:
    try:
        _validate_transition(current_status, next_status, actor_role, allow_admin_override=allow_admin_override)
    except ValueError as e:
        raise OrderStatusError(str(e)) from e


def set_order_status(
    order: Order,
    new_status: str,
    actor: Optional[str] = None,
    *,
    allow_admin_override: bool = False,
    dispatch_on_ready: bool = True,
) -> Order:
    """Validate and persist order status transitions. Auto-dispatch on ready."""
    if not order:
        raise OrderStatusError("Order not found")

    current = normalize_status(order.status)
    try:
        next_norm = order.set_status(new_status, actor or "", allow_admin_override=allow_admin_override)
    except ValueError as e:
        raise OrderStatusError(str(e)) from e

    if current != next_norm:
        db.session.commit()
    elif next_norm == STATUS_READY:
        db.session.commit()

    if dispatch_on_ready and next_norm == STATUS_READY:
        dispatch_order(order.id)
        db.session.refresh(order)

    return order
