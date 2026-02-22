"""Admin: approve vendors/drivers, set vendor type + WhatsApp, view orders, force cancel, reassign."""
import json
import os
from datetime import datetime, date, time
from uuid import uuid4

from flask import Blueprint, request, current_app
from flask_jwt_extended import get_jwt, verify_jwt_in_request
from werkzeug.security import generate_password_hash
from werkzeug.utils import secure_filename

from ..extensions import db
from sqlalchemy import or_

from ..models import (
    Vendor,
    Driver,
    Order,
    User,
    DeliveryPricingConfig,
    DriverOffer,
    MenuCategory,
    MenuItem,
    AddOnGroup,
    AddOnOption,
)
from ..models.addon import menu_item_addon_groups
from ..services.dispatch import dispatch_order
from ..services.order_state import set_order_status, OrderStatusError, normalize_status

from ..utils.auth import hash_password
from ..utils.responses import ok, error
from ..utils.jwt_errors import jwt_error_response

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


def _require_admin_auth():
    """Allow JWT admin role if Authorization header present; fallback to API key."""
    if request.headers.get("Authorization"):
        try:
            verify_jwt_in_request()
        except Exception as exc:
            return jwt_error_response(exc)
        claims = get_jwt() or {}
        role = claims.get("role") or claims.get("type")
        if role != "admin":
            return error("Forbidden", 403)
        return None
    return _require_admin_api_key()


def _vendor_to_json(v):
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
        "phone": d.phone,
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
        "driver_status": o.driver_status,
        "status": o.status,
        "payment_method": o.payment_method,
        "payment_status": o.payment_status,
        "subtotal_cents": o.subtotal_cents,
        "total_cents": o.total_cents,
        "delivery_fee_cents": o.delivery_fee_cents,
        "service_fee_cents": o.service_fee_cents,
        "discount_cents": o.discount_cents,
        "promo_code": o.promo_code,
        "total_ghs": o.total_ghs,
        "delivery_fee_ghs": o.delivery_fee_ghs,
        "service_fee_ghs": o.service_fee_ghs,
        "refund_required": o.refund_required,
        "refund_note": o.refund_note,
        "cancel_reason": o.cancel_reason,
        "created_at": o.created_at.isoformat() if o.created_at else None,
        "customer": {
            "name": o.customer_name or (o.customer.full_name if o.customer else None),
            "phone": o.customer_phone,
        },
        "vendor": {
            "id": o.vendor_id,
            "name": o.vendor.name if o.vendor else None,
        },
    }


def _parse_internal_notes(order: Order) -> list[dict]:
    if not order.internal_notes:
        return []
    try:
        notes = json.loads(order.internal_notes)
    except json.JSONDecodeError:
        return []
    if isinstance(notes, list):
        return [n for n in notes if isinstance(n, dict)]
    return []


def _append_internal_note(order: Order, note: str, *, note_type: str = "note") -> None:
    notes = _parse_internal_notes(order)
    notes.append({
        "type": note_type,
        "note": note,
        "timestamp": datetime.utcnow().isoformat(),
    })
    order.internal_notes = json.dumps(notes)


def _build_order_timeline(order: Order) -> list[dict]:
    timeline = []

    def add(status, ts, **extra):
        if not ts:
            return
        entry = {"status": status, "timestamp": ts.isoformat()}
        if extra:
            entry.update(extra)
        timeline.append(entry)

    add("placed", order.placed_at or order.created_at)
    add("accepted", order.accepted_at)
    add("preparing", order.prepared_at)
    add("assigned", order.assigned_at)
    add("picked_up", order.picked_up_at)
    add("delivered", order.delivered_at)
    add("declined", order.declined_at)
    add("cancelled", order.cancelled_at, reason=order.cancel_reason)

    return timeline


