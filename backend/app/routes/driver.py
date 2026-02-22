"""Driver: /me/location, /me/online, /me/offers, accept/decline by offer_id, picked-up, delivered."""
from datetime import datetime
from time import sleep, time

from flask import Blueprint, request
from flask_jwt_extended import create_access_token, get_jwt, get_jwt_identity, jwt_required
from sqlalchemy import or_
from werkzeug.security import check_password_hash

from ..extensions import db
from ..models import Driver, Order, DriverOffer
from ..services.dispatch import expire_offers_job, try_next_driver_after_decline_or_expire
from ..services.order_state import OrderStatusError, normalize_status
from ..utils.authz import require_role
from ..utils.auth_actor import get_actor_id_or_401
from ..utils.responses import ok, error

driver_bp = Blueprint("driver", __name__)

_PIN_RATE_LIMIT = {}
_PIN_WINDOW_SECONDS = 600
_PIN_MAX_ATTEMPTS = 5


def _rate_limit_key(driver_id: int) -> str:
    return f"{request.remote_addr or 'unknown'}:{driver_id}"


def _is_rate_limited(key: str) -> bool:
    entry = _PIN_RATE_LIMIT.get(key)
    now = time()
    if not entry or now - entry["start"] > _PIN_WINDOW_SECONDS:
        _PIN_RATE_LIMIT[key] = {"count": 0, "start": now}
        return False
    return entry["count"] >= _PIN_MAX_ATTEMPTS


def _record_failure(key: str) -> None:
    entry = _PIN_RATE_LIMIT.get(key)
    if not entry:
        _PIN_RATE_LIMIT[key] = {"count": 1, "start": time()}
        return
    entry["count"] += 1


def _get_driver_id_from_jwt():
    claims = get_jwt() or {}
    driver_id = claims.get("driver_id") or get_jwt_identity()
    try:
        return int(driver_id)
    except (TypeError, ValueError):
        return None


def _mask_phone(phone: str | None) -> str | None:
    if not phone:
        return None
    if len(phone) <= 4:
        return "*" * len(phone)
    return f"{phone[:3]}****{phone[-2:]}"


def _append_note(order: Order, line: str) -> None:
    if order.notes:
        order.notes = f"{order.notes}\n{line}"
    else:
        order.notes = line


def _assign_order_atomic(order_id: int, driver_id: int) -> bool:
    """Atomic assignment: set status=assigned + driver_id if order is ready and unassigned."""
    now = datetime.utcnow()
    updated = (
        Order.query.filter(
            Order.id == order_id,
            Order.status == Order.STATUS_READY,
            Order.driver_id.is_(None),
            or_(Order.offer_expires_at.is_(None), Order.offer_expires_at >= now),
        )
        .update(
            {
                "status": Order.STATUS_ASSIGNED,
                "driver_id": driver_id,
                "assigned_at": now,
                "driver_status": Order.DRIVER_STATUS_ACCEPTED,
                "offer_expires_at": None,
            },
            synchronize_session=False,
        )
    )
    if updated == 0:
        db.session.rollback()
        return False
    db.session.commit()
    return True


def _driver_public_json(d: Driver) -> dict:
    return {
        "id": d.id,
        "name": d.full_name or f"Driver {d.id}",
        "phone_masked": _mask_phone(d.phone),
    }


def _driver_order_json(o: Order) -> dict:
    return {
        "id": o.id,
        "status": o.status,
        "driver_status": o.driver_status,
        "vendor_id": o.vendor_id,
        "vendor_name": o.vendor.name if o.vendor else None,
        "pickup": {
            "name": o.vendor.name if o.vendor else None,
            "lat": o.vendor.lat if o.vendor else None,
            "lng": o.vendor.lng if o.vendor else None,
        },
        "dropoff": {
            "address_text": o.delivery_address.address_text if o.delivery_address else None,
            "lat": o.delivery_address.lat if o.delivery_address else None,
            "lng": o.delivery_address.lng if o.delivery_address else None,
        },
        "totals": {
            "subtotal_cents": o.subtotal_cents,
            "delivery_fee_cents": o.delivery_fee_cents,
            "service_fee_cents": o.service_fee_cents,
            "total_cents": o.total_cents,
            "subtotal_ghs": o.subtotal_ghs,
            "delivery_fee_ghs": o.delivery_fee_ghs,
            "service_fee_ghs": o.service_fee_ghs,
            "total_ghs": o.total_ghs,
        },
        "delivery_distance_km": o.delivery_distance_km,
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
    }


