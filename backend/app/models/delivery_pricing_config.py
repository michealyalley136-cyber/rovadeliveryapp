"""Single active row: delivery pricing (base_km, base_fee_ghs, per_km_fee_ghs)."""
from datetime import datetime
from ..extensions import db


class DeliveryPricingConfig(db.Model):
    __tablename__ = "delivery_pricing_config"

    id = db.Column(db.Integer, primary_key=True)
    base_km = db.Column(db.Float, nullable=False, default=3.0)
    base_fee_ghs = db.Column(db.Numeric(10, 2), nullable=False, default=12)
    per_km_fee_ghs = db.Column(db.Numeric(10, 2), nullable=False, default=2)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            "base_km": float(self.base_km),
            "base_fee_ghs": float(self.base_fee_ghs),
            "per_km_fee_ghs": float(self.per_km_fee_ghs),
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
