"""Promo codes for discounts."""
from datetime import datetime

from ..extensions import db


class PromoCode(db.Model):
    __tablename__ = "promo_codes"

    TYPE_PERCENT = "percent"
    TYPE_FIXED = "fixed"
    TYPES = (TYPE_PERCENT, TYPE_FIXED)

    id = db.Column(db.Integer, primary_key=True)
    code = db.Column(db.String(50), unique=True, nullable=False, index=True)
    type = db.Column(db.String(20), nullable=False)
    value = db.Column(db.Integer, nullable=False)  # percent (0-100) or fixed cents
    max_uses = db.Column(db.Integer, nullable=True)
    used_count = db.Column(db.Integer, nullable=False, default=0)
    expires_at = db.Column(db.DateTime, nullable=True)
    is_active = db.Column(db.Boolean, nullable=False, default=True)

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def __repr__(self):
        return f"<PromoCode {self.code} {self.type}:{self.value}>"