def _order_detail_to_json(o):
    return {
        **_order_to_json(o),
        "subtotal_cents": o.subtotal_cents,
        "delivery_fee_cents": o.delivery_fee_cents,
        "service_fee_cents": o.service_fee_cents,
        "discount_cents": o.discount_cents,
        "promo_code": o.promo_code,
        "total_cents": o.total_cents,
        "delivery_distance_km": o.delivery_distance_km,
        "delivery_fee_ghs": o.delivery_fee_ghs,
        "service_fee_ghs": o.service_fee_ghs,
        "subtotal_ghs": o.subtotal_ghs,
        "total_ghs": o.total_ghs,
        "notes": o.notes,
        "cancel_reason": o.cancel_reason,
        "refund_required": o.refund_required,
        "refund_note": o.refund_note,
        "internal_notes": _parse_internal_notes(o),
        "timeline": _build_order_timeline(o),
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


def _category_to_json(c: MenuCategory) -> dict:
    return {
        "id": c.id,
        "vendor_id": c.vendor_id,
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
        "vendor_id": g.vendor_id,
        "name": g.name,
        "min_select": g.min_select,
        "max_select": g.max_select,
        "sort_order": g.sort_order,
        "is_active": g.is_active,
        "options": [_addon_option_to_json(o) for o in g.options.order_by(AddOnOption.id).all()],
    }


def _item_to_json_admin(i: MenuItem) -> dict:
    return {
        "id": i.id,
        "vendor_id": i.vendor_id,
        "category_id": i.category_id,
        "category": i.category.name if i.category else None,
        "name": i.name,
        "description": i.description,
        "price_cents": i.price_cents,
        "price_ghs": round(i.price_cents / 100.0, 2),
        "image_url": i.image_url,
        "is_available": i.is_available,
        "addon_group_ids": [g.id for g in i.addon_groups],
    }


# MVP: no admin auth; in production protect with role or separate JWT
@admin_bp.route("/vendors", methods=["GET"])
def list_vendors():
    auth_error = _require_admin_api_key()
    if auth_error:
        return auth_error
    vendors = Vendor.query.all()
    return ok({"vendors": [_vendor_to_json(v) for v in vendors]})


def _coerce_bool(value):
    if value is None:
        return None
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    if isinstance(value, str):
        lowered = value.strip().lower()
        if lowered in ("true", "1", "yes", "y", "on"):
            return True
        if lowered in ("false", "0", "no", "n", "off"):
            return False
    return None


def _coerce_float(value, field_name):
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        raise ValueError(f"{field_name} must be a number")


def _coerce_int(value, field_name):
    if value is None or value == "":
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        raise ValueError(f"{field_name} must be an integer")


def _parse_hours(value):
    if value is None:
        return None
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
        except json.JSONDecodeError as exc:
            raise ValueError("hours must be valid JSON") from exc
        if isinstance(parsed, dict):
            return parsed
    raise ValueError("hours must be an object")


def _apply_vendor_payload(vendor: Vendor, data: dict, *, allow_name: bool = True):
    if allow_name and "name" in data:
        name = (data.get("name") or "").strip()
        if not name:
            raise ValueError("name is required")
        vendor.name = name
    if "description" in data:
        vendor.description = (data.get("description") or "").strip() or None
    if "phone" in data:
        vendor.phone = (data.get("phone") or "").strip() or None
    if "hours" in data:
        vendor.hours = _parse_hours(data.get("hours"))
    if "delivery_radius_km" in data:
        vendor.delivery_radius_km = _coerce_float(data.get("delivery_radius_km"), "delivery_radius_km")
    if "minimum_order_amount" in data:
        vendor.minimum_order_amount = _coerce_float(data.get("minimum_order_amount"), "minimum_order_amount")
    if "prep_time_minutes" in data:
        vendor.prep_time_minutes = _coerce_int(data.get("prep_time_minutes"), "prep_time_minutes")
    if "base_delivery_fee_ghs" in data:
        vendor.base_delivery_fee_ghs = _coerce_float(data.get("base_delivery_fee_ghs"), "base_delivery_fee_ghs")
    if "per_km_fee_ghs" in data:
        vendor.per_km_fee_ghs = _coerce_float(data.get("per_km_fee_ghs"), "per_km_fee_ghs")
    if "service_fee_percent" in data:
        vendor.service_fee_percent = _coerce_float(data.get("service_fee_percent"), "service_fee_percent")
    if "minimum_service_fee_ghs" in data:
        vendor.minimum_service_fee_ghs = _coerce_float(data.get("minimum_service_fee_ghs"), "minimum_service_fee_ghs")
    if "logo_url" in data:
        vendor.logo_url = (data.get("logo_url") or "").strip() or None
    if "banner_url" in data:
        vendor.banner_url = (data.get("banner_url") or "").strip() or None
    if "is_active" in data:
        active = _coerce_bool(data.get("is_active"))
        if active is None:
            raise ValueError("is_active must be boolean")
        vendor.vendor_is_active = active
    if "vendor_type" in data and data["vendor_type"] in Vendor.VENDOR_TYPES:
        vendor.vendor_type = data["vendor_type"]
    if "whatsapp_number" in data:
        vendor.whatsapp_number = (data.get("whatsapp_number") or "").strip() or None
    if "lat" in data:
        vendor.lat = _coerce_float(data.get("lat"), "lat")
    if "lng" in data:
        vendor.lng = _coerce_float(data.get("lng"), "lng")
    if "approved" in data:
        approved = _coerce_bool(data.get("approved"))
        if approved is None:
            raise ValueError("approved must be boolean")
        vendor.approved = approved
    if "pin" in data and data["pin"] is not None:
        pin_value = str(data["pin"])
        vendor.pin_hash = hash_password(pin_value)
        vendor.vendor_pin_hash = generate_password_hash(pin_value)


@admin_bp.route("/vendors", methods=["POST"])
def create_vendor():
    auth_error = _require_admin_api_key()
    if auth_error:
        return auth_error
    data = request.get_json() or {}
    try:
        name = (data.get("name") or "").strip()
        if not name:
            return error("name is required", 400)
        vendor = Vendor(name=name)
        _apply_vendor_payload(vendor, data, allow_name=False)
        db.session.add(vendor)
        db.session.commit()
    except ValueError as exc:
        return error(str(exc), 400)
    return ok(_vendor_to_json(vendor), 201)


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
    auth_error = _require_admin_api_key()
    if auth_error:
        return auth_error
    v = Vendor.query.get(vendor_id)
    if not v:
        return error("Vendor not found", 404)
    data = request.get_json() or {}
    try:
        _apply_vendor_payload(v, data, allow_name=True)
    except ValueError as exc:
        return error(str(exc), 400)
    db.session.commit()
    return ok(_vendor_to_json(v))


@admin_bp.route("/vendors/<int:vendor_id>", methods=["PATCH"])
def patch_vendor(vendor_id):
    return update_vendor(vendor_id)


@admin_bp.route("/vendors/<int:vendor_id>", methods=["DELETE"])
def delete_vendor(vendor_id):
    auth_error = _require_admin_api_key()
    if auth_error:
        return auth_error
    v = Vendor.query.get(vendor_id)
    if not v:
        return error("Vendor not found", 404)
    v.vendor_is_active = False
    v.approved = False
    db.session.commit()
    return ok({"id": v.id, "is_active": v.vendor_is_active})


@admin_bp.route("/uploads", methods=["POST"])
def upload_file():
    auth_error = _require_admin_api_key()
    if auth_error:
        return auth_error
    if not request.files:
        return error("No file uploaded", 400)
    file = request.files.get("file") or request.files.get("logo") or request.files.get("banner")
    if not file or not file.filename:
        return error("No file uploaded", 400)

    filename = secure_filename(file.filename)
    if not filename:
        return error("Invalid filename", 400)

    ext = os.path.splitext(filename)[1].lower()
    if ext not in (".png", ".jpg", ".jpeg", ".webp", ".gif"):
        return error("Unsupported file type", 400)

    upload_folder = current_app.config.get("UPLOAD_FOLDER") or os.path.join(os.getcwd(), "uploads")
    os.makedirs(upload_folder, exist_ok=True)
    unique_name = f"{datetime.utcnow().strftime('%Y%m%d%H%M%S')}_{uuid4().hex}{ext}"
    path = os.path.join(upload_folder, unique_name)
    file.save(path)

    url = f"/uploads/{unique_name}"
    return ok({"url": url, "path": url, "filename": unique_name}, 201)


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
    auth_error = _require_admin_auth()
    if auth_error:
        return auth_error

    query = Order.query
    vendor_id = request.args.get("vendor_id")
    status = request.args.get("status")
    date_from = request.args.get("date_from")
    date_to = request.args.get("date_to")
    search = request.args.get("search")

    if vendor_id:
        try:
            vendor_id = int(vendor_id)
        except (TypeError, ValueError):
            return error("vendor_id must be an integer", 400)
        query = query.filter(Order.vendor_id == vendor_id)

    if status and status.lower() not in ("all", "any"):
        try:
            status_norm = normalize_status(status)
        except OrderStatusError as e:
            return error(str(e), 400)
        query = query.filter(Order.status == status_norm)

    def _parse_date_param(value, *, end=False):
        if not value:
            return None
        try:
            if len(value) == 10:
                day = date.fromisoformat(value)
                return datetime.combine(day, time.max if end else time.min)
            dt = datetime.fromisoformat(value)
            if end and dt.time() == time.min:
                return datetime.combine(dt.date(), time.max)
            return dt
        except ValueError as exc:
            raise ValueError("date_from/date_to must be ISO date or datetime") from exc

    if date_from:
        try:
            start_dt = _parse_date_param(date_from, end=False)
        except ValueError as e:
            return error(str(e), 400)
        query = query.filter(Order.created_at >= start_dt)

    if date_to:
        try:
            end_dt = _parse_date_param(date_to, end=True)
        except ValueError as e:
            return error(str(e), 400)
        query = query.filter(Order.created_at <= end_dt)

    if search:
        search = search.strip()
        if search:
            like = f"%{search}%"
            filters = [
                Order.customer_name.ilike(like),
                Order.customer_phone.ilike(like),
            ]
            if search.isdigit():
                filters.append(Order.id == int(search))
            query = query.outerjoin(User, User.id == Order.customer_id)
            filters.append(User.full_name.ilike(like))
            query = query.filter(or_(*filters))

    orders = query.order_by(Order.created_at.desc()).limit(200).all()
    return ok({"orders": [_order_to_json(o) for o in orders]})


@admin_bp.route("/orders/<int:order_id>", methods=["GET"])
def get_order_detail(order_id):
    auth_error = _require_admin_auth()
    if auth_error:
        return auth_error
    order = Order.query.get(order_id)
    if not order:
        return error("Order not found", 404)
    return ok(_order_detail_to_json(order))


@admin_bp.route("/orders/<int:order_id>/actions", methods=["PATCH"])
def order_actions(order_id):
    auth_error = _require_admin_auth()
    if auth_error:
        return auth_error
    order = Order.query.get(order_id)
    if not order:
        return error("Order not found", 404)

    data = request.get_json() or {}
    action = (data.get("action") or "").strip().lower()
    if not action:
        return error("action is required", 400)

    if action == "force_cancel":
        reason = (data.get("reason") or "").strip()
        try:
            order.set_status(Order.STATUS_CANCELLED, role="admin", allow_admin_override=True)
        except ValueError as e:
            return error(str(e), 400)
        order.cancel_reason = reason or None
        order.driver_id = None
        order.driver_status = None
        order.offer_expires_at = None
    elif action == "mark_refund_required":
        refund_required = _coerce_bool(data.get("refund_required"))
        if refund_required is None:
            return error("refund_required must be true or false", 400)
        note = (data.get("note") or "").strip()
        order.refund_required = bool(refund_required)
        order.refund_note = note or None
    elif action == "add_internal_note":
        note = (data.get("note") or "").strip()
        if not note:
            return error("note is required", 400)
        _append_internal_note(order, note, note_type="internal")
    elif action in ("set_payment_status", "mark_payment_paid"):
        if action == "mark_payment_paid":
            next_status = Order.PAYMENT_STATUS_PAID
        else:
            next_status = (data.get("payment_status") or "").strip().lower()
            if next_status not in Order.PAYMENT_STATUSES:
                return error("payment_status must be paid or pending", 400)
        order.payment_status = next_status
    else:
        return error("Unknown action", 400)

    db.session.commit()
    return ok(_order_detail_to_json(order))


@admin_bp.route("/orders/<int:order_id>/cancel", methods=["POST"])
def force_cancel(order_id):
    order = Order.query.get(order_id)
    if not order:
        return error("Order not found", 404)
    try:
        set_order_status(order, Order.STATUS_CANCELLED, actor="admin")
    except OrderStatusError as e:
        return error(str(e), 400)
    order.driver_id = None
    db.session.commit()
    return ok(_order_to_json(order))


@admin_bp.route("/orders/<int:order_id>/reassign", methods=["POST"])
def reassign_order(order_id):
    """Clear driver and set READY, then run dispatch (offer to nearest driver)."""
    order = Order.query.get(order_id)
    if not order:
        return error("Order not found", 404)
    if order.status not in (Order.STATUS_READY, Order.STATUS_ASSIGNED):
        return error("Order must be ready or assigned to reassign", 400)
    order.driver_id = None
    try:
        set_order_status(order, Order.STATUS_READY, actor="admin")
    except OrderStatusError as e:
        return error(str(e), 400)
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


@admin_bp.route("/orders/<int:order_id>/assign-driver", methods=["PATCH"])
def assign_driver(order_id):
    auth_error = _require_admin_api_key()
    if auth_error:
        return auth_error
    data = request.get_json() or {}
    driver_id = data.get("driver_id")
    try:
        driver_id = int(driver_id)
    except (TypeError, ValueError):
        return error("driver_id must be an integer", 400)

    driver = Driver.query.get(driver_id)
    if not driver:
        return error("Driver not found", 404)
    if not driver.approved or not driver.driver_is_active:
        return error("Driver is not active", 409)

    order = Order.query.get(order_id)
    if not order:
        return error("Order not found", 404)
    if order.status in (Order.STATUS_CANCELLED, Order.STATUS_DELIVERED, Order.STATUS_DECLINED):
        return error("Order is in a terminal state", 409)
    if order.driver_id and order.driver_id != driver_id:
        return error("Order already assigned", 409)

    order.driver_id = driver_id
    try:
        order.set_status(Order.STATUS_ASSIGNED, role="admin", allow_admin_override=True)
    except ValueError as e:
        return error(str(e), 400)
    order.driver_status = Order.DRIVER_STATUS_ASSIGNED
    order.offer_expires_at = None
    db.session.commit()
    return ok(_order_detail_to_json(order))


@admin_bp.route("/pricing", methods=["PATCH"])
def update_pricing():
    """Admin: update delivery pricing config (single active row)."""
    data = request.get_json() or {}
    config = DeliveryPricingConfig.query.first()
    if not config:
        config = DeliveryPricingConfig(
            base_km=3.0,
            base_fee_ghs=12,
            per_km_fee_ghs=2,
            service_fee_percent=0,
            minimum_service_fee_ghs=0,
        )
        db.session.add(config)
        db.session.flush()
    if "base_km" in data and data["base_km"] is not None:
        config.base_km = float(data["base_km"])
    if "base_fee_ghs" in data and data["base_fee_ghs"] is not None:
        config.base_fee_ghs = float(data["base_fee_ghs"])
    if "per_km_fee_ghs" in data and data["per_km_fee_ghs"] is not None:
        config.per_km_fee_ghs = float(data["per_km_fee_ghs"])
    if "service_fee_percent" in data and data["service_fee_percent"] is not None:
        config.service_fee_percent = float(data["service_fee_percent"])
    if "minimum_service_fee_ghs" in data and data["minimum_service_fee_ghs"] is not None:
        config.minimum_service_fee_ghs = float(data["minimum_service_fee_ghs"])
    db.session.commit()
    return ok(config.to_dict())


def _parse_price_cents(data) -> int | None:
    if "price_cents" in data and data["price_cents"] is not None:
        try:
            return int(data["price_cents"])
        except (TypeError, ValueError):
            return None
    price = data.get("price") or data.get("price_ghs")
    if price is None:
        return None
    try:
        return int(round(float(price) * 100))
    except (TypeError, ValueError):
        return None


@admin_bp.route("/vendors/<int:vendor_id>/categories", methods=["GET", "POST", "PATCH", "DELETE"])
def admin_categories(vendor_id: int):
    auth_error = _require_admin_auth()
    if auth_error:
        return auth_error
    vendor = Vendor.query.get(vendor_id)
    if not vendor:
        return error("Vendor not found", 404)

    if request.method == "GET":
        categories = (
            MenuCategory.query.filter_by(vendor_id=vendor_id)
            .order_by(MenuCategory.sort_order.asc(), MenuCategory.name.asc())
            .all()
        )
        return ok({"categories": [_category_to_json(c) for c in categories]})

    data = request.get_json() or {}

    if request.method == "POST":
        name = (data.get("name") or "").strip()
        if not name:
            return error("name is required", 400)
        category = MenuCategory(
            vendor_id=vendor_id,
            name=name,
            sort_order=int(data.get("sort_order") or 0),
            is_active=bool(data.get("is_active", True)),
        )
        db.session.add(category)
        db.session.commit()
        return ok(_category_to_json(category), 201)

    category_id = data.get("id") or data.get("category_id") or request.args.get("id") or request.args.get("category_id")
    try:
        category_id = int(category_id)
    except (TypeError, ValueError):
        return error("category id required", 400)

    category = MenuCategory.query.filter_by(id=category_id, vendor_id=vendor_id).first()
    if not category:
        return error("Category not found", 404)

    if request.method == "PATCH":
        if "name" in data:
            name = (data.get("name") or "").strip()
            if not name:
                return error("name is required", 400)
            category.name = name
        if "sort_order" in data:
            try:
                category.sort_order = int(data.get("sort_order") or 0)
            except (TypeError, ValueError):
                return error("sort_order must be an integer", 400)
        if "is_active" in data:
            category.is_active = bool(data.get("is_active"))
        db.session.commit()
        return ok(_category_to_json(category))

    # DELETE
    MenuItem.query.filter_by(vendor_id=vendor_id, category_id=category.id).update({"category_id": None})
    db.session.delete(category)
    db.session.commit()
    return ok({"deleted": True, "id": category_id})


@admin_bp.route("/vendors/<int:vendor_id>/items", methods=["GET", "POST", "PATCH", "DELETE"])
def admin_items(vendor_id: int):
    auth_error = _require_admin_auth()
    if auth_error:
        return auth_error
    vendor = Vendor.query.get(vendor_id)
    if not vendor:
        return error("Vendor not found", 404)

    if request.method == "GET":
        items = (
            MenuItem.query.filter_by(vendor_id=vendor_id)
            .order_by(MenuItem.created_at.desc())
            .all()
        )
        return ok({"items": [_item_to_json_admin(i) for i in items]})

    data = request.get_json() or {}

    if request.method == "POST":
        name = (data.get("name") or "").strip()
        if not name:
            return error("name is required", 400)
        price_cents = _parse_price_cents(data)
        if price_cents is None:
            return error("price or price_cents is required", 400)
        category_id = data.get("category_id")
        if category_id:
            try:
                category_id = int(category_id)
            except (TypeError, ValueError):
                return error("category_id must be an integer", 400)
            category = MenuCategory.query.filter_by(id=category_id, vendor_id=vendor_id).first()
            if not category:
                return error("Category not found", 404)

        item = MenuItem(
            vendor_id=vendor_id,
            category_id=category_id,
            name=name,
            description=(data.get("description") or "").strip() or None,
            price_cents=price_cents,
            image_url=(data.get("image_url") or "").strip() or None,
            is_available=bool(data.get("is_available", True)),
        )
        db.session.add(item)

        addon_group_ids = data.get("addon_group_ids")
        if isinstance(addon_group_ids, list) and addon_group_ids:
            try:
                group_ids = [int(gid) for gid in addon_group_ids]
            except (TypeError, ValueError):
                return error("addon_group_ids must be a list of integers", 400)
            groups = AddOnGroup.query.filter(AddOnGroup.vendor_id == vendor_id, AddOnGroup.id.in_(group_ids)).all()
            item.addon_groups = groups

        db.session.commit()
        return ok(_item_to_json_admin(item), 201)

    item_id = data.get("id") or data.get("item_id") or request.args.get("id") or request.args.get("item_id")
    try:
        item_id = int(item_id)
    except (TypeError, ValueError):
        return error("item id required", 400)

    item = MenuItem.query.filter_by(id=item_id, vendor_id=vendor_id).first()
    if not item:
        return error("Item not found", 404)

    if request.method == "PATCH":
        if "name" in data:
            name = (data.get("name") or "").strip()
            if not name:
                return error("name is required", 400)
            item.name = name
        if "description" in data:
            item.description = (data.get("description") or "").strip() or None
        if "price" in data or "price_ghs" in data or "price_cents" in data:
            price_cents = _parse_price_cents(data)
            if price_cents is None:
                return error("price or price_cents must be a number", 400)
            item.price_cents = price_cents
        if "category_id" in data:
            category_id = data.get("category_id")
            if category_id in ("", None):
                item.category_id = None
            else:
                try:
                    category_id = int(category_id)
                except (TypeError, ValueError):
                    return error("category_id must be an integer", 400)
                category = MenuCategory.query.filter_by(id=category_id, vendor_id=vendor_id).first()
                if not category:
                    return error("Category not found", 404)
                item.category_id = category_id
        if "image_url" in data:
            item.image_url = (data.get("image_url") or "").strip() or None
        if "is_available" in data:
            item.is_available = bool(data.get("is_available"))

        addon_group_ids = data.get("addon_group_ids")
        if isinstance(addon_group_ids, list):
            try:
                group_ids = [int(gid) for gid in addon_group_ids]
            except (TypeError, ValueError):
                return error("addon_group_ids must be a list of integers", 400)
            groups = AddOnGroup.query.filter(AddOnGroup.vendor_id == vendor_id, AddOnGroup.id.in_(group_ids)).all()
            item.addon_groups = groups

        db.session.commit()
        return ok(_item_to_json_admin(item))

    # DELETE
    db.session.delete(item)
    db.session.commit()
    return ok({"deleted": True, "id": item_id})


@admin_bp.route("/vendors/<int:vendor_id>/addons", methods=["GET", "POST", "PATCH", "DELETE"])
def admin_addons(vendor_id: int):
    auth_error = _require_admin_auth()
    if auth_error:
        return auth_error
    vendor = Vendor.query.get(vendor_id)
    if not vendor:
        return error("Vendor not found", 404)

    if request.method == "GET":
        groups = (
            AddOnGroup.query.filter_by(vendor_id=vendor_id)
            .order_by(AddOnGroup.sort_order.asc(), AddOnGroup.name.asc())
            .all()
        )
        return ok({"groups": [_addon_group_to_json(g) for g in groups]})

    data = request.get_json() or {}

    if request.method == "POST":
        name = (data.get("name") or "").strip()
        if not name:
            return error("name is required", 400)
        group = AddOnGroup(
            vendor_id=vendor_id,
            name=name,
            min_select=int(data.get("min_select") or 0),
            max_select=int(data.get("max_select") or 0),
            sort_order=int(data.get("sort_order") or 0),
            is_active=bool(data.get("is_active", True)),
        )
        db.session.add(group)
        db.session.flush()

        options = data.get("options")
        if isinstance(options, list):
            for opt in options:
                if not isinstance(opt, dict):
                    continue
                opt_name = (opt.get("name") or "").strip()
                if not opt_name:
                    continue
                price_cents = _parse_price_cents(opt) or 0
                db.session.add(AddOnOption(
                    group_id=group.id,
                    name=opt_name,
                    price_cents=price_cents,
                    is_available=bool(opt.get("is_available", True)),
                ))
        db.session.commit()
        return ok(_addon_group_to_json(group), 201)

    group_id = data.get("id") or data.get("group_id") or request.args.get("id") or request.args.get("group_id")
    try:
        group_id = int(group_id)
    except (TypeError, ValueError):
        return error("group id required", 400)

    group = AddOnGroup.query.filter_by(id=group_id, vendor_id=vendor_id).first()
    if not group:
        return error("Add-on group not found", 404)

    if request.method == "PATCH":
        if "name" in data:
            name = (data.get("name") or "").strip()
            if not name:
                return error("name is required", 400)
            group.name = name
        if "min_select" in data:
            group.min_select = int(data.get("min_select") or 0)
        if "max_select" in data:
            group.max_select = int(data.get("max_select") or 0)
        if "sort_order" in data:
            group.sort_order = int(data.get("sort_order") or 0)
        if "is_active" in data:
            group.is_active = bool(data.get("is_active"))

        if "options" in data and isinstance(data.get("options"), list):
            AddOnOption.query.filter_by(group_id=group.id).delete()
            for opt in data.get("options"):
                if not isinstance(opt, dict):
                    continue
                opt_name = (opt.get("name") or "").strip()
                if not opt_name:
                    continue
                price_cents = _parse_price_cents(opt) or 0
                db.session.add(AddOnOption(
                    group_id=group.id,
                    name=opt_name,
                    price_cents=price_cents,
                    is_available=bool(opt.get("is_available", True)),
                ))

        db.session.commit()
        return ok(_addon_group_to_json(group))

    # DELETE
    db.session.execute(
        menu_item_addon_groups.delete().where(menu_item_addon_groups.c.addon_group_id == group.id)
    )
    AddOnOption.query.filter_by(group_id=group.id).delete()
    db.session.delete(group)
    db.session.commit()
    return ok({"deleted": True, "id": group_id})
