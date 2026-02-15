"""Orders: create, list, get (track status)."""
import json
from decimal import Decimal, InvalidOperation
from uuid import uuid4

from flask import Blueprint, request
from flask_jwt_extended import get_jwt, get_jwt_identity, jwt_required
from werkzeug.security import generate_password_hash

from ..extensions import db
from ..models import Order, OrderItem, Vendor, Address, MenuItem, User
from ..services.pricing import (
    compute_distance_km,
    get_active_pricing_config,
    compute_delivery_fee,
)
from ..services.order_state import set_order_status, OrderStatusError
from ..utils.responses import ok, error
from ..utils.validators import validate_required, validate_positive_int

orders_bp = Blueprint("orders", __name__)


def _canonical_status(status: str) -> str:
    mapping = {
        Order.STATUS_CREATED: "NEW",
        Order.STATUS_SENT_TO_VENDOR: "NEW",
        Order.STATUS_ACCEPTED: "PREPARING",
        Order.STATUS_PREPARING: "PREPARING",
        Order.STATUS_READY: "READY",
        Order.STATUS_ASSIGNED: "ASSIGNED",
        Order.STATUS_PICKED_UP: "ASSIGNED",
        Order.STATUS_DELIVERED: "COMPLETED",
        Order.STATUS_CANCELLED: "CANCELLED",
    }
    return mapping.get(status, status or "UNKNOWN")


def _vendor_to_json(v: Vendor) -> dict:
    return {
        "id": v.id,
        "name": v.name,
        "vendor_type": v.vendor_type,
        "whatsapp_number": v.whatsapp_number,
        "lat": v.lat,
        "lng": v.lng,
    }


def _driver_to_json(d) -> dict:
    return {
        "id": d.id,
        "full_name": d.full_name,
        "phone": d.phone,
        "is_online": d.is_online,
        "last_known_lat": d.last_known_lat,
        "last_known_lng": d.last_known_lng,
    }


def _address_to_json(a: Address) -> dict:
    return {
        "id": a.id,
        "label": a.label,
        "address_text": a.address_text,
        "lat": a.lat,
        "lng": a.lng,
    }


def _order_to_json(o, *, include_vendor=False, include_driver=False, include_address=False, include_pricing=False):
    d = {
        "id": o.id,
        "vendor_id": o.vendor_id,
        "delivery_address_id": o.delivery_address_id,
        "status": o.status,
        "status_canonical": _canonical_status(o.status),
        "subtotal_cents": o.subtotal_cents,
        "delivery_fee_cents": o.delivery_fee_cents,
        "total_cents": o.total_cents,
        "created_at": o.created_at.isoformat() if o.created_at else None,
        "offer_expires_at": o.offer_expires_at.isoformat() if o.offer_expires_at else None,
        "notes": o.notes,
        "customer_name": o.customer_name,
        "customer_phone": o.customer_phone,
        "items": [
            {
                "menu_item_id": i.menu_item_id,
                "name": i.menu_item.name,
                "quantity": i.quantity,
                "unit_price_cents": i.unit_price_cents,
            }
            for i in o.items
        ],
    }
    if o.delivery_distance_km is not None:
        d["delivery_distance_km"] = o.delivery_distance_km
    if o.delivery_fee_ghs is not None:
        d["delivery_fee_ghs"] = o.delivery_fee_ghs
    if o.subtotal_ghs is not None:
        d["subtotal_ghs"] = o.subtotal_ghs
    if o.total_ghs is not None:
        d["total_ghs"] = o.total_ghs
    if o.driver_id:
        d["driver_id"] = o.driver_id
    if include_pricing:
        d["pricing"] = {
            "subtotal_cents": o.subtotal_cents,
            "delivery_fee_cents": o.delivery_fee_cents,
            "total_cents": o.total_cents,
            "delivery_distance_km": o.delivery_distance_km,
            "delivery_fee_ghs": o.delivery_fee_ghs,
            "subtotal_ghs": o.subtotal_ghs,
            "total_ghs": o.total_ghs,
        }
    if include_vendor and o.vendor:
        d["vendor"] = _vendor_to_json(o.vendor)
    if include_driver and o.driver_id and o.driver:
        d["driver"] = _driver_to_json(o.driver)
    if include_address and o.delivery_address:
        d["dropoff"] = _address_to_json(o.delivery_address)
    return d


