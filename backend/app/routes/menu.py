"""Vendor menu (list items)."""
from flask import Blueprint

from ..models import Vendor, MenuItem
from ..utils.responses import ok, error

menu_bp = Blueprint("menu", __name__)


def _item_to_json(m):
    return {
        "id": m.id,
        "name": m.name,
        "description": m.description,
        "price_cents": m.price_cents,
        "is_available": m.is_available,
    }


@menu_bp.route("/<int:vendor_id>/menu", methods=["GET"])
def get_menu(vendor_id):
    vendor = Vendor.query.filter_by(id=vendor_id, approved=True).first()
    if not vendor:
        return error("Vendor not found", 404)
    items = MenuItem.query.filter_by(vendor_id=vendor_id).all()
    return ok({"vendor_id": vendor_id, "items": [_item_to_json(i) for i in items]})
