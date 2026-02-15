"""Rating model (customer->driver, customer->vendor; protects driver from food-issue blame)."""
from datetime import datetime
from ..extensions import db


class Rating(db.Model):
    __tablename__ = "ratings"

    id = db.Column(db.Integer, primary_key=True)
    order_id = db.Column(db.Integer, db.ForeignKey("orders.id"), nullable=False)
    customer_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)

    driver_id = db.Column(db.Integer, db.ForeignKey("drivers.id"), nullable=True)
    driver_rating = db.Column(db.Integer, nullable=True)  # 1-5, delivery experience only
    driver_comment = db.Column(db.Text, nullable=True)

    vendor_id = db.Column(db.Integer, db.ForeignKey("vendors.id"), nullable=True)
    vendor_rating = db.Column(db.Integer, nullable=True)  # 1-5, food quality etc.
    vendor_comment = db.Column(db.Text, nullable=True)

    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def __repr__(self):
        return f"<Rating order={self.order_id}>"
