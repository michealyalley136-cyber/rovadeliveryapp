"""Driver model."""
from datetime import datetime
from ..extensions import db


class Driver(db.Model):
    __tablename__ = "drivers"

    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(255), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    full_name = db.Column(db.String(255), nullable=True)
    phone = db.Column(db.String(50), nullable=True)
    driver_pin_hash = db.Column(db.String(255), nullable=True)
    driver_is_active = db.Column(db.Boolean, default=True)

    is_online = db.Column(db.Boolean, default=False)
    last_known_lat = db.Column(db.Float, nullable=True)
    last_known_lng = db.Column(db.Float, nullable=True)
    last_location_at = db.Column(db.DateTime, nullable=True)

    approved = db.Column(db.Boolean, default=False)
    fleet_partner_id = db.Column(db.Integer, db.ForeignKey("fleet_partners.id"), nullable=True)

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    fleet_partner = db.relationship("FleetPartner", backref="drivers")
    orders = db.relationship("Order", backref="driver", lazy="dynamic", foreign_keys="Order.driver_id")
    ratings_received = db.relationship("Rating", backref="driver", lazy="dynamic", foreign_keys="Rating.driver_id")

    def __repr__(self):
        return f"<Driver {self.email}>"
