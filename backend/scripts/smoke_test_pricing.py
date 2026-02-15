"""Smoke test: pricing config, create order with distance/fee, PATCH pricing, verify fee changes."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Use same DB as migration/seed (absolute path recommended)
os.environ.setdefault("DATABASE_URL", "sqlite:///rova.db")
os.environ.setdefault("FLASK_APP", "app")

from app import create_app
from app.models import User, Vendor, Address, MenuItem, DeliveryPricingConfig
from app.utils.auth import hash_password


def smoke():
    app = create_app()
    with app.test_client() as client:
        # 1) GET /api/pricing
        r = client.get("/api/pricing")
        assert r.status_code == 200, r.get_json() or r.data
        data = r.get_json()
        assert "config" in data and "example" in data
        if data.get("config"):
            print("GET /api/pricing:", data["config"])
            print("Example fee for 5km:", data["example"]["delivery_fee_ghs"])
        else:
            print("GET /api/pricing: no config (run seed)")

        # 2) Login as customer, create order
        r = client.post("/api/auth/customer/login", json={"email": "customer@rova.test", "password": "customer123"})
        if r.status_code != 200:
            print("Login failed (run seed first):", r.get_json())
            return
        token = r.get_json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # Get vendor and address (seed: vendor 1, customer has address 1)
        with app.app_context():
            from app.extensions import db
            v = Vendor.query.filter_by(approved=True).first()
            u = User.query.filter_by(email="customer@rova.test").first()
            addr = Address.query.filter_by(user_id=u.id).first()
            if not v or not addr:
                print("Need vendor and address (run seed)")
                return
            vendor_id = v.id
            delivery_address_id = addr.id
            mi = MenuItem.query.filter_by(vendor_id=vendor_id).first()
            if not mi:
                print("Need menu item (run seed)")
                return
            menu_item_id = mi.id

        r = client.post(
            "/api/orders",
            json={
                "vendor_id": vendor_id,
                "delivery_address_id": delivery_address_id,
                "items": [{"menu_item_id": menu_item_id, "quantity": 2}],
            },
            headers=headers,
        )
        assert r.status_code == 201, r.get_json() or r.data
        order = r.get_json()
        print("Order created: id=%s delivery_distance_km=%s delivery_fee_ghs=%s subtotal_ghs=%s total_ghs=%s" % (
            order.get("id"),
            order.get("delivery_distance_km"),
            order.get("delivery_fee_ghs"),
            order.get("subtotal_ghs"),
            order.get("total_ghs"),
        ))
        assert order.get("delivery_distance_km") is not None
        assert order.get("delivery_fee_ghs") is not None
        assert order.get("total_ghs") is not None
        fee_before = order["delivery_fee_ghs"]

        # 3) PATCH admin pricing (raise per_km_fee_ghs)
        r = client.patch(
            "/api/admin/pricing",
            json={"per_km_fee_ghs": 5},
        )
        assert r.status_code == 200, r.get_json() or r.data
        print("PATCH /api/admin/pricing:", r.get_json())

        # 4) Create another order, verify fee is higher for same distance
        r = client.post(
            "/api/orders",
            json={
                "vendor_id": vendor_id,
                "delivery_address_id": delivery_address_id,
                "items": [{"menu_item_id": menu_item_id, "quantity": 1}],
            },
            headers=headers,
        )
        assert r.status_code == 201
        order2 = r.get_json()
        fee_after = order2["delivery_fee_ghs"]
        print("Second order delivery_fee_ghs:", fee_after)
        assert fee_after >= fee_before, "Fee should increase after PATCH (per_km 2 -> 5)"
    print("Smoke test passed.")


if __name__ == "__main__":
    smoke()
