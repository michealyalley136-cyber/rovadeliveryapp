"""MenuItem model."""
from datetime import datetime

from ..extensions import db
from .addon import menu_item_addon_groups


class MenuItem(db.Model):
    __tablename__ = "menu_items"

    id = db.Column(db.Integer, primary_key=True)
    vendor_id = db.Column(db.Integer, db.ForeignKey("vendors.id"), nullable=False)
    category_id = db.Column(
        db.Integer,
        db.ForeignKey("menu_categories.id", ondelete="SET NULL"),
        nullable=True,
    )
    name = db.Column(db.String(255), nullable=False)
    description = db.Column(db.Text, nullable=True)
    price_cents = db.Column(db.Integer, nullable=False)  # store in cents
    image_url = db.Column(db.String(500), nullable=True)
    is_available = db.Column(db.Boolean, default=True)

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    order_items = db.relationship("OrderItem", backref="menu_item", lazy="dynamic")
    addon_groups = db.relationship(
        "AddOnGroup",
        secondary=menu_item_addon_groups,
        lazy="subquery",
        backref=db.backref("menu_items", lazy="dynamic"),
    )

    def __repr__(self):
        return f"<MenuItem {self.name}>"
