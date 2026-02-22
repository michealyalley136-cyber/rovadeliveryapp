"""Vendor menu (list items)."""
from flask import Blueprint

from ..models import Vendor, MenuItem, MenuCategory, AddOnGroup, AddOnOption
from ..utils.responses import ok, error

menu_bp = Blueprint("menu", __name__)


def _item_to_json(m):
    return {
        "id": m.id,
        "name": m.name,
        "description": m.description,
        "price_cents": m.price_cents,
        "category_id": m.category_id,
        "category": m.category.name if m.category else None,
        "image_url": m.image_url,
        "is_available": m.is_available,
        "addon_group_ids": [g.id for g in m.addon_groups],
    }


def _category_to_json(c: MenuCategory) -> dict:
    return {
        "id": c.id,
        "name": c.name,
        "sort_order": c.sort_order,
        "is_active": c.is_active,
    }


def _addon_option_to_json(o: AddOnOption) -> dict:
    return {
        "id": o.id,
        "group_id": o.group_id,
        "name": o.name,
        "price_cents": o.price_cents,
        "price_ghs": round(o.price_cents / 100.0, 2),
        "is_available": o.is_available,
    }


def _addon_group_to_json(g: AddOnGroup) -> dict:
    return {
        "id": g.id,
        "name": g.name,
        "min_select": g.min_select,
        "max_select": g.max_select,
        "sort_order": g.sort_order,
        "is_active": g.is_active,
        "options": [_addon_option_to_json(o) for o in g.options.order_by(AddOnOption.id).all()],
    }


@menu_bp.route("/<int:vendor_id>/menu", methods=["GET"])
def get_menu(vendor_id):
    vendor = Vendor.query.filter_by(id=vendor_id, approved=True).first()
    if not vendor:
        return error("Vendor not found", 404)
    categories = MenuCategory.query.filter_by(vendor_id=vendor_id).order_by(MenuCategory.sort_order.asc()).all()
    items = MenuItem.query.filter_by(vendor_id=vendor_id).all()
    groups = AddOnGroup.query.filter_by(vendor_id=vendor_id).order_by(AddOnGroup.sort_order.asc()).all()
    return ok({
        "vendor_id": vendor_id,
        "categories": [_category_to_json(c) for c in categories],
        "items": [_item_to_json(i) for i in items],
        "addon_groups": [_addon_group_to_json(g) for g in groups],
    })
