"""WhatsApp: formatted order message generator; vendor accept/reject/ready (Ops/Admin trigger)."""
from flask import Blueprint, request

from ..models import Order
from ..services.whatsapp_message import format_order_message_for_whatsapp
from ..services.order_state import set_order_status, OrderStatusError
from ..utils.responses import ok, error

whatsapp_bp = Blueprint("whatsapp", __name__)


@whatsapp_bp.route("/order/<int:order_id>/message", methods=["GET"])
def get_order_message(order_id):
    """Return WhatsApp-ready message text for this order. No auth for MVP (admin tool)."""
    order = Order.query.get(order_id)
    if not order:
        return error("Order not found", 404)
    text = format_order_message_for_whatsapp(order)
    return ok({"order_id": order_id, "message": text})


@whatsapp_bp.route("/order/<int:order_id>/accept", methods=["POST"])
def vendor_accept(order_id):
    """Ops/Admin calls after vendor replies ACCEPT."""
    order = Order.query.get(order_id)
    if not order:
        return error("Order not found", 404)
    if order.status in (Order.STATUS_CANCELLED, Order.STATUS_DELIVERED, Order.STATUS_DECLINED):
        return error("Order cannot be accepted in current state", 400)
    try:
        set_order_status(order, Order.STATUS_ACCEPTED, actor="vendor")
    except OrderStatusError as e:
        return error(str(e), 400)
    return ok({"order_id": order_id, "status": order.status})


@whatsapp_bp.route("/order/<int:order_id>/reject", methods=["POST"])
def vendor_reject(order_id):
    """Ops/Admin calls after vendor replies REJECT."""
    order = Order.query.get(order_id)
    if not order:
        return error("Order not found", 404)
    if order.status in (Order.STATUS_CANCELLED, Order.STATUS_DELIVERED, Order.STATUS_DECLINED):
        return error("Order cannot be rejected in current state", 400)
    if order.status in (Order.STATUS_READY, Order.STATUS_ASSIGNED, Order.STATUS_PICKED_UP):
        return error("Order cannot be rejected after Ready/Assigned", 400)
    reason = None
    data = request.get_json(silent=True) or {}
    if "reason" in data:
        reason = (data.get("reason") or "").strip()
    if reason:
        order.notes = f"{(order.notes or '').strip()}\nRejected: {reason}".strip()
    try:
        set_order_status(order, Order.STATUS_DECLINED, actor="vendor")
    except OrderStatusError as e:
        return error(str(e), 409)
    return ok({"order_id": order_id, "status": order.status})


@whatsapp_bp.route("/order/<int:order_id>/ready", methods=["POST"])
def vendor_ready(order_id):
    """Ops/Admin calls after vendor replies READY."""
    order = Order.query.get(order_id)
    if not order:
        return error("Order not found", 404)
    if order.status in (Order.STATUS_CANCELLED, Order.STATUS_DELIVERED, Order.STATUS_DECLINED):
        return error("Order cannot be set Ready in current state", 400)
    if order.status not in (Order.STATUS_PREPARING,):
        return error("Order must be preparing before ready", 400)
    try:
        set_order_status(order, Order.STATUS_READY, actor="vendor")
    except OrderStatusError as e:
        return error(str(e), 400)
    return ok({"order_id": order_id, "status": order.status})
