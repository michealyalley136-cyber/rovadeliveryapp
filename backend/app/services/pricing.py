"""Delivery pricing: Haversine distance, base + per_km fee from DeliveryPricingConfig."""
import math
from sqlalchemy.exc import SQLAlchemyError
from ..extensions import db
from ..models import DeliveryPricingConfig, Vendor

# Earth radius in km
_EARTH_RADIUS_KM = 6371.0


def compute_distance_km(
    pickup_lat: float,
    pickup_lng: float,
    dropoff_lat: float,
    dropoff_lng: float,
) -> float:
    """Haversine formula: distance in km between two (lat, lng) points. No external API."""
    if None in (pickup_lat, pickup_lng, dropoff_lat, dropoff_lng):
        return 0.0
    lat1, lng1 = math.radians(float(pickup_lat)), math.radians(float(pickup_lng))
    lat2, lng2 = math.radians(float(dropoff_lat)), math.radians(float(dropoff_lng))
    dlat = lat2 - lat1
    dlng = lng2 - lng1
    a = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlng / 2) ** 2
    c = 2 * math.asin(min(1.0, math.sqrt(a)))
    return _EARTH_RADIUS_KM * c


def get_active_pricing_config():
    """
    Return the single active DeliveryPricingConfig row.
    If the table exists but is empty, create a default row and return it.
    Never raises DB errors.
    """
    try:
        config = DeliveryPricingConfig.query.first()
    except SQLAlchemyError:
        return None

    if config:
        return config

    # Table exists but no rows: seed a default config.
    try:
        config = DeliveryPricingConfig(
            base_km=3.0,
            base_fee_ghs=12,
            per_km_fee_ghs=2,
            service_fee_percent=0,
            minimum_service_fee_ghs=0,
        )
        db.session.add(config)
        db.session.commit()
        return config
    except SQLAlchemyError:
        db.session.rollback()
        return None


def compute_delivery_fee(distance_km: float | None, config) -> float:
    """
    Compute delivery fee in GHS from distance and config.
    config: DeliveryPricingConfig row or dict with base_km, base_fee_ghs, per_km_fee_ghs.
    """
    if config is None:
        return 12.0  # default base
    if hasattr(config, "base_km"):
        base_km = float(config.base_km or 0)
        base_fee_ghs = float(config.base_fee_ghs or 0)
        per_km_fee_ghs = float(getattr(config, "per_km_fee_ghs", 0) or 0)
    else:
        base_km = float(config.get("base_km") or 0)
        base_fee_ghs = float(config.get("base_fee_ghs") or 0)
        per_km_fee_ghs = float(config.get("per_km_fee_ghs") or 0)
    if distance_km is None:
        return base_fee_ghs
    if distance_km <= base_km or per_km_fee_ghs <= 0:
        return base_fee_ghs
    extra_km = distance_km - base_km
    return base_fee_ghs + extra_km * per_km_fee_ghs


def get_fee_rules(vendor: Vendor | None = None) -> dict:
    """Resolve delivery + service fee rules (vendor overrides > global config > defaults)."""
    config = get_active_pricing_config()

    base_km = float(getattr(config, "base_km", 3.0) or 3.0)
    base_delivery_fee = (
        vendor.base_delivery_fee_ghs
        if vendor and vendor.base_delivery_fee_ghs is not None
        else getattr(config, "base_fee_ghs", 12.0)
    )
    per_km_fee = (
        vendor.per_km_fee_ghs
        if vendor and vendor.per_km_fee_ghs is not None
        else getattr(config, "per_km_fee_ghs", 0.0)
    )
    service_fee_percent = (
        vendor.service_fee_percent
        if vendor and vendor.service_fee_percent is not None
        else getattr(config, "service_fee_percent", 0.0)
    )
    minimum_service_fee = (
        vendor.minimum_service_fee_ghs
        if vendor and vendor.minimum_service_fee_ghs is not None
        else getattr(config, "minimum_service_fee_ghs", 0.0)
    )

    return {
        "base_km": float(base_km),
        "base_delivery_fee_ghs": float(base_delivery_fee or 0),
        "per_km_fee_ghs": float(per_km_fee or 0),
        "service_fee_percent": float(service_fee_percent or 0),
        "minimum_service_fee_ghs": float(minimum_service_fee or 0),
    }


def compute_service_fee(subtotal_ghs: float, service_fee_percent: float, minimum_service_fee_ghs: float) -> float:
    if subtotal_ghs <= 0:
        return 0.0
    fee = subtotal_ghs * (service_fee_percent / 100.0)
    if fee < minimum_service_fee_ghs:
        fee = minimum_service_fee_ghs
    return round(fee, 2)


def calculate_fee_breakdown(subtotal_ghs: float, distance_km: float | None, vendor: Vendor | None = None) -> dict:
    rules = get_fee_rules(vendor)
    delivery_fee = compute_delivery_fee(
        distance_km,
        {
            "base_km": rules["base_km"],
            "base_fee_ghs": rules["base_delivery_fee_ghs"],
            "per_km_fee_ghs": rules["per_km_fee_ghs"],
        },
    )
    service_fee = compute_service_fee(
        subtotal_ghs,
        rules["service_fee_percent"],
        rules["minimum_service_fee_ghs"],
    )
    total = round(subtotal_ghs + delivery_fee + service_fee, 2)
    return {
        "delivery_fee_ghs": round(delivery_fee, 2),
        "service_fee_ghs": round(service_fee, 2),
        "total_ghs": total,
        "rules": rules,
    }


# Legacy helpers (for backward compat with old Config key/value if still used elsewhere)
def get_config_value(key: str, default=None):
    from ..models import ConfigModel
    row = ConfigModel.query.filter_by(key=key).first()
    if not row or not row.value:
        return default
    try:
        import json
        return json.loads(row.value)
    except (TypeError, ValueError):
        return row.value


def get_pricing_config():
    """Legacy: key/value config. Prefer get_active_pricing_config() + compute_delivery_fee."""
    base_fee_cents = get_config_value("delivery_base_fee_cents", 500)
    per_km_fee_cents = get_config_value("delivery_per_km_cents", 100)
    free_km = get_config_value("delivery_free_km", 3)
    return {
        "base_fee_cents": int(base_fee_cents),
        "per_km_fee_cents": int(per_km_fee_cents),
        "free_km": float(free_km),
    }


def calculate_delivery_fee_cents(distance_km: float) -> int:
    """Legacy: fee in cents. Prefer get_active_pricing_config() + compute_delivery_fee (GHS)."""
    cfg = get_active_pricing_config()
    fee_ghs = compute_delivery_fee(distance_km, cfg)
    return int(round(fee_ghs * 100))
