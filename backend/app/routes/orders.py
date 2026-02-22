"""Orders: create, list, get (track status)."""
import json
from datetime import datetime
from decimal import Decimal, InvalidOperation
from uuid import uuid4

from flask import Blueprint, request
from flask_jwt_extended import get_jwt, get_jwt_identity, jwt_required
from werkzeug.security import generate_password_hash

from ..extensions import db
from ..models import Order, OrderItem, Vendor, Address, MenuItem, User, PromoCode
from ..services.pricing import compute_distance_km, calculate_fee_breakdown
from ..services.order_state import OrderStatusError, normalize_status
from ..utils.responses import ok, error
from ..utils.validators import validate_required, validate_positive_int

orders_bp = Blueprint("orders", __name__)


def _normalize_promo_code(code: str) -> str:
    return (code or "").strip().upper()


def _parse_payment_method(raw):
    if raw is None or str(raw).strip() == "":
        return Order.PAYMENT_METHOD_CASH
    method = str(raw).strip().lower()
    if method in Order.PAYMENT_METHODS:
        return method
    raise ValueError("payment_method must be cash, momo, or card")


def _validate_promo(promo: PromoCode) -> None:
    if not promo or not promo.is_active:
        raise ValueError("Promo code is invalid or inactive")
    if promo.expires_at and promo.expires_at < datetime.utcnow():
        raise ValueError("Promo code has expired")
    if promo.max_uses is not None and promo.used_count >= promo.max_uses:
        raise ValueError("Promo code usage limit reached")


def _calculate_discount_cents(promo: PromoCode, subtotal_cents: int) -> int:
    if subtotal_cents <= 0:
        return 0
    if promo.type == PromoCode.TYPE_PERCENT:
        if promo.value <= 0 or promo.value > 100:
            raise ValueError("Promo code percent value is invalid")
        discount = int(round(subtotal_cents * (promo.value / 100.0)))
    elif promo.type == PromoCode.TYPE_FIXED:
        if promo.value <= 0:
            raise ValueError("Promo code value is invalid")
        discount = int(promo.value)
    else:
        raise ValueError("Promo code type is invalid")
    return min(max(discount, 0), subtotal_cents)


def _apply_promo_for_preview(code: str, subtotal_cents: int) -> tuple[PromoCode, int]:
    if not code:
        raise ValueError("Promo code is required")
    if subtotal_cents <= 0:
        raise ValueError("subtotal_cents must be positive")
    promo = PromoCode.query.filter_by(code=_normalize_promo_code(code)).first()
    if not promo:
        raise ValueError("Promo code not found")
    _validate_promo(promo)
    discount_cents = _calculate_discount_cents(promo, subtotal_cents)
    if discount_cents <= 0:
        raise ValueError("Promo code does not apply to this subtotal")
    return promo, discount_cents


def _increment_promo_usage(promo: PromoCode) -> bool:
    if not promo:
        return False
    query = PromoCode.query.filter(PromoCode.id == promo.id, PromoCode.is_active.is_(True))
    if promo.expires_at:
        query = query.filter(PromoCode.expires_at >= datetime.utcnow())
    if promo.max_uses is not None:
        query = query.filter(PromoCode.used_count < promo.max_uses)
    updated = query.update(
        {PromoCode.used_count: PromoCode.used_count + 1},
        synchronize_session=False,
    )
    if updated == 0:
        db.session.rollback()
        return False
    return True