def _order_summary(o):
    d = {
        "id": o.id,
        "status": o.status,
        "driver_status": o.driver_status,
        "total_cents": o.total_cents,
        "delivery_address_id": o.delivery_address_id,
        "vendor_id": o.vendor_id,
    }
    if o.delivery_fee_ghs is not None:
        d["delivery_fee_ghs"] = o.delivery_fee_ghs
    if o.vendor:
        d["pickup_text"] = o.vendor.name or f"Vendor #{o.vendor_id}"
    else:
        d["pickup_text"] = f"Vendor #{o.vendor_id}"
    if o.delivery_address:
        d["dropoff_text"] = o.delivery_address.address_text or f"Address #{o.delivery_address_id}"
    else:
        d["dropoff_text"] = f"Address #{o.delivery_address_id}"
    return d


def _offer_to_json(offer):
    if not offer:
        return None
    now = datetime.utcnow()
    secs = max(0, (offer.expires_at - now).total_seconds()) if offer.expires_at else 0
    return {
        "id": offer.id,
        "order_id": offer.order_id,
        "status": offer.status,
        "offered_at": offer.offered_at.isoformat() if offer.offered_at else None,
        "expires_at": offer.expires_at.isoformat() if offer.expires_at else None,
        "seconds_remaining": int(secs),
        "order": _order_summary(offer.order) if offer.order else None,
    }


# ---- Public driver auth (PIN) ----


def _driver_auth_response(driver: Driver):
    token = create_access_token(
        identity=str(driver.id),
        additional_claims={"type": "driver", "role": "driver", "driver_id": driver.id},
    )
    return ok({
        "token": token,
        "driver": {
            "id": driver.id,
            "name": driver.full_name or f"Driver {driver.id}",
            "phone": driver.phone,
            "is_available": bool(driver.is_online),
        },
    })

@driver_bp.route("", methods=["GET"])
def list_drivers():
    drivers = Driver.query.filter_by(driver_is_active=True, approved=True).all()
    return ok({"drivers": [_driver_public_json(d) for d in drivers]})


@driver_bp.route("/auth/pin", methods=["POST"])
def driver_auth_pin():
    data = request.get_json() or {}
    pin = data.get("pin")
    if not pin:
        return error("Missing pin", 400)
    driver_id = data.get("driver_id")
    phone = (data.get("phone") or "").strip()
    driver = None
    if driver_id is not None:
        try:
            driver_id = int(driver_id)
        except (TypeError, ValueError):
            return error("driver_id must be an integer", 400)
        driver = Driver.query.get(driver_id)
    elif phone:
        driver = Driver.query.filter_by(phone=phone).first()
    else:
        return error("driver_id or phone required", 400)

    if not driver or not driver.driver_is_active or not driver.approved:
        return error("Driver not found", 404)
    if not driver.driver_pin_hash:
        return error("Driver PIN not set", 404)
    if _is_rate_limited(_rate_limit_key(driver.id)):
        return error("Too many attempts. Try again later.", 429)
    if not check_password_hash(driver.driver_pin_hash, str(pin)):
        _record_failure(_rate_limit_key(driver.id))
        sleep(0.5)
        return error("Invalid PIN", 401)

    return _driver_auth_response(driver)