def _pickup_dropoff_km(vendor: Vendor, addr: Address) -> float:
    """Pricing distance: vendor (pickup) to delivery address (dropoff). Haversine."""
    pickup_lat, pickup_lng = vendor.lat, vendor.lng
    dropoff_lat, dropoff_lng = addr.lat, addr.lng
    if pickup_lat is None or pickup_lng is None:
        pickup_lat, pickup_lng = dropoff_lat, dropoff_lng
    if dropoff_lat is None or dropoff_lng is None:
        dropoff_lat, dropoff_lng = pickup_lat, pickup_lng
    if pickup_lat is None or pickup_lng is None:
        return 3.0
    return compute_distance_km(pickup_lat, pickup_lng, dropoff_lat, dropoff_lng)


@orders_bp.route("", methods=["POST"])
@jwt_required(optional=True)
def create_order():
    data = request.get_json() or {}
    items_payload = data.get("items")
    if not isinstance(items_payload, list) or len(items_payload) == 0:
        return error("items must be a non-empty list", 400)

    uid = get_jwt_identity()
    claims = {}
    if uid is not None:
        try:
            claims = get_jwt() or {}
        except Exception:
            claims = {}
    role = claims.get("type") or claims.get("role")

    menu_flow = any("menu_item_id" in row for row in items_payload)

    if menu_flow:
        if uid is None:
            return error("Authorization required for menu-item ordering", 401)
        if role != "customer":
            return error("Customer auth required", 403)
        if any("menu_item_id" not in row for row in items_payload):
            return error("All items must include menu_item_id for menu ordering", 400)
        uid = int(uid)
        missing = validate_required(data, ["vendor_id", "items"])
        if missing:
            return error(f"Missing: {', '.join(missing)}", 400)
        vendor = Vendor.query.filter_by(id=data["vendor_id"], approved=True).first()
        if not vendor:
            return error("Vendor not found", 404)

        addr = None
        dropoff_payload = None
        if data.get("delivery_address_id"):
            addr = Address.query.filter_by(id=data["delivery_address_id"], user_id=uid).first()
            if not addr:
                return error("Delivery address not found", 404)
        else:
            dropoff_payload = data.get("dropoff")
            if not isinstance(dropoff_payload, dict):
                return error("dropoff must be an object with address_text, lat, lng", 400)
            address_text = (dropoff_payload.get("address_text") or "").strip()
            if not address_text:
                return error("dropoff.address_text is required", 400)
            lat = dropoff_payload.get("lat")
            lng = dropoff_payload.get("lng")
            if lat is None or lng is None:
                return error("dropoff.lat and dropoff.lng are required", 400)
            try:
                lat = float(lat)
                lng = float(lng)
            except (TypeError, ValueError):
                return error("dropoff.lat and dropoff.lng must be numbers", 400)

        subtotal_cents = 0
        order_items_data = []
        for row in items_payload:
            mid = row.get("menu_item_id")
            qty = row.get("qty", row.get("quantity"))
            if mid is None or qty is None:
                return error("Each item must have menu_item_id and qty", 400)
            err, _ = validate_positive_int(qty, "qty")
            if err:
                return error(err, 400)
            qty = int(qty)
            if qty <= 0:
                return error("qty must be positive", 400)
            mi = MenuItem.query.filter_by(id=mid, vendor_id=vendor.id, is_available=True).first()
            if not mi:
                return error(f"Menu item {mid} not found or unavailable", 404)
            unit = mi.price_cents
            subtotal_cents += unit * qty
            order_items_data.append({"menu_item": mi, "quantity": qty, "unit_price_cents": unit})

        if dropoff_payload and not addr:
            addr = Address(
                user_id=uid,
                label=(dropoff_payload.get("label") or None),
                address_text=(dropoff_payload.get("address_text") or "").strip(),
                lat=float(dropoff_payload.get("lat")),
                lng=float(dropoff_payload.get("lng")),
            )
            db.session.add(addr)
            db.session.flush()

        distance_km = _pickup_dropoff_km(vendor, addr)
        config = get_active_pricing_config()
        delivery_fee_ghs = compute_delivery_fee(distance_km, config)
        subtotal_ghs = round(subtotal_cents / 100.0, 2)
        total_ghs = round(subtotal_ghs + delivery_fee_ghs, 2)
        delivery_fee_cents = int(round(delivery_fee_ghs * 100))
        total_cents = subtotal_cents + delivery_fee_cents

        order = Order(
            customer_id=uid,
            vendor_id=vendor.id,
            delivery_address_id=addr.id,
            status=Order.STATUS_CREATED,
            subtotal_cents=subtotal_cents,
            delivery_fee_cents=delivery_fee_cents,
            total_cents=total_cents,
            delivery_distance_km=round(distance_km, 4),
            delivery_fee_ghs=delivery_fee_ghs,
            subtotal_ghs=subtotal_ghs,
            total_ghs=total_ghs,
            notes=(data.get("notes") or "").strip() or None,
            order_public_token=uuid4().hex,
        )
        db.session.add(order)
        db.session.flush()
        for row in order_items_data:
            oi = OrderItem(
                order_id=order.id,
                menu_item_id=row["menu_item"].id,
                quantity=row["quantity"],
                unit_price_cents=row["unit_price_cents"],
            )
            db.session.add(oi)
        db.session.commit()
        return ok(_order_to_json(Order.query.get(order.id)), 201)

    # ---- Public MVP order (no menu lookup, no auth) ----
    if uid is not None:
        return error("Public guest orders must not include Authorization", 400)
    missing = validate_required(data, ["vendor_id", "customer_name", "customer_phone", "dropoff_address", "items", "delivery_fee"])
    if missing:
        return error(f"Missing: {', '.join(missing)}", 400)
    vendor = Vendor.query.filter_by(id=data["vendor_id"], approved=True).first()
    if not vendor:
        return error("Vendor not found", 404)

    customer_name = (data.get("customer_name") or "").strip()
    customer_phone = (data.get("customer_phone") or "").strip()
    dropoff_address = (data.get("dropoff_address") or "").strip()
    if not customer_name or not customer_phone or not dropoff_address:
        return error("customer_name, customer_phone and dropoff_address are required", 400)

    try:
        delivery_fee = Decimal(str(data.get("delivery_fee")))
    except (InvalidOperation, TypeError):
        return error("delivery_fee must be a number", 400)
    if delivery_fee < 0:
        return error("delivery_fee must be >= 0", 400)

    subtotal_ghs = Decimal("0")
    normalized_items = []
    for row in items_payload:
        name = (row.get("name") or "").strip()
        qty = row.get("qty")
        unit_price = row.get("unit_price")
        if not name or qty is None or unit_price is None:
            return error("Each item must include name, qty, unit_price", 400)
        try:
            qty = int(qty)
        except (TypeError, ValueError):
            return error("qty must be an integer", 400)
        if qty <= 0:
            return error("qty must be positive", 400)
        try:
            unit_price = Decimal(str(unit_price))
        except (InvalidOperation, TypeError):
            return error("unit_price must be a number", 400)
        if unit_price < 0:
            return error("unit_price must be >= 0", 400)
        line_total = unit_price * qty
        subtotal_ghs += line_total
        normalized_items.append({"name": name, "qty": qty, "unit_price": float(unit_price)})

    total_ghs = subtotal_ghs + delivery_fee
    subtotal_cents = int(round(subtotal_ghs * 100))
    delivery_fee_cents = int(round(delivery_fee * 100))
    total_cents = subtotal_cents + delivery_fee_cents

    if uid is None:
        guest_email = f"guest_{uuid4().hex}@guest.local"
        guest_user = User(
            email=guest_email,
            password_hash=generate_password_hash(uuid4().hex),
            full_name=customer_name,
        )
        db.session.add(guest_user)
        db.session.flush()
        uid = guest_user.id
    else:
        uid = int(uid)

    addr = Address(
        user_id=uid,
        label="Dropoff",
        address_text=dropoff_address,
        lat=None,
        lng=None,
    )
    db.session.add(addr)
    db.session.flush()

    order = Order(
        customer_id=uid,
        vendor_id=vendor.id,
        delivery_address_id=addr.id,
        status=Order.STATUS_CREATED,
        subtotal_cents=subtotal_cents,
        delivery_fee_cents=delivery_fee_cents,
        total_cents=total_cents,
        delivery_distance_km=None,
        delivery_fee_ghs=float(delivery_fee),
        subtotal_ghs=float(subtotal_ghs),
        total_ghs=float(total_ghs),
        notes=(data.get("notes") or "").strip() or None,
        customer_name=customer_name,
        customer_phone=customer_phone,
        order_public_token=uuid4().hex,
        items_snapshot=json.dumps(normalized_items),
    )
    db.session.add(order)
    db.session.commit()

    return ok({
        "order_id": order.id,
        "status": _canonical_status(order.status),
        "total": float(total_ghs),
        "created_at": order.created_at.isoformat() if order.created_at else None,
        "token": order.order_public_token,
    }, 201)