def apply_promo():
    data = request.get_json() or {}
    code = (data.get("code") or "").strip()
    vendor_id = data.get("vendor_id")
    subtotal_cents = data.get("subtotal_cents")

    try:
        subtotal_cents = int(subtotal_cents)
    except (TypeError, ValueError):
        return error("subtotal_cents must be an integer", 400)
    if subtotal_cents <= 0:
        return error("subtotal_cents must be positive", 400)
    if vendor_id is None:
        return error("vendor_id is required", 400)
    try:
        vendor_id = int(vendor_id)
    except (TypeError, ValueError):
        return error("vendor_id must be an integer", 400)
    vendor = Vendor.query.filter_by(id=vendor_id, approved=True).first()
    if not vendor:
        return error("Vendor not found", 404)

    try:
        promo, discount_cents = _apply_promo_for_preview(code, subtotal_cents)
    except ValueError as exc:
        return error(str(exc), 400)

    total_cents = max(subtotal_cents - discount_cents, 0)
    return ok({
        "promo_code": promo.code,
        "discount_cents": discount_cents,
        "new_totals": {
            "subtotal_cents": subtotal_cents,
            "discount_cents": discount_cents,
            "total_cents": total_cents,
        },
    })
def _canonical_status(status: str) -> str:
    try:
        return normalize_status(status)
    except Exception:
        return status or "unknown"


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
        "payment_method": o.payment_method,
        "payment_status": o.payment_status,
        "subtotal_cents": o.subtotal_cents,
        "delivery_fee_cents": o.delivery_fee_cents,
        "service_fee_cents": o.service_fee_cents,
        "discount_cents": o.discount_cents,
        "promo_code": o.promo_code,
        "total_cents": o.total_cents,
        "created_at": o.created_at.isoformat() if o.created_at else None,
        "placed_at": o.placed_at.isoformat() if o.placed_at else None,
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
                "notes": i.notes,
                "allow_substitution": i.allow_substitution,
                "substitution_note": i.substitution_note,
            }
            for i in o.items
        ],
    }
    if o.delivery_distance_km is not None:
        d["delivery_distance_km"] = o.delivery_distance_km
    if o.delivery_fee_ghs is not None:
        d["delivery_fee_ghs"] = o.delivery_fee_ghs
    if o.service_fee_ghs is not None:
        d["service_fee_ghs"] = o.service_fee_ghs
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
            "service_fee_cents": o.service_fee_cents,
            "discount_cents": o.discount_cents,
            "promo_code": o.promo_code,
            "total_cents": o.total_cents,
            "delivery_distance_km": o.delivery_distance_km,
            "delivery_fee_ghs": o.delivery_fee_ghs,
            "service_fee_ghs": o.service_fee_ghs,
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

    try:
        payment_method = _parse_payment_method(data.get("payment_method"))
    except ValueError as exc:
        return error(str(exc), 400)
    payment_status = (
        Order.PAYMENT_STATUS_PAID
        if payment_method == Order.PAYMENT_METHOD_CASH
        else Order.PAYMENT_STATUS_PENDING
    )

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
            notes = (row.get("notes") or "").strip() or None
            allow_substitution = bool(
                row.get("allow_substitution")
                or row.get("allow_substitutions")
                or row.get("substitution_allowed")
            )
            substitution_note = (
                row.get("substitution_note")
                or row.get("substitutions")
                or row.get("substitution")
                or ""
            ).strip() or None
            order_items_data.append(
                {
                    "menu_item": mi,
                    "quantity": qty,
                    "unit_price_cents": unit,
                    "notes": notes,
                    "allow_substitution": allow_substitution,
                    "substitution_note": substitution_note,
                }
            )

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
        subtotal_ghs = round(subtotal_cents / 100.0, 2)
        fees = calculate_fee_breakdown(subtotal_ghs, distance_km, vendor)
        delivery_fee_ghs = fees["delivery_fee_ghs"]
        service_fee_ghs = fees["service_fee_ghs"]
        total_ghs = fees["total_ghs"]
        delivery_fee_cents = int(round(delivery_fee_ghs * 100))
        service_fee_cents = int(round(service_fee_ghs * 100))
        total_cents = subtotal_cents + delivery_fee_cents + service_fee_cents

        promo_code = (data.get("promo_code") or "").strip()
        discount_cents = 0
        promo = None
        if promo_code:
            try:
                promo, discount_cents = _apply_promo_for_preview(promo_code, subtotal_cents)
            except ValueError as exc:
                return error(str(exc), 400)
            total_cents = max(total_cents - discount_cents, 0)
            total_ghs = max(round(total_ghs - (discount_cents / 100.0), 2), 0.0)

        order = Order(
            customer_id=uid,
            vendor_id=vendor.id,
            delivery_address_id=addr.id,
            status=Order.STATUS_PLACED,
            payment_method=payment_method,
            payment_status=payment_status,
            subtotal_cents=subtotal_cents,
            delivery_fee_cents=delivery_fee_cents,
            service_fee_cents=service_fee_cents,
            total_cents=total_cents,
            delivery_distance_km=round(distance_km, 4),
            delivery_fee_ghs=delivery_fee_ghs,
            service_fee_ghs=service_fee_ghs,
            subtotal_ghs=subtotal_ghs,
            total_ghs=total_ghs,
            notes=(data.get("notes") or "").strip() or None,
            order_public_token=uuid4().hex,
            placed_at=datetime.utcnow(),
            discount_cents=discount_cents,
            promo_code=promo.code if promo else None,
        )
        db.session.add(order)
        db.session.flush()
        for row in order_items_data:
            oi = OrderItem(
                order_id=order.id,
                menu_item_id=row["menu_item"].id,
                quantity=row["quantity"],
                unit_price_cents=row["unit_price_cents"],
                notes=row.get("notes"),
                allow_substitution=row.get("allow_substitution") or False,
                substitution_note=row.get("substitution_note"),
            )
            db.session.add(oi)
        if promo and not _increment_promo_usage(promo):
            db.session.rollback()
            return error("Promo code usage limit reached", 409)
        db.session.commit()
        return ok(_order_to_json(Order.query.get(order.id)), 201)

    # ---- Public MVP order (no menu lookup, no auth) ----
    if uid is not None:
        return error("Public guest orders must not include Authorization", 400)
    missing = validate_required(data, ["vendor_id", "customer_name", "customer_phone", "dropoff_address", "items"])
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
        notes = (row.get("notes") or "").strip() or None
        allow_substitution = bool(
            row.get("allow_substitution")
            or row.get("allow_substitutions")
            or row.get("substitution_allowed")
        )
        substitution_note = (
            row.get("substitution_note")
            or row.get("substitutions")
            or row.get("substitution")
            or ""
        ).strip() or None
        normalized_items.append(
            {
                "name": name,
                "qty": qty,
                "unit_price": float(unit_price),
                "notes": notes,
                "allow_substitution": allow_substitution,
                "substitution_note": substitution_note,
            }
        )

    fees = calculate_fee_breakdown(float(subtotal_ghs), None, vendor)
    delivery_fee_ghs = Decimal(str(fees["delivery_fee_ghs"]))
    service_fee_ghs = Decimal(str(fees["service_fee_ghs"]))
    total_ghs = Decimal(str(fees["total_ghs"]))
    subtotal_cents = int(round(subtotal_ghs * 100))
    delivery_fee_cents = int(round(delivery_fee_ghs * 100))
    service_fee_cents = int(round(service_fee_ghs * 100))
    total_cents = subtotal_cents + delivery_fee_cents + service_fee_cents

    promo_code = (data.get("promo_code") or "").strip()
    discount_cents = 0
    promo = None
    if promo_code:
        try:
            promo, discount_cents = _apply_promo_for_preview(promo_code, subtotal_cents)
        except ValueError as exc:
            return error(str(exc), 400)
        total_cents = max(total_cents - discount_cents, 0)
        total_ghs = max(total_ghs - Decimal(discount_cents) / Decimal(100), Decimal("0"))

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
        status=Order.STATUS_PLACED,
        payment_method=payment_method,
        payment_status=payment_status,
        subtotal_cents=subtotal_cents,
        delivery_fee_cents=delivery_fee_cents,
        service_fee_cents=service_fee_cents,
        total_cents=total_cents,
        delivery_distance_km=None,
        delivery_fee_ghs=float(delivery_fee_ghs),
        service_fee_ghs=float(service_fee_ghs),
        subtotal_ghs=float(subtotal_ghs),
        total_ghs=float(total_ghs),
        notes=(data.get("notes") or "").strip() or None,
        customer_name=customer_name,
        customer_phone=customer_phone,
        order_public_token=uuid4().hex,
        items_snapshot=json.dumps(normalized_items),
        placed_at=datetime.utcnow(),
        discount_cents=discount_cents,
        promo_code=promo.code if promo else None,
    )
    db.session.add(order)
    if promo and not _increment_promo_usage(promo):
        db.session.rollback()
        return error("Promo code usage limit reached", 409)
    db.session.commit()

    return ok({
        "order_id": order.id,
        "status": order.status,
        "payment_method": order.payment_method,
        "payment_status": order.payment_status,
        "total": float(total_ghs),
        "discount_cents": discount_cents,
        "promo_code": promo.code if promo else None,
        "fees": {
            "subtotal": float(subtotal_ghs),
            "delivery_fee": float(delivery_fee_ghs),
            "service_fee": float(service_fee_ghs),
            "discount": float(Decimal(discount_cents) / Decimal(100)),
            "total": float(total_ghs),
        },
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
    timeline = []
    if order.placed_at or order.created_at:
        timeline.append({"status": "placed", "timestamp": (order.placed_at or order.created_at).isoformat()})
    if order.accepted_at:
        timeline.append({"status": "accepted", "timestamp": order.accepted_at.isoformat()})
    if order.prepared_at:
        timeline.append({"status": "preparing", "timestamp": order.prepared_at.isoformat()})
    if order.assigned_at:
        timeline.append({"status": "assigned", "timestamp": order.assigned_at.isoformat()})
    if order.picked_up_at:
        timeline.append({"status": "picked_up", "timestamp": order.picked_up_at.isoformat()})
    if order.delivered_at:
        timeline.append({"status": "delivered", "timestamp": order.delivered_at.isoformat()})
    if order.declined_at:
        timeline.append({"status": "declined", "timestamp": order.declined_at.isoformat()})
    if order.cancelled_at:
        timeline.append({"status": "cancelled", "timestamp": order.cancelled_at.isoformat()})

    items = [
        {
            "name": i.menu_item.name,
            "qty": i.quantity,
            "unit_price": round(i.unit_price_cents / 100.0, 2),
            "notes": i.notes,
            "allow_substitution": i.allow_substitution,
            "substitution_note": i.substitution_note,
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
        "status": order.status,
        "status_raw": order.status,
        "payment_method": order.payment_method,
        "payment_status": order.payment_status,
        "totals": {
            "items_subtotal": round(order.subtotal_cents / 100.0, 2),
            "delivery_fee": round(order.delivery_fee_cents / 100.0, 2),
            "service_fee": round((order.service_fee_cents or 0) / 100.0, 2),
            "discount": round((order.discount_cents or 0) / 100.0, 2),
            "total": round(order.total_cents / 100.0, 2),
        },
        "promo_code": order.promo_code,
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
        "driver_location": {
            "lat": order.driver_lat,
            "lng": order.driver_lng,
            "updated_at": order.driver_location_updated_at.isoformat()
            if order.driver_location_updated_at
            else None,
        },
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
    order = Order.query.get(order_id)
    if not order:
        return error("Order not found", 404)
    if order.driver_id != did:
        return error("Forbidden", 403)
    data = request.get_json() or {}
    status = (data.get("next_status") or data.get("status") or "").strip()
    try:
        next_status = normalize_status(status)
    except OrderStatusError as e:
        return error(str(e), 400)
    if next_status not in (Order.STATUS_PICKED_UP, Order.STATUS_DELIVERED):
        return error("next_status must be picked_up or delivered", 400)
    try:
        order.set_status(next_status, role="driver")
    except ValueError as e:
        return error(str(e), 400)
    db.session.commit()
    if order.status == Order.STATUS_DELIVERED:
        from ..services.ledger import maybe_create_vendor_credit
        maybe_create_vendor_credit(order)
    return ok(_order_to_json(
        order,
        include_vendor=True,
        include_driver=True,
        include_address=True,
        include_pricing=True,
    ))