@driver_bp.route("/<int:driver_id>/verify-pin", methods=["POST"])
def verify_pin(driver_id: int):
    if _is_rate_limited(_rate_limit_key(driver_id)):
        return error("Too many attempts. Try again later.", 429)
    data = request.get_json() or {}
    pin = data.get("pin")
    if not pin:
        return error("Missing pin", 400)
    driver = Driver.query.get(driver_id)
    if not driver or not driver.driver_is_active or not driver.approved:
        return error("Driver not found", 404)
    if not driver.driver_pin_hash:
        return error("Driver PIN not set", 404)
    if not check_password_hash(driver.driver_pin_hash, str(pin)):
        _record_failure(_rate_limit_key(driver_id))
        sleep(0.5)
        return error("Invalid PIN", 401)

    return _driver_auth_response(driver)


# ---- /me/* (auth driver, own data only) ----

@driver_bp.route("/me/location", methods=["POST"])
@require_role("driver")
def me_set_location():
    """Set last_known_lat/lng for the authenticated driver."""
    did = int(get_jwt_identity())
    driver = Driver.query.get(did)
    if not driver:
        return error("Driver not found", 404)
    data = request.get_json() or {}
    lat, lng = data.get("lat"), data.get("lng")
    if lat is None or lng is None:
        return error("lat and lng required", 400)
    try:
        driver.last_known_lat = float(lat)
        driver.last_known_lng = float(lng)
        driver.last_location_at = datetime.utcnow()
    except (TypeError, ValueError):
        return error("lat and lng must be numbers", 400)
    db.session.commit()
    return ok({"lat": driver.last_known_lat, "lng": driver.last_known_lng})


@driver_bp.route("/me", methods=["GET"])
@require_role("driver")
def me_profile():
    did = int(get_jwt_identity())
    driver = Driver.query.get(did)
    if not driver:
        return error("Driver not found", 404)
    return ok({
        "id": driver.id,
        "name": driver.full_name,
        "phone": driver.phone,
        "approved": driver.approved,
        "is_active": driver.driver_is_active,
        "is_available": bool(driver.is_online),
        "last_known_lat": driver.last_known_lat,
        "last_known_lng": driver.last_known_lng,
        "last_location_at": driver.last_location_at.isoformat() if driver.last_location_at else None,
    })


@driver_bp.route("/me/online", methods=["POST"])
@require_role("driver")
def me_go_online():
    did = int(get_jwt_identity())
    driver = Driver.query.get(did)
    if not driver:
        return error("Driver not found", 404)
    data = request.get_json(silent=True) or {}
    if "is_online" in data:
        driver.is_online = bool(data["is_online"])
    else:
        driver.is_online = True
    db.session.commit()
    return ok({"is_online": driver.is_online})


@driver_bp.route("/me/availability", methods=["PATCH"])
@require_role("driver")
def me_set_availability():
    did = int(get_jwt_identity())
    driver = Driver.query.get(did)
    if not driver:
        return error("Driver not found", 404)
    data = request.get_json() or {}
    if "is_available" not in data:
        return error("is_available is required", 400)
    driver.is_online = bool(data.get("is_available"))
    db.session.commit()
    return ok({"is_available": bool(driver.is_online)})


@driver_bp.route("/me/offline", methods=["POST"])
@require_role("driver")
def me_go_offline():
    did = int(get_jwt_identity())
    driver = Driver.query.get(did)
    if not driver:
        return error("Driver not found", 404)
    driver.is_online = False
    db.session.commit()
    return ok({"is_online": False})


@driver_bp.route("/me/offers", methods=["GET"])
@require_role("driver")
def me_list_offers():
    """Return active PENDING offer for this driver (if any) + seconds_remaining. Expire stale offers on read."""
    did = int(get_jwt_identity())
    expire_offers_job()
    offer = DriverOffer.query.filter_by(
        driver_id=did,
        status=DriverOffer.STATUS_PENDING,
    ).filter(DriverOffer.expires_at > datetime.utcnow()).first()
    return ok({"offer": _offer_to_json(offer)})


