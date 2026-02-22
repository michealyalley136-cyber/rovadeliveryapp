import unittest

from flask_jwt_extended import create_access_token
from sqlalchemy.pool import StaticPool

from app import create_app
from app.extensions import db
from app.models import Address, Driver, Order, User, Vendor
from app.orders.statuses import (
    STATUS_ASSIGNED,
    STATUS_DELIVERED,
    STATUS_NEW,
    STATUS_PICKED_UP,
    STATUS_PREPARING,
    STATUS_READY,
    validate_transition,
)


class OrderStateMachineTests(unittest.TestCase):
    def setUp(self):
        self.app = create_app("testing")
        self.app.config.update(
            TESTING=True,
            SQLALCHEMY_DATABASE_URI="sqlite:///:memory:",
            SQLALCHEMY_ENGINE_OPTIONS={
                "connect_args": {"check_same_thread": False},
                "poolclass": StaticPool,
            },
            ALLOW_DEV_ID_FALLBACK=False,
        )
        self.client = self.app.test_client()

        with self.app.app_context():
            db.create_all()
            user = User(email="user@example.com", password_hash="x", full_name="Test User")
            vendor = Vendor(name="Test Vendor", vendor_type=Vendor.VENDOR_TYPE_DASHBOARD, approved=True)
            driver_a = Driver(
                email="driver_a@example.com",
                password_hash="x",
                full_name="Driver A",
                driver_is_active=True,
            )
            driver_b = Driver(
                email="driver_b@example.com",
                password_hash="x",
                full_name="Driver B",
                driver_is_active=True,
            )
            db.session.add_all([user, vendor, driver_a, driver_b])
            db.session.flush()

            addr = Address(
                user_id=user.id,
                label="Home",
                address_text="123 Test St",
                lat=None,
                lng=None,
            )
            db.session.add(addr)
            db.session.commit()

            self.user_id = user.id
            self.vendor_id = vendor.id
            self.address_id = addr.id
            self.driver_a_id = driver_a.id
            self.driver_b_id = driver_b.id
            self.driver_a_token = create_access_token(
                identity=str(driver_a.id),
                additional_claims={"role": "driver", "type": "driver", "driver_id": driver_a.id},
            )
            self.driver_b_token = create_access_token(
                identity=str(driver_b.id),
                additional_claims={"role": "driver", "type": "driver", "driver_id": driver_b.id},
            )
            self.vendor_token = create_access_token(
                identity=str(vendor.id),
                additional_claims={"role": "vendor", "type": "vendor", "vendor_id": vendor.id},
            )

    def tearDown(self):
        with self.app.app_context():
            db.session.remove()
            db.drop_all()

    def _create_order(self, status, driver_id=None):
        with self.app.app_context():
            order = Order(
                customer_id=self.user_id,
                vendor_id=self.vendor_id,
                driver_id=driver_id,
                delivery_address_id=self.address_id,
                status=status,
                subtotal_cents=1000,
                delivery_fee_cents=200,
                total_cents=1200,
            )
            db.session.add(order)
            db.session.commit()
            return order.id

    def test_vendor_forbidden_transitions(self):
        for next_status in (STATUS_ASSIGNED, STATUS_PICKED_UP, STATUS_DELIVERED):
            with self.assertRaises(ValueError):
                validate_transition(STATUS_NEW, next_status, "vendor")

    def test_driver_forbidden_transitions(self):
        for next_status in (STATUS_PREPARING, STATUS_READY):
            with self.assertRaises(ValueError):
                validate_transition(STATUS_ASSIGNED, next_status, "driver")

    def test_atomic_accept_conflict(self):
        order_id = self._create_order(STATUS_READY)

        resp = self.client.post(
            f"/api/driver/orders/{order_id}/accept",
            headers={"Authorization": f"Bearer {self.driver_a_token}"},
        )
        self.assertEqual(resp.status_code, 200)

        resp2 = self.client.post(
            f"/api/driver/orders/{order_id}/accept",
            headers={"Authorization": f"Bearer {self.driver_b_token}"},
        )
        self.assertEqual(resp2.status_code, 409)

    def test_vendor_transition_enforcement(self):
        order_id = self._create_order(STATUS_NEW)

        resp = self.client.post(
            f"/api/vendor/orders/{order_id}/status",
            json={"next_status": STATUS_ASSIGNED},
            headers={"Authorization": f"Bearer {self.vendor_token}"},
        )
        self.assertEqual(resp.status_code, 400)

        resp2 = self.client.post(
            f"/api/vendor/orders/{order_id}/status",
            json={"next_status": STATUS_PREPARING},
            headers={"Authorization": f"Bearer {self.vendor_token}"},
        )
        self.assertEqual(resp2.status_code, 200)

    def test_driver_cannot_update_other_driver_order(self):
        order_id = self._create_order(STATUS_ASSIGNED, driver_id=self.driver_a_id)

        resp = self.client.post(
            f"/api/driver/orders/{order_id}/status",
            json={"next_status": STATUS_PICKED_UP},
            headers={"Authorization": f"Bearer {self.driver_b_token}"},
        )
        self.assertEqual(resp.status_code, 403)

    def test_driver_transition_enforcement(self):
        order_id = self._create_order(STATUS_ASSIGNED, driver_id=self.driver_a_id)

        resp = self.client.post(
            f"/api/driver/orders/{order_id}/status",
            json={"next_status": STATUS_DELIVERED},
            headers={"Authorization": f"Bearer {self.driver_a_token}"},
        )
        self.assertEqual(resp.status_code, 400)

        resp2 = self.client.post(
            f"/api/driver/orders/{order_id}/status",
            json={"next_status": STATUS_PICKED_UP},
            headers={"Authorization": f"Bearer {self.driver_a_token}"},
        )
        self.assertEqual(resp2.status_code, 200)

        resp3 = self.client.post(
            f"/api/driver/orders/{order_id}/status",
            json={"next_status": STATUS_DELIVERED},
            headers={"Authorization": f"Bearer {self.driver_a_token}"},
        )
        self.assertEqual(resp3.status_code, 200)

    def test_fallback_disabled_requires_auth(self):
        order_id = self._create_order(STATUS_READY)
        resp = self.client.post(
            f"/api/driver/orders/{order_id}/accept",
            json={"driver_id": self.driver_a_id},
        )
        self.assertEqual(resp.status_code, 401)

        order_id2 = self._create_order(STATUS_NEW)
        resp2 = self.client.post(
            f"/api/vendor/orders/{order_id2}/status",
            json={"vendor_id": self.vendor_id, "next_status": STATUS_PREPARING},
        )
        self.assertEqual(resp2.status_code, 401)


if __name__ == "__main__":
    unittest.main()
