"""Admin: approve vendors/drivers, set vendor type + WhatsApp, view orders, force cancel, reassign."""
import os
from flask import Blueprint, request

from ..extensions import db
from ..models import Vendor, Driver, Order, DeliveryPricingConfig, DriverOffer
from ..services.dispatch import dispatch_order
from ..services.order_state import set_order_status, OrderStatusError
from werkzeug.security import generate_password_hash

from ..utils.auth import hash_password
from ..utils.responses import ok, error

admin_bp = Blueprint("admin", __name__)


def _require_admin_api_key():
    """MVP admin auth via ADMIN_API_KEY + X-Admin-API-Key header."""
    expected = os.getenv("ADMIN_API_KEY")
    if not expected:
        return None
    provided = request.headers.get("X-Admin-API-Key")
    if not provided:
        return error("Admin API key required", 401)
    if provided != expected:
        return error("Invalid admin API key", 403)
    return None


def _vendor_to_json(v):
    return {
        "id": v.id,
        "name": v.name,
        "vendor_type": v.vendor_type,
        "whatsapp_number": v.whatsapp_number,
        "lat": v.lat,
        "lng": v.lng,
        "approved": v.approved,
    }


def _driver_to_json(d):
    return {
        "id": d.id,
        "email": d.email,
        "full_name": d.full_name,
        "approved": d.approved,
        "is_online": d.is_online,
        "last_known_lat": d.last_known_lat,
        "last_known_lng": d.last_known_lng,
        "last_location_at": d.last_location_at.isoformat() if d.last_location_at else None,
    }


def _order_to_json(o):
    return {
        "id": o.id,
        "customer_id": o.customer_id,
        "vendor_id": o.vendor_id,
        "driver_id": o.driver_id,
        "status": o.status,
        "total_cents": o.total_cents,
        "created_at": o.created_at.isoformat() if o.created_at else None,
    }


def _order_detail_to_json(o):
    return {
        **_order_to_json(o),
        "subtotal_cents": o.subtotal_cents,
        "delivery_fee_cents": o.delivery_fee_cents,
        "total_cents": o.total_cents,
        "delivery_distance_km": o.delivery_distance_km,
        "delivery_fee_ghs": o.delivery_fee_ghs,
        "subtotal_ghs": o.subtotal_ghs,
        "total_ghs": o.total_ghs,
        "notes": o.notes,
        "items": [
            {
                "menu_item_id": i.menu_item_id,
                "name": i.menu_item.name,
                "quantity": i.quantity,
                "unit_price_cents": i.unit_price_cents,
            }
            for i in o.items
        ],
        "dropoff": {
            "address_text": o.delivery_address.address_text if o.delivery_address else None,
            "lat": o.delivery_address.lat if o.delivery_address else None,
            "lng": o.delivery_address.lng if o.delivery_address else None,
        },
        "vendor": _vendor_to_json(o.vendor) if o.vendor else None,
        "driver": _driver_to_json(o.driver) if o.driver else None,
    }


# MVP: no admin auth; in production protect with role or separate JWT
@admin_bp.route("/vendors", methods=["GET"])
def list_vendors():
    vendors = Vendor.query.all()
    return ok({"vendors": [_vendor_to_json(v) for v in vendors]})


@admin_bp.route("/vendors/<int:vendor_id>/approve", methods=["POST"])
def approve_vendor(vendor_id):
    v = Vendor.query.get(vendor_id)
    if not v:
        return error("Vendor not found", 404)
    v.approved = True
    db.session.commit()
    return ok(_vendor_to_json(v))


@admin_bp.route("/vendors/<int:vendor_id>", methods=["PUT"])
def update_vendor(vendor_id):
    v = Vendor.query.get(vendor_id)
    if not v:
        return error("Vendor not found", 404)
    data = request.get_json() or {}
    if "vendor_type" in data and data["vendor_type"] in Vendor.VENDOR_TYPES:
        v.vendor_type = data["vendor_type"]
    if "whatsapp_number" in data:
        v.whatsapp_number = (data["whatsapp_number"] or "").strip() or None
    if "lat" in data:
        v.lat = float(data["lat"]) if data["lat"] is not None else None
    if "lng" in data:
        v.lng = float(data["lng"]) if data["lng"] is not None else None
    if "pin" in data and data["pin"] is not None:
        pin_value = str(data["pin"])
        v.pin_hash = hash_password(pin_value)
        v.vendor_pin_hash = generate_password_hash(pin_value)
    db.session.commit()
    return ok(_vendor_to_json(v))


@admin_bp.route("/drivers", methods=["GET"])
def list_drivers():
    drivers = Driver.query.all()
    return ok({"drivers": [_driver_to_json(d) for d in drivers]})