@driver_bp.route("/me/offers/<int:offer_id>/accept", methods=["POST"])
@require_role("driver")
def me_accept_offer(offer_id):
    """Accept offer if not expired. Idempotent: if already ACCEPTED for this driver, return 200."""
    did = int(get_jwt_identity())
    offer = DriverOffer.query.filter_by(id=offer_id, driver_id=did).first()
    if not offer:
        return error("Offer not found", 404)
    if offer.status == DriverOffer.STATUS_ACCEPTED:
        return ok(_offer_to_json(offer))  # idempotent
    if offer.status != DriverOffer.STATUS_PENDING:
        return error("Offer no longer available", 400)
    if offer.expires_at < datetime.utcnow():
        offer.status = DriverOffer.STATUS_EXPIRED
        if offer.order and offer.order.driver_id == did:
            offer.order.driver_id = None
            offer.order.status = Order.STATUS_READY
        db.session.commit()
        return error("Offer expired", 400)
    order = offer.order
    if order and not _assign_order_atomic(order.id, did):
        return error("Order already assigned", 409)
    offer.status = DriverOffer.STATUS_ACCEPTED
    db.session.commit()
    return ok(_offer_to_json(DriverOffer.query.get(offer_id)))


@driver_bp.route("/me/offers/<int:offer_id>/decline", methods=["POST"])
@require_role("driver")
def me_decline_offer(offer_id):
    """Decline offer; triggers next driver attempt."""
    did = int(get_jwt_identity())
    offer = DriverOffer.query.filter_by(id=offer_id, driver_id=did).first()
    if not offer:
        return error("Offer not found", 404)
    if offer.status != DriverOffer.STATUS_PENDING:
        return ok({"declined": True, "message": "Offer already resolved"})
    if offer.expires_at < datetime.utcnow():
        offer.status = DriverOffer.STATUS_EXPIRED
    else:
        offer.status = DriverOffer.STATUS_DECLINED
    db.session.commit()
    result = try_next_driver_after_decline_or_expire(offer.order_id)
    return ok({"declined": True, "next_offered": result.get("offer") is not None})


# ---- Legacy /online, /offline, /location (aliases) ----

@driver_bp.route("/online", methods=["POST"])
@require_role("driver")
def go_online():
    return me_go_online()


@driver_bp.route("/offline", methods=["POST"])
@require_role("driver")
def go_offline():
    return me_go_offline()


@driver_bp.route("/location", methods=["PUT", "POST"])
@require_role("driver")
def update_location():
    return me_set_location()


# ---- Orders: list, picked-up, delivered ----

@driver_bp.route("/orders/ready", methods=["GET"])
@require_role("driver")
def list_ready_orders():
    orders = Order.query.filter(
        Order.status == Order.STATUS_READY,
        Order.driver_id.is_(None),
    ).order_by(Order.created_at.desc()).all()
    return ok({"orders": [_driver_order_json(o) for o in orders]})


@driver_bp.route("/orders/<int:order_id>/accept", methods=["POST"])
@jwt_required(optional=True)
def accept_order(order_id: int):
    did, err = get_actor_id_or_401("driver_id", expected_role="driver")
    if err:
        return err
    driver = Driver.query.get(did)
    if not driver or not driver.driver_is_active:
        return error("Driver not found", 404)
    if not driver.is_online:
        return error("Driver not available", 409)

    if not _assign_order_atomic(order_id, did):
        return error("Order already assigned, not ready, or offer expired", 409)

    order = Order.query.get(order_id)
    if not order:
        return error("Order not found", 404)
    _append_note(order, f"[{datetime.utcnow().isoformat()}Z] driver {did} accepted order")
    db.session.commit()
    return ok(_driver_order_json(order))


# Backward compatibility
@driver_bp.route("/orders/<int:order_id>/claim", methods=["POST"])
@require_role("driver")
def claim_order(order_id: int):
    return accept_order(order_id)


