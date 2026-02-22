"""Add-on groups/options for menu items."""
from datetime import datetime

from ..extensions import db


menu_item_addon_groups = db.Table(
    "menu_item_addon_groups",
    db.Column("menu_item_id", db.Integer, db.ForeignKey("menu_items.id"), primary_key=True),
    db.Column("addon_group_id", db.Integer, db.ForeignKey("addon_groups.id"), primary_key=True),
)


class AddOnGroup(db.Model):
    __tablename__ = "addon_groups"

    id = db.Column(db.Integer, primary_key=True)
    vendor_id = db.Column(db.Integer, db.ForeignKey("vendors.id"), nullable=False, index=True)
    name = db.Column(db.String(255), nullable=False)
    min_select = db.Column(db.Integer, nullable=False, default=0)
    max_select = db.Column(db.Integer, nullable=False, default=0)
    sort_order = db.Column(db.Integer, nullable=False, default=0)
    is_active = db.Column(db.Boolean, default=True)

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    options = db.relationship("AddOnOption", backref="group", lazy="dynamic", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<AddOnGroup {self.name}>"


class AddOnOption(db.Model):
    __tablename__ = "addon_options"

    id = db.Column(db.Integer, primary_key=True)
    group_id = db.Column(db.Integer, db.ForeignKey("addon_groups.id"), nullable=False, index=True)
    name = db.Column(db.String(255), nullable=False)
    price_cents = db.Column(db.Integer, nullable=False, default=0)
    is_available = db.Column(db.Boolean, default=True)

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def __repr__(self):
        return f"<AddOnOption {self.name}>"
