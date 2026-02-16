"""Dispatch: nearest drivers, DriverOffer with 15s window, expire and retry."""
from datetime import datetime, timedelta

from ..extensions import db
from ..models import Driver, Order, DriverOffer
from .pricing import compute_distance_km

OFFER_TTL_SECONDS = 15
MAX_RADIUS_KM = 6.0
MAX_DISPATCH_ATTEMPTS = 5


def find_nearest_drivers(
    pickup_lat: float,
    pickup_lng: float,
    limit: int = 10,
    max_radius_km: float = MAX_RADIUS_KM,
    exclude_driver_ids: set = None,
):
    """
    Return list of (driver, distance_km) sorted by distance.
    Only online, approved drivers with last_known_lat/lng within max_radius_km.
    exclude_driver_ids: drivers already offered for this order (will be passed by run_dispatch).
    """
    exclude_driver_ids = exclude_driver_ids or set()
    drivers = Driver.query.filter_by(is_online=True, approved=True).filter(
        Driver.last_known_lat.isnot(None),
        Driver.last_known_lng.isnot(None),
    ).all()
    out = []
    for d in drivers:
        if d.id in exclude_driver_ids:
            continue
        dist = compute_distance_km(pickup_lat, pickup_lng, d.last_known_lat, d.last_known_lng)
        if dist <= max_radius_km:
            out.append((d, dist))
    out.sort(key=lambda x: x[1])
    return out[:limit]


def create_offer(order_id: int, driver_id: int, ttl_seconds: int = OFFER_TTL_SECONDS) -> DriverOffer:
    """Create a PENDING DriverOffer for a ready order without assigning it yet."""
    now = datetime.utcnow()
    expires_at = now + timedelta(seconds=ttl_seconds)
    offer = DriverOffer(
        order_id=order_id,
        driver_id=driver_id,
        status=DriverOffer.STATUS_PENDING,
        offered_at=now,
        expires_at=expires_at,
    )
    db.session.add(offer)
    order = Order.query.get(order_id)
    if order:
        order.offer_expires_at = expires_at
    db.session.commit()
    return offer


def expire_offers_job(skip_order_id: int | None = None):
    """Mark DriverOffers as EXPIRED where now > expires_at. Call on read (e.g. GET offers)."""
    now = datetime.utcnow()
    expired = DriverOffer.query.filter(
        DriverOffer.status == DriverOffer.STATUS_PENDING,
        DriverOffer.expires_at < now,
    ).all()
    expired_order_ids = set()
    for offer in expired:
        offer.status = DriverOffer.STATUS_EXPIRED
        order = offer.order
        if order:
            expired_order_ids.add(order.id)
    if expired:
        db.session.commit()
        # Try next driver for any expired offers.
        for order_id in expired_order_ids:
            if skip_order_id is not None and order_id == skip_order_id:
                continue
            dispatch_order(order_id)


def _order_pickup_lat_lng(order: Order):
    """Vendor or delivery address as pickup for dispatch."""
    v = order.vendor
    if v and v.lat is not None and v.lng is not None:
        return v.lat, v.lng
    addr = order.delivery_address
    if addr and addr.lat is not None and addr.lng is not None:
        return addr.lat, addr.lng
    return None, None


def _already_offered_driver_ids(order_id: int) -> set:
    """Driver IDs that already have any DriverOffer for this order."""
    offers = DriverOffer.query.filter_by(order_id=order_id).all()
    return {o.driver_id for o in offers}


def dispatch_order(
    order_id: int,
    max_radius_km: float = MAX_RADIUS_KM,
    max_attempts: int = MAX_DISPATCH_ATTEMPTS,
) -> dict:
    """
    Try to assign a driver: create one PENDING offer for the nearest driver.
    If no driver in radius or max_attempts already used (via previous offers), set NEEDS_REASSIGN.
    Returns {"offer": DriverOffer or None, "order": Order, "attempts": N, "status": "offered"|"needs_reassign"}.
    """
    expire_offers_job(skip_order_id=order_id)
    order = Order.query.get(order_id)
    if not order:
        return {"order": None, "offer": None, "error": "Order not found"}
    # If already assigned, do not create a duplicate offer.
    if order.status == Order.STATUS_ASSIGNED:
        pending = DriverOffer.query.filter_by(
            order_id=order_id,
            status=DriverOffer.STATUS_PENDING,
        ).filter(DriverOffer.expires_at > datetime.utcnow()).first()
        return {"order": order, "offer": pending, "status": "assigned"}
    # If there is a pending, unexpired offer, return it.
    pending = DriverOffer.query.filter_by(
        order_id=order_id,
        status=DriverOffer.STATUS_PENDING,
    ).filter(DriverOffer.expires_at > datetime.utcnow()).first()
    if pending:
        return {"order": order, "offer": pending, "status": "offered"}
    if order.status != Order.STATUS_READY:
        return {"order": order, "offer": None, "error": "Order not ready"}
    pickup_lat, pickup_lng = _order_pickup_lat_lng(order)
    if pickup_lat is None or pickup_lng is None:
        return {"order": order, "offer": None, "status": "no_pickup", "error": "No pickup location"}
    already = _already_offered_driver_ids(order_id)
    if len(already) >= max_attempts:
        return {"order": order, "offer": None, "status": "needs_reassign", "attempts": len(already)}
    candidates = find_nearest_drivers(pickup_lat, pickup_lng, limit=max_attempts - len(already), max_radius_km=max_radius_km, exclude_driver_ids=already)
    if not candidates:
        return {"order": order, "offer": None, "status": "needs_reassign"}
    driver, _ = candidates[0]
    offer = create_offer(order_id, driver.id, ttl_seconds=OFFER_TTL_SECONDS)
    return {"order": Order.query.get(order_id), "offer": offer, "status": "offered", "attempts": len(already) + 1}


def try_next_driver_after_decline_or_expire(order_id: int) -> dict:
    """After driver declines or offer expires, try next nearest. Returns same shape as run_dispatch."""
    return dispatch_order(order_id, max_radius_km=MAX_RADIUS_KM, max_attempts=MAX_DISPATCH_ATTEMPTS)


# Backward compatibility: keep old name for callers.
def run_dispatch(order_id: int, max_radius_km: float = MAX_RADIUS_KM, max_attempts: int = MAX_DISPATCH_ATTEMPTS) -> dict:
    return dispatch_order(order_id, max_radius_km=max_radius_km, max_attempts=max_attempts)
