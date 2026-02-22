"""Order and OrderItem models."""
from datetime import datetime

from ..extensions import db
from ..orders.statuses import (
    STATUSES as ORDER_STATUSES,
    STATUS_PLACED,
    STATUS_ACCEPTED,
    STATUS_NEW,
    STATUS_PREPARING,
    STATUS_READY,
    STATUS_ASSIGNED,
    STATUS_PICKED_UP,
    STATUS_DELIVERED,
    STATUS_DECLINED,
    STATUS_CANCELLED,
    normalize_status,
    validate_transition,
)


class Order(db.Model):
    __tablename__ = "orders"

    STATUS_PLACED = STATUS_PLACED
    STATUS_ACCEPTED = STATUS_ACCEPTED
    STATUS_NEW = STATUS_NEW
    STATUS_PREPARING = STATUS_PREPARING
    STATUS_READY = STATUS_READY
    STATUS_ASSIGNED = STATUS_ASSIGNED
    STATUS_PICKED_UP = STATUS_PICKED_UP
    STATUS_DELIVERED = STATUS_DELIVERED
    STATUS_DECLINED = STATUS_DECLINED
    STATUS_CANCELLED = STATUS_CANCELLED

    DRIVER_STATUS_ASSIGNED = "assigned"
    DRIVER_STATUS_ACCEPTED = "accepted"
    DRIVER_STATUS_PICKED_UP = "picked_up"
    DRIVER_STATUS_DELIVERED = "delivered"

    PAYMENT_METHOD_CASH = "cash"
    PAYMENT_METHOD_MOMO = "momo"
    PAYMENT_METHOD_CARD = "card"
    PAYMENT_METHODS = (PAYMENT_METHOD_CASH, PAYMENT_METHOD_MOMO, PAYMENT_METHOD_CARD)

    PAYMENT_STATUS_PENDING = "pending"
    PAYMENT_STATUS_PAID = "paid"
    PAYMENT_STATUSES = (PAYMENT_STATUS_PENDING, PAYMENT_STATUS_PAID)

    STATUSES = tuple(ORDER_STATUSES)

    id = db.Column(db.Integer, primary_key=True)
    customer_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    vendor_id = db.Column(db.Integer, db.ForeignKey("vendors.id"), nullable=False)
    driver_id = db.Column(db.Integer, db.ForeignKey("drivers.id"), nullable=True)
    driver_status = db.Column(db.String(30), nullable=True)
    delivery_address_id = db.Column(db.Integer, db.ForeignKey("addresses.id"), nullable=False)

    status = db.Column(db.String(30), nullable=False, default=STATUS_PLACED, index=True)
    customer_name = db.Column(db.String(255), nullable=True)
    customer_phone = db.Column(db.String(50), nullable=True)
    order_public_token = db.Column(db.String(64), nullable=True, index=True)
    items_snapshot = db.Column(db.Text, nullable=True)
    subtotal_cents = db.Column(db.Integer, nullable=False)
    delivery_fee_cents = db.Column(db.Integer, nullable=False)
    service_fee_cents = db.Column(db.Integer, nullable=False, default=0)
    total_cents = db.Column(db.Integer, nullable=False)
    payment_method = db.Column(db.String(20), nullable=False, default=PAYMENT_METHOD_CASH)
    payment_status = db.Column(db.String(20), nullable=False, default=PAYMENT_STATUS_PAID)
    # Hybrid pricing (GHS)
    delivery_distance_km = db.Column(db.Float, nullable=True)
    delivery_fee_ghs = db.Column(db.Float, nullable=True)
    service_fee_ghs = db.Column(db.Float, nullable=True)
    subtotal_ghs = db.Column(db.Float, nullable=True)
    total_ghs = db.Column(db.Float, nullable=True)

    placed_at = db.Column(db.DateTime, nullable=True)
    accepted_at = db.Column(db.DateTime, nullable=True)
    prepared_at = db.Column(db.DateTime, nullable=True)
    assigned_at = db.Column(db.DateTime, nullable=True)
    picked_up_at = db.Column(db.DateTime, nullable=True)
    delivered_at = db.Column(db.DateTime, nullable=True)
    declined_at = db.Column(db.DateTime, nullable=True)
    cancelled_at = db.Column(db.DateTime, nullable=True)

    driver_lat = db.Column(db.Float, nullable=True)
    driver_lng = db.Column(db.Float, nullable=True)
    driver_location_updated_at = db.Column(db.DateTime, nullable=True)

    offer_expires_at = db.Column(db.DateTime, nullable=True)  # driver offer 15s window
    offered_driver_ids = db.Column(db.String(255), nullable=True)  # comma-separated, for retry
    notes = db.Column(db.Text, nullable=True)
    cancel_reason = db.Column(db.Text, nullable=True)
    refund_required = db.Column(db.Boolean, nullable=False, default=False)
    refund_note = db.Column(db.Text, nullable=True)
    internal_notes = db.Column(db.Text, nullable=True)
    discount_cents = db.Column(db.Integer, nullable=False, default=0)
    promo_code = db.Column(db.String(50), nullable=True)

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    items = db.relationship("OrderItem", backref="order", lazy="dynamic", cascade="all, delete-orphan")

    def set_status(self, next_status: str, role: str, *, allow_admin_override: bool = False) -> str:
        current = normalize_status(self.status)
        next_norm = normalize_status(next_status)

        if role == "vendor":
            method = (self.payment_method or "").lower()
            status = (self.payment_status or "").lower()
            if method in (self.PAYMENT_METHOD_MOMO, self.PAYMENT_METHOD_CARD) and status != self.PAYMENT_STATUS_PAID:
                if next_norm not in (self.STATUS_DECLINED, self.STATUS_CANCELLED):
                    raise ValueError("Awaiting payment")

        validate_transition(current, next_norm, role, allow_admin_override=allow_admin_override)

        if current == next_norm:
            return next_norm

        now = datetime.utcnow()
        if next_norm == self.STATUS_PLACED:
            if self.placed_at is None:
                self.placed_at = now
        elif next_norm == self.STATUS_ACCEPTED:
            self.accepted_at = now
        elif next_norm == self.STATUS_PREPARING:
            self.prepared_at = now
        elif next_norm == self.STATUS_ASSIGNED:
            self.assigned_at = now
            if not self.driver_status:
                self.driver_status = self.DRIVER_STATUS_ASSIGNED
        elif next_norm == self.STATUS_PICKED_UP:
            self.picked_up_at = now
            self.driver_status = self.DRIVER_STATUS_PICKED_UP
        elif next_norm == self.STATUS_DELIVERED:
            self.delivered_at = now
            self.driver_status = self.DRIVER_STATUS_DELIVERED
        elif next_norm == self.STATUS_DECLINED:
            self.declined_at = now
        elif next_norm == self.STATUS_CANCELLED:
            self.cancelled_at = now

        self.status = next_norm
        return next_norm

    def __repr__(self):
        return f"<Order {self.id} {self.status}>"


class OrderItem(db.Model):
    __tablename__ = "order_items"

    id = db.Column(db.Integer, primary_key=True)
    order_id = db.Column(db.Integer, db.ForeignKey("orders.id"), nullable=False)
    menu_item_id = db.Column(db.Integer, db.ForeignKey("menu_items.id"), nullable=False)
    quantity = db.Column(db.Integer, nullable=False)
    unit_price_cents = db.Column(db.Integer, nullable=False)  # snapshot at order time
    notes = db.Column(db.Text, nullable=True)
    allow_substitution = db.Column(db.Boolean, nullable=False, default=False)
    substitution_note = db.Column(db.Text, nullable=True)

    def __repr__(self):
        return f"<OrderItem order={self.order_id} qty={self.quantity}>"
