"""Public browsing endpoints (no auth)."""
from flask import Blueprint

from ..models import Vendor, MenuItem
from ..utils.responses import ok, error

public_bp = Blueprint("public", __name__)


def _vendor_public_json(v: Vendor) -> dict:
    return {
        "id": v.id,
        "name": v.name,
        "address_text": None,
        "lat": v.lat,
        "lng": v.lng,
        "whatsapp_number": v.whatsapp_number,
        "is_open": None,
    }


def _menu_item_public_json(m: MenuItem) -> dict:
    return {
        "id": m.id,
        "name": m.name,
        "price_cents": m.price_cents,
        "description": m.description,
        "category": None,
        "image_url": None,
        "is_available": m.is_available,
    }


# curl http://127.0.0.1:5000/api/public/vendors
@public_bp.route("/vendors", methods=["GET"])
def list_public_vendors():
    vendors = Vendor.query.filter_by(approved=True, vendor_is_active=True).all()
    return ok({"vendors": [_vendor_public_json(v) for v in vendors]})


# curl http://127.0.0.1:5000/api/public/vendors/1/menu
@public_bp.route("/vendors/<int:vendor_id>/menu", methods=["GET"])
def list_public_menu(vendor_id: int):
    vendor = Vendor.query.filter_by(id=vendor_id, approved=True, vendor_is_active=True).first()
    if not vendor:
        return error("Vendor not found", 404)
    items = MenuItem.query.filter_by(vendor_id=vendor_id, is_available=True).all()
    return ok({"vendor_id": vendor_id, "items": [_menu_item_public_json(i) for i in items]})