@admin_bp.route("/drivers/<int:driver_id>/approve", methods=["POST"])
def approve_driver(driver_id):
    d = Driver.query.get(driver_id)
    if not d:
        return error("Driver not found", 404)
    d.approved = True
    db.session.commit()
    return ok(_driver_to_json(d))


@admin_bp.route("/orders", methods=["GET"])
def list_orders():
    orders = Order.query.order_by(Order.created_at.desc()).limit(100).all()
    return ok({"orders": [_order_to_json(o) for o in orders]})


@admin_bp.route("/orders/<int:order_id>", methods=["GET"])
def get_order_detail(order_id):
    order = Order.query.get(order_id)
    if not order:
        return error("Order not found", 404)
    return ok(_order_detail_to_json(order))


@admin_bp.route("/orders/<int:order_id>/cancel", methods=["POST"])
def force_cancel(order_id):
    order = Order.query.get(order_id)
    if not order:
        return error("Order not found", 404)
    if order.status == Order.STATUS_DELIVERED:
        return error("Cannot cancel delivered order", 400)
    order.status = Order.STATUS_CANCELLED
    order.driver_id = None
    db.session.commit()
    return ok(_order_to_json(order))


@admin_bp.route("/orders/<int:order_id>/reassign", methods=["POST"])
def reassign_order(order_id):
    """Clear driver and set READY, then run dispatch (offer to nearest driver)."""
    order = Order.query.get(order_id)
    if not order:
        return error("Order not found", 404)
    if order.status not in (Order.STATUS_READY, Order.STATUS_ASSIGNED, Order.STATUS_NEEDS_REASSIGN):
        return error("Order must be Ready, Assigned or NeedsReassign to reassign", 400)
    order.driver_id = None
    order.status = Order.STATUS_READY
    db.session.commit()
    result = dispatch_order(order_id)
    out = {"order": _order_to_json(result["order"]) if result.get("order") else None}
    if result.get("offer"):
        out["offer_id"] = result["offer"].id
        out["driver_id"] = result["offer"].driver_id
    out["status"] = result.get("status", "unknown")
    return ok(out)


@admin_bp.route("/orders/<int:order_id>/set-ready", methods=["POST"])
def set_order_ready(order_id):
    """Set order status to Ready (e.g. after vendor confirms). For MVP / testing."""
    order = Order.query.get(order_id)
    if not order:
        return error("Order not found", 404)
    try:
        set_order_status(order, Order.STATUS_READY, actor="admin")
    except OrderStatusError as e:
        return error(str(e), 400)
    return ok(_order_to_json(order))


@admin_bp.route("/orders/<int:order_id>/set-preparing", methods=["POST"])
def set_order_preparing(order_id):
    """Set order status to Preparing (MVP)."""
    order = Order.query.get(order_id)
    if not order:
        return error("Order not found", 404)
    try:
        set_order_status(order, Order.STATUS_PREPARING, actor="admin")
    except OrderStatusError as e:
        return error(str(e), 400)
    return ok(_order_to_json(order))


@admin_bp.route("/orders/<int:order_id>/dispatch", methods=["POST"])
def trigger_dispatch(order_id):
    """Trigger dispatch: find nearest driver, create 15s offer. Order must be Ready or NeedsReassign."""
    auth_error = _require_admin_api_key()
    if auth_error:
        return auth_error
    result = dispatch_order(order_id)
    if result.get("error"):
        return error(result["error"], 400)
    order = result.get("order")
    offer = result.get("offer")
    out = {"order": _order_to_json(order) if order else None, "status": result.get("status")}
    if offer:
        out["offer_id"] = offer.id
        out["driver_id"] = offer.driver_id
        out["expires_at"] = offer.expires_at.isoformat() if offer.expires_at else None
    if result.get("attempts") is not None:
        out["attempts"] = result["attempts"]
    return ok(out)


@admin_bp.route("/pricing", methods=["PATCH"])
def update_pricing():
    """Admin: update delivery pricing config (single active row)."""
    data = request.get_json() or {}
    config = DeliveryPricingConfig.query.first()
    if not config:
        config = DeliveryPricingConfig(base_km=3.0, base_fee_ghs=12, per_km_fee_ghs=2)
        db.session.add(config)
        db.session.flush()
    if "base_km" in data and data["base_km"] is not None:
        config.base_km = float(data["base_km"])
    if "base_fee_ghs" in data and data["base_fee_ghs"] is not None:
        config.base_fee_ghs = float(data["base_fee_ghs"])
    if "per_km_fee_ghs" in data and data["per_km_fee_ghs"] is not None:
        config.per_km_fee_ghs = float(data["per_km_fee_ghs"])
    db.session.commit()
    return ok(config.to_dict())
