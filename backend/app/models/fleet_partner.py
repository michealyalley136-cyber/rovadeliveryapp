"""FleetPartner model (optional for phase 1)."""
from datetime import datetime
from ..extensions import db


class FleetPartner(db.Model):
    __tablename__ = "fleet_partners"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(255), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def __repr__(self):
        return f"<FleetPartner {self.name}>"
