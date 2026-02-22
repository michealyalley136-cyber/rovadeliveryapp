"""Ledger helpers for vendor credits."""
from __future__ import annotations

from sqlalchemy.exc import IntegrityError

from ..extensions import db
from ..models import Order, VendorLedgerEntry


def _normalize(value: str | None) -> str:
    return (value or "").strip().lower()


def _is_payment_settled(order: Order) -> bool:
    method = _normalize(order.payment_method)
    status = _normalize(order.payment_status)
    if method in (Order.PAYMENT_METHOD_MOMO, Order.PAYMENT_METHOD_CARD):
        return status == Order.PAYMENT_STATUS_PAID
    return True


def _credit_amount_cents(order: Order) -> int:
    subtotal = int(order.subtotal_cents or 0)
    discount = int(order.discount_cents or 0)
    return max(subtotal - discount, 0)


def _credit_amount_ghs(order: Order) -> float | None:
    if order.subtotal_ghs is None:
        return None
    discount_ghs = (order.discount_cents or 0) / 100.0
    return max(float(order.subtotal_ghs) - discount_ghs, 0.0)


def maybe_create_vendor_credit(order: Order) -> VendorLedgerEntry | None:
    if not order or order.status != Order.STATUS_DELIVERED:
        return None
    if not _is_payment_settled(order):
        return None

    existing = VendorLedgerEntry.query.filter_by(order_id=order.id).first()
    if existing:
        return existing

    entry = VendorLedgerEntry(
        vendor_id=order.vendor_id,
        order_id=order.id,
        amount_cents=_credit_amount_cents(order),
        amount_ghs=_credit_amount_ghs(order),
    )
    db.session.add(entry)
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return VendorLedgerEntry.query.filter_by(order_id=order.id).first()
    return entry
