"""WhatsApp-ready order message generator (no WhatsApp API integration)."""
from ..models import Order


def format_order_message_for_whatsapp(order: Order) -> str:
    """Return a single text block suitable to send to vendor via WhatsApp."""
    addr = order.delivery_address
    lines = [
        f"*New order #{order.id}*",
        "",
        "Items:",
    ]
    for item in order.items:
        lines.append(f"  • {item.menu_item.name} x{item.quantity} — GHS {item.unit_price_cents * item.quantity / 100:.2f}")
    lines.extend([
        "",
        f"Subtotal: GHS {order.subtotal_cents / 100:.2f}",
        f"Delivery: GHS {order.delivery_fee_cents / 100:.2f}",
        f"*Total: GHS {order.total_cents / 100:.2f}*",
        "",
        "Pickup time: ASAP",
        f"Delivery address: {addr.address_text}",
    ])
    if addr.lat and addr.lng:
        lines.append(f"Location: https://www.google.com/maps?q={addr.lat},{addr.lng}")
    if order.notes:
        lines.append(f"Notes: {order.notes}")
    lines.append("")
    lines.append("Reply ACCEPT to confirm, READY when order is ready, or REJECT to cancel.")
    lines.append(f"Include order id #{order.id} in your reply if possible.")
    return "\n".join(lines)