@driver_bp.route("/orders/<int:order_id>/location", methods=["POST", "PATCH"])
@jwt_required(optional=True)
def update_order_location(order_id: int):
    did, err = get_actor_id_or_401("driver_id", expected_role="driver")
    if err:
        return err
    order = Order.query.get(order_id)
    if not order:
        return error("Order not found", 404)
    if order.driver_id != did:
        return error("Forbidden", 403)

    data = request.get_json() or {}
    lat = data.get("lat", data.get("driver_lat"))
    lng = data.get("lng", data.get("driver_lng"))
    if lat is None or lng is None:
        return error("lat and lng required", 400)
    try:
        lat = float(lat)
        lng = float(lng)
    except (TypeError, ValueError):
        return error("lat and lng must be numbers", 400)

    order.driver_lat = lat
    order.driver_lng = lng
    order.driver_location_updated_at = datetime.utcnow()
    if order.driver:
        order.driver.last_known_lat = lat
        order.driver.last_known_lng = lng
        order.driver.last_location_at = order.driver_location_updated_at
    db.session.commit()
    return ok({
        "order_id": order.id,
        "driver_lat": order.driver_lat,
        "driver_lng": order.driver_lng,
        "driver_location_updated_at": order.driver_location_updated_at.isoformat(),
    })


@driver_bp.route("/orders/active", methods=["GET"])
@require_role("driver")
def list_active_orders():
    did = _get_driver_id_from_jwt()
    if not did:
        return error("Invalid driver token", 403)
    orders = (
        Order.query.filter(Order.driver_id == did, Order.status.in_([Order.STATUS_ASSIGNED, Order.STATUS_PICKED_UP]))
        .order_by(Order.created_at.desc())
        .all()
    )
    return ok({"orders": [_driver_order_json(o) for o in orders]})


@driver_bp.route("/orders/completed", methods=["GET"])
@require_role("driver")
def list_completed_orders():
    did = _get_driver_id_from_jwt()
    if not did:
        return error("Invalid driver token", 403)
    orders = (
        Order.query.filter(Order.driver_id == did, Order.status == Order.STATUS_DELIVERED)
        .order_by(Order.created_at.desc())
        .all()
    )
    return ok({"orders": [_driver_order_json(o) for o in orders]})


@driver_bp.route("/orders/<int:order_id>/status", methods=["POST", "PATCH"])
@jwt_required(optional=True)
def update_order_status_driver(order_id: int):
    did, err = get_actor_id_or_401("driver_id", expected_role="driver")
    if err:
        return err
    order = Order.query.get(order_id)
    if not order:
        return error("Order not found", 404)
    if order.driver_id != did:
        return error("Forbidden", 403)
    data = request.get_json() or {}
    requested = (data.get("next_status") or data.get("status") or "").strip()
    if not requested:
        return error("Missing next_status", 400)
    try:
        next_status = normalize_status(requested)
    except OrderStatusError as e:
        return error(str(e), 400)
    if next_status not in (Order.STATUS_PICKED_UP, Order.STATUS_DELIVERED):
        return error("next_status must be picked_up or delivered", 400)

    try:
        order.set_status(next_status, role="driver")
    except ValueError as e:
        return error(str(e), 400)
    _append_note(order, f"[{datetime.utcnow().isoformat()}Z] driver {did} -> {next_status}")
    db.session.commit()
    if order.status == Order.STATUS_DELIVERED:
        from ..services.ledger import maybe_create_vendor_credit
        maybe_create_vendor_credit(order)
    return ok(_driver_order_json(order))


@driver_bp.route("/orders/<int:order_id>/picked-up", methods=["POST"])
@jwt_required(optional=True)
def mark_picked_up(order_id):
    did, err = get_actor_id_or_401("driver_id", expected_role="driver")
    if err:
        return err
    order = Order.query.get(order_id)
    if not order:
        return error("Order not found", 404)
    if order.driver_id != did:
        return error("Forbidden", 403)
    try:
        order.set_status(Order.STATUS_PICKED_UP, role="driver")
    except ValueError as e:
        return error(str(e), 400)
    db.session.commit()
    return ok(_order_summary(order))


