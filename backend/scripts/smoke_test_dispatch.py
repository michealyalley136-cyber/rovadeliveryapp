"""Smoke test: create order -> set Ready -> dispatch -> driver poll offers -> accept -> order ASSIGNED."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

os.environ.setdefault("DATABASE_URL", "sqlite:///rova.db")
os.environ.setdefault("FLASK_APP", "app")

from app import create_app
from app.models import User, Vendor, Address, MenuItem, Driver, Order, DriverOffer
from app.utils.auth import hash_password


def smoke():
    app = create_app()
    with app.test_client() as client:
        # 1) Login as customer, create order
        r = client.post("/api/auth/customer/login", json={"email": "customer@rova.test", "password": "customer123"})
        if r.status_code != 200:
            print("Customer login failed (run seed):", r.get_json())
            return
        token_c = r.get_json()["access_token"]
        headers_c = {"Authorization": f"Bearer {token_c}"}

        with app.app_context():
            v = Vendor.query.filter_by(approved=True).first()
            u = User.query.filter_by(email="customer@rova.test").first()
            addr = Address.query.filter_by(user_id=u.id).first()
            mi = MenuItem.query.filter_by(vendor_id=v.id).first()
            if not all([v, addr, mi]):
                print("Need vendor, address, menu item (run seed)")
                return

        r = client.post(
            "/api/orders",
            json={
                "vendor_id": v.id,
                "delivery_address_id": addr.id,
                "items": [{"menu_item_id": mi.id, "quantity": 1}],
            },
            headers=headers_c,
        )
        assert r.status_code == 201, r.get_json() or r.data
        order_id = r.get_json()["id"]
        print("Order created:", order_id, "status:", r.get_json()["status"])

        # 2) Admin: set order Ready
        r = client.post(f"/api/admin/orders/{order_id}/set-ready")
        assert r.status_code == 200, r.get_json() or r.data
        print("Order set Ready")

        # 3) Driver: go online and set location (near vendor for dispatch)
        r = client.post("/api/auth/driver/login", json={"email": "driver@rova.test", "password": "driver123"})
        if r.status_code != 200:
            print("Driver login failed (run seed):", r.get_json())
            return
        token_d = r.get_json()["access_token"]
        headers_d = {"Authorization": f"Bearer {token_d}"}

        with app.app_context():
            driver = Driver.query.filter_by(email="driver@rova.test").first()
            if not driver:
                print("Driver not found (run seed)")
                return
            driver_id = driver.id
            vendor = Vendor.query.get(v.id)
            # Use vendor lat/lng so driver is within 6 km
            lat = (vendor.lat or 5.6) + 0.001
            lng = vendor.lng or -0.19

        r = client.post("/api/driver/me/location", json={"lat": lat, "lng": lng}, headers=headers_d)
        assert r.status_code == 200, r.get_json()
        r = client.post("/api/driver/me/online", headers=headers_d)
        assert r.status_code == 200, r.get_json()
        print("Driver online and location set")

        # 4) Admin: trigger dispatch
        r = client.post(f"/api/admin/orders/{order_id}/dispatch")
        assert r.status_code == 200, r.get_json() or r.data
        data = r.get_json()
        print("Dispatch result:", data.get("status"), "offer_id:", data.get("offer_id"))
        assert data.get("offer_id"), "Expected an offer to be created"
        offer_id = data["offer_id"]

        # 5) Driver: poll offers
        r = client.get("/api/driver/me/offers", headers=headers_d)
        assert r.status_code == 200, r.get_json()
        offers_data = r.get_json()
        assert offers_data.get("offer"), "Driver should see one pending offer"
        assert offers_data["offer"]["id"] == offer_id
        assert offers_data["offer"]["seconds_remaining"] > 0
        print("Driver sees offer:", offers_data["offer"]["id"], "seconds_remaining:", offers_data["offer"]["seconds_remaining"])

        # 6) Driver: accept offer
        r = client.post(f"/api/driver/me/offers/{offer_id}/accept", headers=headers_d)
        assert r.status_code == 200, r.get_json() or r.data
        print("Driver accepted offer")

        # 7) Verify order is ASSIGNED
        r = client.get(f"/api/orders/{order_id}", headers=headers_c)
        assert r.status_code == 200
        order = r.get_json()
        assert order["status"] == "Assigned", order
        assert order.get("driver_id") == driver_id
        print("Order status:", order["status"], "driver_id:", order["driver_id"])
    print("Dispatch smoke test passed.")


if __name__ == "__main__":
    smoke()
