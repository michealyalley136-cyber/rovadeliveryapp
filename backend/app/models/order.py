"""Order and OrderItem models."""
from datetime import datetime
from ..extensions import db


class Order(db.Model):
    __tablename__ = "orders"

    STATUS_CREATED = "Created"
    STATUS_SENT_TO_VENDOR = "SentToVendor"
    STATUS_ACCEPTED = "Accepted"
    STATUS_PREPARING = "Preparing"
    STATUS_READY = "Ready"
    STATUS_ASSIGNED = "Assigned"
    STATUS_PICKED_UP = "PickedUp"
    STATUS_DELIVERED = "Delivered"
    STATUS_CANCELLED = "Cancelled"
    STATUS_NEEDS_REASSIGN = "NEEDS_REASSIGN"

    STATUSES = (
        STATUS_CREATED,
        STATUS_SENT_TO_VENDOR,
        STATUS_ACCEPTED,
        STATUS_PREPARING,
        STATUS_READY,
        STATUS_ASSIGNED,
        STATUS_PICKED_UP,
        STATUS_DELIVERED,
        STATUS_CANCELLED,
        STATUS_NEEDS_REASSIGN,
    )

    id = db.Column(db.Integer, primary_key=True)
    customer_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    vendor_id = db.Column(db.Integer, db.ForeignKey("vendors.id"), nullable=False)
    driver_id = db.Column(db.Integer, db.ForeignKey("drivers.id"), nullable=True)
    delivery_address_id = db.Column(db.Integer, db.ForeignKey("addresses.id"), nullable=False)

    status = db.Column(db.String(30), nullable=False, default=STATUS_CREATED, index=True)
    customer_name = db.Column(db.String(255), nullable=True)
    customer_phone = db.Column(db.String(50), nullable=True)
    order_public_token = db.Column(db.String(64), nullable=True, index=True)
    items_snapshot = db.Column(db.Text, nullable=True)
    subtotal_cents = db.Column(db.Integer, nullable=False)
    delivery_fee_cents = db.Column(db.Integer, nullable=False)
    total_cents = db.Column(db.Integer, nullable=False)
    # Hybrid pricing (GHS)
    delivery_distance_km = db.Column(db.Float, nullable=True)
    delivery_fee_ghs = db.Column(db.Float, nullable=True)
    subtotal_ghs = db.Column(db.Float, nullable=True)
    total_ghs = db.Column(db.Float, nullable=True)

    vendor_accepted_at = db.Column(db.DateTime, nullable=True)
    driver_assigned_at = db.Column(db.DateTime, nullable=True)
    picked_up_at = db.Column(db.DateTime, nullable=True)
    delivered_at = db.Column(db.DateTime, nullable=True)

    offer_expires_at = db.Column(db.DateTime, nullable=True)  # driver offer 15s window
    offered_driver_ids = db.Column(db.String(255), nullable=True)  # comma-separated, for retry
    notes = db.Column(db.Text, nullable=True)

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    items = db.relationship("OrderItem", backref="order", lazy="dynamic", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Order {self.id} {self.status}>"


class OrderItem(db.Model):
    __tablename__ = "order_items"

    id = db.Column(db.Integer, primary_key=True)
    order_id = db.Column(db.Integer, db.ForeignKey("orders.id"), nullable=False)
    menu_item_id = db.Column(db.Integer, db.ForeignKey("menu_items.id"), nullable=False)
    quantity = db.Column(db.Integer, nullable=False)
    unit_price_cents = db.Column(db.Integer, nullable=False)  # snapshot at order time

    def __repr__(self):
        return f"<OrderItem order={self.order_id} qty={self.quantity}>"