@driver_bp.route("/orders/<int:order_id>/delivered", methods=["POST"])
@jwt_required(optional=True)
def mark_delivered(order_id):
    did, err = get_actor_id_or_401("driver_id", expected_role="driver")
    if err:
        return err
    order = Order.query.get(order_id)
    if not order:
        return error("Order not found", 404)
    if order.driver_id != did:
        return error("Forbidden", 403)
    try:
        order.set_status(Order.STATUS_DELIVERED, role="driver")
    except ValueError as e:
        return error(str(e), 400)
    db.session.commit()
    from ..services.ledger import maybe_create_vendor_credit
    maybe_create_vendor_credit(order)
    return ok(_order_summary(order))


@driver_bp.route("/orders", methods=["GET"])
@require_role("driver")
def list_my_orders():
    did = int(get_jwt_identity())
    orders = (
        Order.query.filter(
            Order.driver_id == did,
            Order.status.in_([Order.STATUS_ASSIGNED, Order.STATUS_PICKED_UP]),
        )
        .order_by(Order.created_at.desc())
        .limit(50)
        .all()
    )
    return ok({"orders": [_order_summary(o) for o in orders]})


@driver_bp.route("/orders/<int:order_id>", methods=["PATCH"])
@jwt_required(optional=True)
def update_driver_order(order_id: int):
    did, err = get_actor_id_or_401("driver_id", expected_role="driver")
    if err:
        return err
    order = Order.query.get(order_id)
    if not order:
        return error("Order not found", 404)
    if order.driver_id != did:
        return error("Forbidden", 403)

    data = request.get_json() or {}
    requested = (data.get("action") or data.get("next_status") or data.get("status") or "").strip().lower()
    if not requested:
        return error("Missing action", 400)

    if requested in ("accept", "accepted"):
        if order.status != Order.STATUS_ASSIGNED:
            return error("Order not assigned", 409)
        order.driver_status = Order.DRIVER_STATUS_ACCEPTED
        _append_note(order, f"[{datetime.utcnow().isoformat()}Z] driver {did} accepted job")
        db.session.commit()
        return ok(_driver_order_json(order))

    if requested in ("picked_up", "pickup", "pickedup"):
        if order.status not in (Order.STATUS_ASSIGNED, Order.STATUS_PICKED_UP):
            return error("Order not ready for pickup", 409)
        if order.status != Order.STATUS_PICKED_UP:
            try:
                order.set_status(Order.STATUS_PICKED_UP, role="driver")
            except ValueError as e:
                return error(str(e), 400)
        order.driver_status = Order.DRIVER_STATUS_PICKED_UP
        _append_note(order, f"[{datetime.utcnow().isoformat()}Z] driver {did} picked up")
        db.session.commit()
        return ok(_driver_order_json(order))

    if requested in ("delivered", "dropoff", "drop_off"):
        if order.status != Order.STATUS_PICKED_UP:
            return error("Order not picked up", 409)
        try:
            order.set_status(Order.STATUS_DELIVERED, role="driver")
        except ValueError as e:
            return error(str(e), 400)
        order.driver_status = Order.DRIVER_STATUS_DELIVERED
        _append_note(order, f"[{datetime.utcnow().isoformat()}Z] driver {did} delivered")
        db.session.commit()
        from ..services.ledger import maybe_create_vendor_credit
        maybe_create_vendor_credit(order)
        return ok(_driver_order_json(order))

    return error("Invalid action", 400)


@driver_bp.route("/offers", methods=["GET"])
@require_role("driver")
def list_offers_legacy():
    """Legacy: list by order (assigned to me, not expired). Prefer GET /me/offers."""
    did = int(get_jwt_identity())
    expire_offers_job()
    offers = DriverOffer.query.filter_by(driver_id=did, status=DriverOffer.STATUS_PENDING).filter(
        DriverOffer.expires_at > datetime.utcnow()
    ).all()
    return ok({"offers": [_offer_to_json(o) for o in offers]})
