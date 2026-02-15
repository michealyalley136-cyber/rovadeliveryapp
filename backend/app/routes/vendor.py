"""Vendor login + order queue (MVP)."""
from datetime import datetime, timedelta

from flask import Blueprint, request
from flask_jwt_extended import create_access_token, get_jwt, get_jwt_identity, jwt_required
from werkzeug.security import check_password_hash

from ..extensions import db
from ..models import Vendor, Order
from ..services.order_state import set_order_status, OrderStatusError
from ..utils.auth import check_password
from ..utils.responses import ok, error
from ..utils.validators import validate_required

vendor_bp = Blueprint("vendor", __name__)


def _vendor_to_json(v: Vendor) -> dict:
    return {
        "id": v.id,
        "name": v.name,
        "vendor_type": v.vendor_type,
        "whatsapp_number": v.whatsapp_number,
        "lat": v.lat,
        "lng": v.lng,
        "approved": v.approved,
    }


def _order_to_json(o: Order) -> dict:
    return {
        "id": o.id,
        "vendor_id": o.vendor_id,
        "status": o.status,
        "subtotal_cents": o.subtotal_cents,
        "delivery_fee_cents": o.delivery_fee_cents,
        "total_cents": o.total_cents,
        "delivery_distance_km": o.delivery_distance_km,
        "delivery_fee_ghs": o.delivery_fee_ghs,
        "subtotal_ghs": o.subtotal_ghs,
        "total_ghs": o.total_ghs,
        "created_at": o.created_at.isoformat() if o.created_at else None,
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
        "driver_id": o.driver_id,
    }


def _require_vendor_claims():
    claims = get_jwt() or {}
    if claims.get("type") != "vendor" and claims.get("role") != "vendor":
        return error("Vendor auth required", 403)
    return None


def _get_vendor_id_from_jwt():
    claims = get_jwt() or {}
    vendor_id = claims.get("vendor_id") or get_jwt_identity()
    try:
        return int(vendor_id)
    except (TypeError, ValueError):
        return None


@vendor_bp.route("/login", methods=["POST"])
def login():
    data = request.get_json() or {}
    missing = validate_required(data, ["vendor_id", "pin"])
    if missing:
        return error(f"Missing: {', '.join(missing)}", 400)
    vendor_id = data.get("vendor_id")
    pin = data.get("pin")
    try:
        vendor_id = int(vendor_id)
    except (TypeError, ValueError):
        return error("vendor_id must be an integer", 400)

    vendor = Vendor.query.get(vendor_id)
    if not vendor or not vendor.vendor_is_active or (not vendor.vendor_pin_hash and not vendor.pin_hash):
        return error("Vendor not found or PIN not set", 404)
    if vendor.vendor_pin_hash:
        valid = check_password_hash(vendor.vendor_pin_hash, str(pin))
    else:
        valid = check_password(str(pin), vendor.pin_hash)
    if not valid:
        return error("Invalid PIN", 401)

    token = create_access_token(
        identity=str(vendor.id),
        additional_claims={"type": "vendor", "role": "vendor", "vendor_id": vendor.id},
        expires_delta=timedelta(hours=12),
    )
    return ok({"vendor": _vendor_to_json(vendor), "access_token": token})


@vendor_bp.route("/orders", methods=["GET"])
@jwt_required()
def list_orders():
    auth_error = _require_vendor_claims()
    if auth_error:
        return auth_error
    vendor_id = _get_vendor_id_from_jwt()
    if not vendor_id:
        return error("Invalid vendor token", 403)
    statuses_param = request.args.get("statuses") or request.args.get("status")
    statuses = None
    if statuses_param:
        statuses = [s.strip() for s in statuses_param.split(",") if s.strip()]

    q = Order.query.filter_by(vendor_id=vendor_id)
    if statuses:
        q = q.filter(Order.status.in_(statuses))
    orders = q.order_by(Order.created_at.desc()).limit(100).all()
    return ok({"orders": [_order_to_json(o) for o in orders]})


