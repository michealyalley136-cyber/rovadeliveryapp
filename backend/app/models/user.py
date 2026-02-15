"""Customer user model."""
from datetime import datetime
from ..extensions import db


class User(db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(255), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    full_name = db.Column(db.String(255), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    addresses = db.relationship("Address", backref="user", lazy="dynamic", foreign_keys="Address.user_id")
    orders = db.relationship("Order", backref="customer", lazy="dynamic", foreign_keys="Order.customer_id")
    ratings_given = db.relationship("Rating", backref="rater_user", lazy="dynamic", foreign_keys="Rating.customer_id")

    def __repr__(self):
        return f"<User {self.email}>"
