"""Customer convenience endpoints."""
from flask import Blueprint

from .orders import create_order, get_order, apply_promo

customer_bp = Blueprint("customer", __name__)


@customer_bp.route("/orders", methods=["POST"])
def create_customer_order():
    return create_order()


@customer_bp.route("/orders/<int:order_id>", methods=["GET"])
def get_customer_order(order_id: int):
    return get_order(order_id)


@customer_bp.route("/apply-promo", methods=["POST"])
def apply_promo_code():
    return apply_promo()
