"""Vendor model (WHATSAPP or DASHBOARD)."""
from datetime import datetime
from ..extensions import db


class Vendor(db.Model):
    __tablename__ = "vendors"

    VENDOR_TYPE_WHATSAPP = "WHATSAPP"
    VENDOR_TYPE_DASHBOARD = "DASHBOARD"
    VENDOR_TYPES = (VENDOR_TYPE_WHATSAPP, VENDOR_TYPE_DASHBOARD)

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(255), nullable=False)
    description = db.Column(db.Text, nullable=True)
    phone = db.Column(db.String(50), nullable=True)
    hours = db.Column(db.JSON, nullable=True)
    delivery_radius_km = db.Column(db.Float, nullable=True)
    minimum_order_amount = db.Column(db.Float, nullable=True)
    prep_time_minutes = db.Column(db.Integer, nullable=True)
    base_delivery_fee_ghs = db.Column(db.Float, nullable=True)
    per_km_fee_ghs = db.Column(db.Float, nullable=True)
    service_fee_percent = db.Column(db.Float, nullable=True)
    minimum_service_fee_ghs = db.Column(db.Float, nullable=True)
    logo_url = db.Column(db.String(500), nullable=True)
    banner_url = db.Column(db.String(500), nullable=True)
    vendor_type = db.Column(db.String(20), nullable=False, default=VENDOR_TYPE_DASHBOARD)
    whatsapp_number = db.Column(db.String(50), nullable=True)  # for WHATSAPP type
    pin_hash = db.Column(db.String(255), nullable=True)
    vendor_pin_hash = db.Column(db.String(255), nullable=True)
    lat = db.Column(db.Float, nullable=True)
    lng = db.Column(db.Float, nullable=True)
    approved = db.Column(db.Boolean, default=False)
    vendor_is_active = db.Column(db.Boolean, default=True)

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    menu_items = db.relationship("MenuItem", backref="vendor", lazy="dynamic")
    orders = db.relationship("Order", backref="vendor", lazy="dynamic")
    ratings_received = db.relationship("Rating", backref="vendor", lazy="dynamic", foreign_keys="Rating.vendor_id")

    def __repr__(self):
        return f"<Vendor {self.name}>"
