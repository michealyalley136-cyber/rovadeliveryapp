"""Public pricing: current config + example calculation."""
from flask import Blueprint

from ..services.pricing import get_active_pricing_config, compute_delivery_fee
from ..utils.responses import ok

pricing_bp = Blueprint("pricing", __name__)


@pricing_bp.route("", methods=["GET"])
def get_pricing():
    """Return current delivery pricing config and example calculation inputs."""
    config = get_active_pricing_config()
    if config is None:
        return ok({
            "config": None,
            "example": {
                "message": "No pricing config in DB. Run seed or PATCH /api/admin/pricing.",
                "inputs": {"distance_km": 5.0, "base_km": 3.0, "base_fee_ghs": 12, "per_km_fee_ghs": 2},
                "delivery_fee_ghs": 16.0,
            },
        })
    cfg = config.to_dict()
    example_km = 5.0
    example_fee = compute_delivery_fee(example_km, config)
    return ok({
        "config": cfg,
        "example": {
            "inputs": {
                "distance_km": example_km,
                "base_km": cfg["base_km"],
                "base_fee_ghs": cfg["base_fee_ghs"],
                "per_km_fee_ghs": cfg["per_km_fee_ghs"],
            },
            "delivery_fee_ghs": round(example_fee, 2),
        },
    })
