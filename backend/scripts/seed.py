"""Seed: one vendor + menu items + one driver for testing."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import create_app
from app.extensions import db
from app.models import User, Driver, Vendor, MenuItem, Address, ConfigModel, DeliveryPricingConfig
from werkzeug.security import generate_password_hash

from werkzeug.security import generate_password_hash

from app.utils.auth import hash_password


def seed():
    app = create_app()
    with app.app_context():
        # Legacy key/value config (optional)
        for key, value in [
            ("delivery_base_fee_cents", "500"),
            ("delivery_per_km_cents", "100"),
            ("delivery_free_km", "3"),
        ]:
            row = ConfigModel.query.filter_by(key=key).first()
            if not row:
                db.session.add(ConfigModel(key=key, value=value))
        # Single active delivery pricing config (hybrid base + per_km)
        if not DeliveryPricingConfig.query.first():
            db.session.add(DeliveryPricingConfig(base_km=3.0, base_fee_ghs=12, per_km_fee_ghs=2))
        db.session.commit()

        # One vendor (approved)
        default_vendor_pin = os.getenv("VENDOR_DEFAULT_PIN", "1234")
        v = Vendor.query.filter_by(name="Test Kitchen").first()
        if not v:
            v = Vendor(
                name="Test Kitchen",
                vendor_type=Vendor.VENDOR_TYPE_DASHBOARD,
                whatsapp_number="+233200000000",
                pin_hash=hash_password(default_vendor_pin),
                vendor_pin_hash=generate_password_hash(default_vendor_pin),
                lat=5.6037,
                lng=-0.1870,
                approved=True,
            )
            db.session.add(v)
            db.session.flush()
            print("Created vendor 'Test Kitchen'.")
        elif not v.pin_hash:
            v.pin_hash = hash_password(default_vendor_pin)
            db.session.add(v)
        if not v.vendor_pin_hash:
            v.vendor_pin_hash = generate_password_hash(default_vendor_pin)
            db.session.add(v)

        # Ensure vendor has menu items for end-to-end testing
        if MenuItem.query.filter_by(vendor_id=v.id).count() == 0:
            for name, price_cents in [
                ("Jollof Rice", 2500),
                ("Waakye", 2000),
                ("Banku & Tilapia", 3500),
                ("Shito", 500),
            ]:
                db.session.add(MenuItem(vendor_id=v.id, name=name, price_cents=price_cents, is_available=True))
            db.session.commit()
            print("Seeded 4 menu items for 'Test Kitchen'.")
        else:
            db.session.commit()
            print("Vendor 'Test Kitchen' already exists with menu items.")

        # Drivers (approved)
        d = Driver.query.filter_by(email="driver@rova.test").first()
        if not d:
            d = Driver(
                email="driver@rova.test",
                password_hash=hash_password("driver123"),
                full_name="Test Driver",
                phone="+233201111111",
                approved=True,
                driver_is_active=True,
                driver_pin_hash=generate_password_hash("1111"),
                is_online=False,
                last_known_lat=5.6040,
                last_known_lng=-0.1860,
            )
            db.session.add(d)
            db.session.commit()
            print("Created driver driver@rova.test / driver123 (PIN 1111)")
        else:
            if not d.driver_pin_hash:
                d.driver_pin_hash = generate_password_hash("1111")
            d.driver_is_active = True
            db.session.add(d)
            db.session.commit()
            print("Driver driver@rova.test already exists.")

        d2 = Driver.query.filter_by(email="driver2@rova.test").first()
        if not d2:
            d2 = Driver(
                email="driver2@rova.test",
                password_hash=hash_password("driver234"),
                full_name="Test Driver 2",
                phone="+233201111112",
                approved=True,
                driver_is_active=True,
                driver_pin_hash=generate_password_hash("2222"),
                is_online=False,
                last_known_lat=5.6050,
                last_known_lng=-0.1850,
            )
            db.session.add(d2)
            db.session.commit()
            print("Created driver driver2@rova.test / driver234 (PIN 2222)")
        else:
            if not d2.driver_pin_hash:
                d2.driver_pin_hash = generate_password_hash("2222")
            d2.driver_is_active = True
            db.session.add(d2)
            db.session.commit()
            print("Driver driver2@rova.test already exists.")

        # Optional: one customer
        u = User.query.filter_by(email="customer@rova.test").first()
        if not u:
            u = User(
                email="customer@rova.test",
                password_hash=hash_password("customer123"),
                full_name="Test Customer",
            )
            db.session.add(u)
            db.session.flush()
            db.session.add(Address(user_id=u.id, label="Home", address_text="1 Independence Ave, Accra", lat=5.6030, lng=-0.1875))
            db.session.commit()
            print("Created customer customer@rova.test / customer123 with one address.")
        else:
            print("Customer customer@rova.test already exists.")

        print("Seed done.")


if __name__ == "__main__":
    seed()
