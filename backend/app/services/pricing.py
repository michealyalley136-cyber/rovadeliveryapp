"""Delivery pricing: Haversine distance, base + per_km fee from DeliveryPricingConfig."""
import math
from sqlalchemy.exc import SQLAlchemyError
from ..extensions import db
from ..models import DeliveryPricingConfig

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
        )
        db.session.add(config)
        db.session.commit()
        return config
    except SQLAlchemyError:
        db.session.rollback()
        return None


def compute_delivery_fee(distance_km: float, config) -> float:
    """
    Compute delivery fee in GHS from distance and config.
    config: DeliveryPricingConfig row or dict with base_km, base_fee_ghs, per_km_fee_ghs.
    """
    if config is None:
        return 12.0  # default base
    if hasattr(config, "base_km"):
        base_km = float(config.base_km)
        base_fee_ghs = float(config.base_fee_ghs)
        per_km_fee_ghs = float(config.per_km_fee_ghs)
    else:
        base_km = float(config["base_km"])
        base_fee_ghs = float(config["base_fee_ghs"])
        per_km_fee_ghs = float(config["per_km_fee_ghs"])
    if distance_km <= base_km:
        return base_fee_ghs
    extra_km = distance_km - base_km
    return base_fee_ghs + extra_km * per_km_fee_ghs


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
