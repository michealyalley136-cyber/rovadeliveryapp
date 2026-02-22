"""Public browsing endpoints (no auth)."""
from flask import Blueprint

from ..models import Vendor, MenuItem, MenuCategory, AddOnGroup, AddOnOption
from ..utils.responses import ok, error

public_bp = Blueprint("public", __name__)


def _vendor_public_json(v: Vendor) -> dict:
    return {
        "id": v.id,
        "name": v.name,
        "description": v.description,
        "phone": v.phone,
        "hours": v.hours,
        "delivery_radius_km": v.delivery_radius_km,
        "minimum_order_amount": v.minimum_order_amount,
        "prep_time_minutes": v.prep_time_minutes,
        "base_delivery_fee_ghs": v.base_delivery_fee_ghs,
        "per_km_fee_ghs": v.per_km_fee_ghs,
        "service_fee_percent": v.service_fee_percent,
        "minimum_service_fee_ghs": v.minimum_service_fee_ghs,
        "logo_url": v.logo_url,
        "banner_url": v.banner_url,
        "is_active": v.vendor_is_active,
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
        "category_id": m.category_id,
        "category": m.category.name if m.category else None,
        "image_url": m.image_url,
        "is_available": m.is_available,
        "addon_group_ids": [g.id for g in m.addon_groups],
    }


def _category_public_json(c: MenuCategory) -> dict:
    return {
        "id": c.id,
        "name": c.name,
        "sort_order": c.sort_order,
    }


def _addon_option_public_json(o: AddOnOption) -> dict:
    return {
        "id": o.id,
        "group_id": o.group_id,
        "name": o.name,
        "price_cents": o.price_cents,
        "price_ghs": round(o.price_cents / 100.0, 2),
        "is_available": o.is_available,
    }


def _addon_group_public_json(g: AddOnGroup) -> dict:
    return {
        "id": g.id,
        "name": g.name,
        "min_select": g.min_select,
        "max_select": g.max_select,
        "sort_order": g.sort_order,
        "options": [_addon_option_public_json(o) for o in g.options.order_by(AddOnOption.id).all()],
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
    categories = (
        MenuCategory.query.filter_by(vendor_id=vendor_id, is_active=True)
        .order_by(MenuCategory.sort_order.asc(), MenuCategory.name.asc())
        .all()
    )
    items = MenuItem.query.filter_by(vendor_id=vendor_id, is_available=True).all()
    items = [i for i in items if i.category is None or i.category.is_active]
    groups = (
        AddOnGroup.query.filter_by(vendor_id=vendor_id, is_active=True)
        .order_by(AddOnGroup.sort_order.asc(), AddOnGroup.name.asc())
        .all()
    )
    return ok({
        "vendor_id": vendor_id,
        "categories": [_category_public_json(c) for c in categories],
        "items": [_menu_item_public_json(i) for i in items],
        "addon_groups": [_addon_group_public_json(g) for g in groups],
    })
