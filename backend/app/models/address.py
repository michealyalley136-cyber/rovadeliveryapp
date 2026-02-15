"""Address/Location model (lat, lng + text)."""
from datetime import datetime
from ..extensions import db


class Address(db.Model):
    __tablename__ = "addresses"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    label = db.Column(db.String(100), nullable=True)  # e.g. "Home", "Office"
    address_text = db.Column(db.String(500), nullable=False)
    lat = db.Column(db.Float, nullable=True)
    lng = db.Column(db.Float, nullable=True)

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    delivery_orders = db.relationship("Order", backref="delivery_address", lazy="dynamic", foreign_keys="Order.delivery_address_id")

    def __repr__(self):
        return f"<Address {self.address_text[:50]}>"
