"""Vendor ledger entries (credits on delivered orders)."""
from datetime import datetime

from ..extensions import db


class VendorLedgerEntry(db.Model):
    __tablename__ = "vendor_ledger_entries"

    id = db.Column(db.Integer, primary_key=True)
    vendor_id = db.Column(db.Integer, db.ForeignKey("vendors.id"), nullable=False, index=True)
    order_id = db.Column(db.Integer, db.ForeignKey("orders.id"), nullable=False, unique=True, index=True)
    amount_cents = db.Column(db.Integer, nullable=False)
    amount_ghs = db.Column(db.Float, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    vendor = db.relationship("Vendor", backref=db.backref("ledger_entries", lazy="dynamic"))
    order = db.relationship("Order", backref=db.backref("ledger_entry", uselist=False))

    def __repr__(self):
        return f"<VendorLedgerEntry {self.id} order={self.order_id} vendor={self.vendor_id}>"
