"""List vendors (approved only for customers)."""
from time import sleep, time

from flask import Blueprint, request
from flask_jwt_extended import create_access_token
from werkzeug.security import check_password_hash

from ..models import Vendor
from ..utils.auth import check_password
from ..utils.responses import ok, error

vendors_bp = Blueprint("vendors", __name__)

_PIN_RATE_LIMIT = {}
_PIN_WINDOW_SECONDS = 300
_PIN_MAX_ATTEMPTS = 6

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
    }


def _rate_limit_key():
    return request.remote_addr or "unknown"


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


@vendors_bp.route("", methods=["GET"])
def list_vendors():
    # Customers see only approved vendors
    vendors = Vendor.query.filter_by(approved=True, vendor_is_active=True).all()
    return ok({"vendors": [_vendor_to_json(v) for v in vendors]})


@vendors_bp.route("/<int:vendor_id>/verify-pin", methods=["POST"])
def verify_pin(vendor_id: int):
    if _is_rate_limited(_rate_limit_key()):
        return error("Too many attempts. Try again later.", 429)

    data = request.get_json() or {}
    pin = data.get("pin")
    if not pin:
        return error("Missing pin", 400)

    vendor = Vendor.query.get(vendor_id)
    if not vendor or not vendor.vendor_is_active:
        return error("Vendor not found", 404)

    if vendor.vendor_pin_hash:
        valid = check_password_hash(vendor.vendor_pin_hash, str(pin))
    elif vendor.pin_hash:
        valid = check_password(str(pin), vendor.pin_hash)
    else:
        valid = False

    if not valid:
        _record_failure(_rate_limit_key())
        sleep(0.5)
        return error("Invalid PIN", 401)

    token = create_access_token(
        identity=str(vendor.id),
        additional_claims={"role": "vendor", "vendor_id": vendor.id},
    )
    return ok({"token": token, "vendorId": vendor.id, "vendorName": vendor.name})