@vendor_bp.route("/orders/<int:order_id>/accept", methods=["POST"])
@jwt_required()
def accept_order(order_id: int):
    auth_error = _require_vendor_claims()
    if auth_error:
        return auth_error
    vendor_id = _get_vendor_id_from_jwt()
    if not vendor_id:
        return error("Invalid vendor token", 403)
    order = Order.query.filter_by(id=order_id, vendor_id=vendor_id).first()
    if not order:
        return error("Order not found", 404)
    if order.status in (Order.STATUS_CANCELLED, Order.STATUS_DELIVERED):
        return error("Order cannot be accepted in current state", 400)
    try:
        set_order_status(order, Order.STATUS_PREPARING, actor="vendor")
    except OrderStatusError as e:
        return error(str(e), 400)
    return ok(_order_to_json(order))


@vendor_bp.route("/orders/<int:order_id>/ready", methods=["POST"])
@jwt_required()
def ready_order(order_id: int):
    auth_error = _require_vendor_claims()
    if auth_error:
        return auth_error
    vendor_id = _get_vendor_id_from_jwt()
    if not vendor_id:
        return error("Invalid vendor token", 403)
    order = Order.query.filter_by(id=order_id, vendor_id=vendor_id).first()
    if not order:
        return error("Order not found", 404)
    if order.status in (Order.STATUS_CANCELLED, Order.STATUS_DELIVERED):
        return error("Order cannot be set Ready in current state", 400)
    try:
        set_order_status(order, Order.STATUS_READY, actor="vendor")
    except OrderStatusError as e:
        return error(str(e), 400)
    return ok(_order_to_json(order))


def _canonical_status(order_status: str) -> str:
    mapping = {
        Order.STATUS_CREATED: "NEW",
        Order.STATUS_SENT_TO_VENDOR: "NEW",
        Order.STATUS_ACCEPTED: "PREPARING",
        Order.STATUS_PREPARING: "PREPARING",
        Order.STATUS_READY: "READY",
        Order.STATUS_ASSIGNED: "ASSIGNED",
        Order.STATUS_PICKED_UP: "ASSIGNED",
        Order.STATUS_DELIVERED: "COMPLETED",
    }
    return mapping.get(order_status, order_status.upper() if order_status else "UNKNOWN")


def _canonical_to_internal(status: str) -> str:
    mapping = {
        "PREPARING": Order.STATUS_PREPARING,
        "READY": Order.STATUS_READY,
        "ASSIGNED": Order.STATUS_ASSIGNED,
        "COMPLETED": Order.STATUS_DELIVERED,
    }
    return mapping.get(status)


def _log_status_change(order: Order, vendor_id: int, old_status: str, new_status: str) -> None:
    ts = datetime.utcnow().isoformat() + "Z"
    line = f"[{ts}] vendor {vendor_id} status {old_status} -> {new_status}"
    if order.notes:
        order.notes = f"{order.notes}\n{line}"
    else:
        order.notes = line
    db.session.commit()


@vendor_bp.route("/orders/<int:order_id>/status", methods=["PATCH"])
@jwt_required()
def update_order_status(order_id: int):
    auth_error = _require_vendor_claims()
    if auth_error:
        return auth_error
    vendor_id = _get_vendor_id_from_jwt()
    if not vendor_id:
        return error("Invalid vendor token", 403)
    order = Order.query.filter_by(id=order_id, vendor_id=vendor_id).first()
    if not order:
        return error("Order not found", 404)

    data = request.get_json() or {}
    requested = (data.get("status") or "").strip().upper()
    if not requested:
        return error("Missing status", 400)
    if requested == "NEW":
        return error("Cannot set status to NEW", 400)

    current_canonical = _canonical_status(order.status)
    allowed = {
        "NEW": {"PREPARING"},
        "PREPARING": {"READY"},
        "READY": {"COMPLETED"},
    }
    if current_canonical not in allowed:
        return error(f"Cannot change status from {current_canonical}", 409)
    if requested not in allowed[current_canonical]:
        return error(f"Cannot move from {current_canonical} to {requested}", 409)

    if requested == "COMPLETED" and order.driver_id:
        return error("Cannot complete once driver is assigned", 409)

    internal = _canonical_to_internal(requested)
    if not internal:
        return error("Invalid status", 400)

    old_status = order.status
    try:
        set_order_status(order, internal, actor="vendor")
    except OrderStatusError as e:
        return error(str(e), 409)

    if old_status != order.status:
        _log_status_change(order, vendor_id, old_status, order.status)

    return ok(_order_to_json(order))
