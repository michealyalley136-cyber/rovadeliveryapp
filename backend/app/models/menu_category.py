"""MenuCategory model."""
from datetime import datetime

from ..extensions import db


class MenuCategory(db.Model):
    __tablename__ = "menu_categories"

    id = db.Column(db.Integer, primary_key=True)
    vendor_id = db.Column(db.Integer, db.ForeignKey("vendors.id"), nullable=False, index=True)
    name = db.Column(db.String(255), nullable=False)
    sort_order = db.Column(db.Integer, nullable=False, default=0)
    is_active = db.Column(db.Boolean, default=True)

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    items = db.relationship("MenuItem", backref="category", lazy="dynamic")

    def __repr__(self):
        return f"<MenuCategory {self.name}>"
