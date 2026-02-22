"""Vendor login + order queue (MVP)."""
from datetime import datetime

from flask import Blueprint, request
from flask_jwt_extended import create_access_token, get_jwt, get_jwt_identity, jwt_required
from werkzeug.security import check_password_hash

from ..extensions import db
from ..models import Vendor, Order, Driver
from ..services.order_state import set_order_status, OrderStatusError, normalize_status
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
        "payment_method": o.payment_method,
        "payment_status": o.payment_status,
        "subtotal_cents": o.subtotal_cents,
        "delivery_fee_cents": o.delivery_fee_cents,
        "service_fee_cents": o.service_fee_cents,
        "total_cents": o.total_cents,
        "delivery_distance_km": o.delivery_distance_km,
        "delivery_fee_ghs": o.delivery_fee_ghs,
        "service_fee_ghs": o.service_fee_ghs,
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
                "notes": i.notes,
                "allow_substitution": i.allow_substitution,
                "substitution_note": i.substitution_note,
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


def _authenticate_vendor_pin(data):
    missing = validate_required(data, ["vendor_id", "pin"])
    if missing:
        return None, error(f"Missing: {', '.join(missing)}", 400)
    vendor_id = data.get("vendor_id")
    pin = data.get("pin")
    try:
        vendor_id = int(vendor_id)
    except (TypeError, ValueError):
        return None, error("vendor_id must be an integer", 400)

    vendor = Vendor.query.get(vendor_id)
    if not vendor or not vendor.vendor_is_active or (not vendor.vendor_pin_hash and not vendor.pin_hash):
        return None, error("Vendor not found or PIN not set", 404)
    if vendor.vendor_pin_hash:
        valid = check_password_hash(vendor.vendor_pin_hash, str(pin))
    else:
        valid = check_password(str(pin), vendor.pin_hash)
    if not valid:
        return None, error("Invalid PIN", 401)
    return vendor, None


@vendor_bp.route("/auth/pin", methods=["POST"])
def auth_pin():
    data = request.get_json() or {}
    vendor, err = _authenticate_vendor_pin(data)
    if err:
        return err

    token = create_access_token(
        identity=str(vendor.id),
        additional_claims={"type": "vendor", "role": "vendor", "vendor_id": vendor.id},
    )
    return ok({"token": token, "vendor": {"id": vendor.id, "name": vendor.name}})


@vendor_bp.route("/login", methods=["POST"])
def login():
    data = request.get_json() or {}
    vendor, err = _authenticate_vendor_pin(data)
    if err:
        return err

    token = create_access_token(
        identity=str(vendor.id),
        additional_claims={"type": "vendor", "role": "vendor", "vendor_id": vendor.id},
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
        statuses = []
        for raw in statuses_param.split(","):
            raw = raw.strip()
            if not raw:
                continue
            try:
                statuses.append(normalize_status(raw))
            except OrderStatusError:
                continue
        statuses = list(dict.fromkeys(statuses))

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
    try:
        set_order_status(order, Order.STATUS_ACCEPTED, actor="vendor")
    except OrderStatusError as e:
        return error(str(e), 409)
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
    try:
        set_order_status(order, Order.STATUS_READY, actor="vendor")
    except OrderStatusError as e:
        return error(str(e), 409)
    return ok(_order_to_json(order))


def _log_status_change(order: Order, vendor_id: int, old_status: str, new_status: str) -> None:
    ts = datetime.utcnow().isoformat() + "Z"
    line = f"[{ts}] vendor {vendor_id} status {old_status} -> {new_status}"
    if order.notes:
        order.notes = f"{order.notes}\n{line}"
    else:
        order.notes = line
    db.session.commit()


@vendor_bp.route("/orders/<int:order_id>/status", methods=["POST", "PATCH"])
@jwt_required()
def update_order_status(order_id: int):
    data = request.get_json() or {}
    auth_error = _require_vendor_claims()
    if auth_error:
        return auth_error
    vendor_id = _get_vendor_id_from_jwt()
    if not vendor_id:
        return error("Invalid vendor token", 403)

    order = Order.query.get(order_id)
    if not order:
        return error("Order not found", 404)
    if order.vendor_id != vendor_id:
        return error("Forbidden", 403)

    requested = (data.get("next_status") or data.get("status") or "").strip()
    if not requested:
        return error("Missing next_status", 400)
    try:
        next_status = normalize_status(requested)
    except OrderStatusError as e:
        return error(str(e), 400)

    old_status = order.status
    try:
        order.set_status(next_status, role="vendor")
    except ValueError as e:
        message = str(e)
        code = 409 if message == "Awaiting payment" else 400
        return error(message, code)
    db.session.commit()

    if order.status == Order.STATUS_READY:
        from ..services.dispatch import dispatch_order
        dispatch_order(order.id)
        db.session.refresh(order)

    if old_status != order.status:
        _log_status_change(order, vendor_id, old_status, order.status)

    if order.status == Order.STATUS_DELIVERED:
        from ..services.ledger import maybe_create_vendor_credit
        maybe_create_vendor_credit(order)

    return ok(_order_to_json(order))


@vendor_bp.route("/orders/<int:order_id>", methods=["PATCH"])
@jwt_required()
def patch_order(order_id: int):
    return update_order_status(order_id)


@vendor_bp.route("/orders/<int:order_id>/assign-driver", methods=["PATCH"])
@jwt_required()
def assign_driver(order_id: int):
    auth_error = _require_vendor_claims()
    if auth_error:
        return auth_error
    vendor_id = _get_vendor_id_from_jwt()
    if not vendor_id:
        return error("Invalid vendor token", 403)

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
    if order.vendor_id != vendor_id:
        return error("Forbidden", 403)
    method = (order.payment_method or "").lower()
    status = (order.payment_status or "").lower()
    if method in (Order.PAYMENT_METHOD_MOMO, Order.PAYMENT_METHOD_CARD) and status != Order.PAYMENT_STATUS_PAID:
        return error("Awaiting payment", 409)
    if order.status in (Order.STATUS_CANCELLED, Order.STATUS_DELIVERED, Order.STATUS_DECLINED):
        return error("Order is in a terminal state", 409)
    if order.status not in (Order.STATUS_READY, Order.STATUS_ASSIGNED):
        return error("Order must be ready to assign a driver", 409)
    if order.driver_id and order.driver_id != driver_id:
        return error("Order already assigned", 409)

    order.driver_id = driver_id
    if order.status != Order.STATUS_ASSIGNED:
        order.status = Order.STATUS_ASSIGNED
        if not order.assigned_at:
            order.assigned_at = datetime.utcnow()
    order.driver_status = Order.DRIVER_STATUS_ASSIGNED
    order.offer_expires_at = None
    db.session.commit()
    return ok(_order_to_json(order))
