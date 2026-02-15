"""DriverOffer: one offer per (order, driver) with 15s window."""
from datetime import datetime
from ..extensions import db


class DriverOffer(db.Model):
    __tablename__ = "driver_offers"

    STATUS_PENDING = "PENDING"
    STATUS_ACCEPTED = "ACCEPTED"
    STATUS_DECLINED = "DECLINED"
    STATUS_EXPIRED = "EXPIRED"
    STATUSES = (STATUS_PENDING, STATUS_ACCEPTED, STATUS_DECLINED, STATUS_EXPIRED)

    id = db.Column(db.Integer, primary_key=True)
    order_id = db.Column(db.Integer, db.ForeignKey("orders.id"), nullable=False)
    driver_id = db.Column(db.Integer, db.ForeignKey("drivers.id"), nullable=False)
    status = db.Column(db.String(20), nullable=False, default=STATUS_PENDING, index=True)
    offered_at = db.Column(db.DateTime, default=datetime.utcnow)
    expires_at = db.Column(db.DateTime, nullable=False)

    order = db.relationship("Order", backref=db.backref("driver_offers", lazy="dynamic"))
    driver = db.relationship("Driver", backref=db.backref("offers", lazy="dynamic"))

    def __repr__(self):
        return f"<DriverOffer {self.id} order={self.order_id} driver={self.driver_id} {self.status}>"