@orders_bp.route("", methods=["GET"])
@jwt_required()
def list_orders():
    uid = int(get_jwt_identity())
    orders = Order.query.filter_by(customer_id=uid).order_by(Order.created_at.desc()).limit(50).all()
    return ok({"orders": [_order_to_json(o) for o in orders]})


@orders_bp.route("/<int:order_id>", methods=["GET"])
@jwt_required(optional=True)
def get_order(order_id):
    uid = get_jwt_identity()
    order = Order.query.get(order_id)
    if not order:
        return error("Order not found", 404)

    if uid is not None:
        try:
            claims = get_jwt() or {}
        except Exception:
            claims = {}
        role = claims.get("type") or claims.get("role")
        if role != "customer":
            return error("Customer auth required", 403)
        if order.customer_id != int(uid):
            return error("Forbidden", 403)
    else:
        token = request.args.get("token")
        if not token or order.order_public_token != token:
            return error("Invalid or missing token", 403)

    driver = order.driver if order.driver_id else None
    timeline = [
        {"status": "NEW", "timestamp": order.created_at.isoformat() if order.created_at else None},
    ]
    if order.vendor_accepted_at:
        timeline.append({"status": "PREPARING", "timestamp": order.vendor_accepted_at.isoformat()})
    if order.driver_assigned_at:
        timeline.append({"status": "ASSIGNED", "timestamp": order.driver_assigned_at.isoformat()})
    if order.delivered_at:
        timeline.append({"status": "COMPLETED", "timestamp": order.delivered_at.isoformat()})

    items = [
        {
            "name": i.menu_item.name,
            "qty": i.quantity,
            "unit_price": round(i.unit_price_cents / 100.0, 2),
        }
        for i in order.items
    ]
    if not items and order.items_snapshot:
        try:
            items = json.loads(order.items_snapshot)
        except Exception:
            items = []

    return ok({
        "id": order.id,
        "status": _canonical_status(order.status),
        "status_raw": order.status,
        "totals": {
            "items_subtotal": round(order.subtotal_cents / 100.0, 2),
            "delivery_fee": round(order.delivery_fee_cents / 100.0, 2),
            "total": round(order.total_cents / 100.0, 2),
        },
        "created_at": order.created_at.isoformat() if order.created_at else None,
        "timeline": timeline,
        "notes": order.notes,
        "customer": {
            "name": order.customer_name or (order.customer.full_name if order.customer else None),
            "phone": order.customer_phone,
        },
        "vendor": {
            "id": order.vendor_id,
            "name": order.vendor.name if order.vendor else None,
            "whatsapp_number": order.vendor.whatsapp_number if order.vendor else None,
            "lat": order.vendor.lat if order.vendor else None,
            "lng": order.vendor.lng if order.vendor else None,
        },
        "driver": {
            "id": driver.id,
            "name": driver.full_name,
            "phone": driver.phone,
        } if driver else None,
        "dropoff": {
            "address_text": order.delivery_address.address_text if order.delivery_address else None,
            "lat": order.delivery_address.lat if order.delivery_address else None,
            "lng": order.delivery_address.lng if order.delivery_address else None,
        },
        "items": items,
    })


@orders_bp.route("/<int:order_id>/status", methods=["POST"])
@jwt_required()
def update_order_status(order_id):
    """Driver-only: update order status to PICKED_UP or DELIVERED."""
    claims = get_jwt() or {}
    if claims.get("type") != "driver":
        return error("Driver auth required", 403)
    did = int(get_jwt_identity())
    order = Order.query.filter_by(id=order_id, driver_id=did).first()
    if not order:
        return error("Order not found", 404)
    data = request.get_json() or {}
    status = (data.get("status") or "").upper()
    try:
        if status == "PICKED_UP":
            set_order_status(order, Order.STATUS_PICKED_UP, actor="driver")
        elif status == "DELIVERED":
            set_order_status(order, Order.STATUS_DELIVERED, actor="driver")
        else:
            return error("status must be PICKED_UP or DELIVERED", 400)
    except OrderStatusError as e:
        return error(str(e), 400)
    return ok(_order_to_json(
        order,
        include_vendor=True,
        include_driver=True,
        include_address=True,
        include_pricing=True,
    ))
