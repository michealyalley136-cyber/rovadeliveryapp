"""End-to-end dispatch + offers smoke test.

Flow: seed -> customer order -> admin set ready -> driver online + location -> dispatch -> accept -> picked up -> delivered.
"""
import os
import sys
import time
from typing import Any, Dict, Optional, Tuple

import requests


def env(name: str, default: str) -> str:
    return os.getenv(name, default)


BASE_URL = env("BASE_URL", "http://127.0.0.1:5000").rstrip("/")
ADMIN_API_KEY = env("ADMIN_API_KEY", "dev-admin-key")
CUSTOMER_EMAIL = env("CUSTOMER_EMAIL", "customer@rova.test")
CUSTOMER_PASSWORD = env("CUSTOMER_PASSWORD", "customer123")
DRIVER_EMAIL = env("DRIVER_EMAIL", "driver@rova.test")
DRIVER_PASSWORD = env("DRIVER_PASSWORD", "driver123")
VENDOR_ID = os.getenv("VENDOR_ID")

DEFAULT_VENDOR_LAT = 5.6037
DEFAULT_VENDOR_LNG = -0.1870
DEFAULT_DROPOFF_LAT = 5.6030
DEFAULT_DROPOFF_LNG = -0.1875
DEFAULT_DROPOFF_TEXT = "1 Independence Ave, Accra"

TIMEOUT_SEC = 10
OFFER_POLL_TIMEOUT_SEC = 30
OFFER_POLL_INTERVAL_SEC = 2


def _req(
    session: requests.Session,
    method: str,
    path: str,
    headers: Optional[Dict[str, str]] = None,
    json_body: Optional[Dict[str, Any]] = None,
) -> Tuple[int, Dict[str, Any]]:
    url = f"{BASE_URL}{path}"
    r = session.request(method, url, headers=headers, json=json_body, timeout=TIMEOUT_SEC)
    try:
        data = r.json()
    except ValueError:
        data = {"_raw": r.text}
    return r.status_code, data if isinstance(data, dict) else {"data": data}


def _admin_headers() -> Dict[str, str]:
    return {"X-Admin-API-Key": ADMIN_API_KEY} if ADMIN_API_KEY else {}


def _auth_headers(token: str) -> Dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _login_or_register(
    session: requests.Session,
    kind: str,
    email: str,
    password: str,
) -> str:
    login_path = f"/api/auth/{kind}/login"
    reg_path = f"/api/auth/{kind}/register"

    status, data = _req(session, "POST", login_path, json_body={"email": email, "password": password})
    if status == 200 and data.get("access_token"):
        return data["access_token"]

    status, data = _req(session, "POST", reg_path, json_body={"email": email, "password": password})
    if status not in (200, 201):
        raise RuntimeError(f"{kind} register failed: {status} {data}")

    status, data = _req(session, "POST", login_path, json_body={"email": email, "password": password})
    if status == 200 and data.get("access_token"):
        return data["access_token"]
    raise RuntimeError(f"{kind} login failed: {status} {data}")


def _pick_vendor(session: requests.Session) -> Dict[str, Any]:
    status, data = _req(session, "GET", "/api/vendors")
    if status != 200:
        raise RuntimeError(f"GET /api/vendors failed: {status} {data}")
    vendors = data.get("vendors") or []
    if not vendors:
        raise RuntimeError("No approved vendors found.")
    if VENDOR_ID:
        for v in vendors:
            if str(v.get("id")) == str(VENDOR_ID):
                return v
        raise RuntimeError(f"VENDOR_ID={VENDOR_ID} not found in approved vendors.")
    return vendors[0]


def _ensure_vendor_coords(session: requests.Session, vendor_id: int) -> None:
    status, data = _req(session, "GET", "/api/admin/vendors", headers=_admin_headers())
    if status != 200:
        # If admin auth is not enabled, we might still be able to set coords.
        status, data = _req(
            session,
            "PUT",
            f"/api/admin/vendors/{vendor_id}",
            headers=_admin_headers(),
            json_body={"lat": DEFAULT_VENDOR_LAT, "lng": DEFAULT_VENDOR_LNG},
        )
        if status != 200:
            raise RuntimeError(f"Failed to ensure vendor coords: {status} {data}")
        return

    vendor = next((v for v in data.get("vendors", []) if v.get("id") == vendor_id), None)
    if not vendor:
        raise RuntimeError(f"Vendor {vendor_id} not found in admin list.")
    if vendor.get("lat") is None or vendor.get("lng") is None:
        status, data = _req(
            session,
            "PUT",
            f"/api/admin/vendors/{vendor_id}",
            headers=_admin_headers(),
            json_body={"lat": DEFAULT_VENDOR_LAT, "lng": DEFAULT_VENDOR_LNG},
        )
        if status != 200:
            raise RuntimeError(f"Set vendor coords failed: {status} {data}")


def _pick_menu_items(session: requests.Session, vendor_id: int) -> list:
    status, data = _req(session, "GET", f"/api/vendors/{vendor_id}/menu")
    if status != 200:
        raise RuntimeError(f"GET /api/vendors/{vendor_id}/menu failed: {status} {data}")
    items = [i for i in (data.get("items") or []) if i.get("is_available") is True]
    if not items:
        raise RuntimeError("No available menu items.")
    # choose 1-2 items
    picked = items[:2]
    return [{"menu_item_id": i["id"], "qty": 1} for i in picked]


def main() -> int:
    session = requests.Session()
    errors = []
    order_id = None
    offer_id = None
    final_status = None

    try:
        # Customer login/register
        customer_token = _login_or_register(session, "customer", CUSTOMER_EMAIL, CUSTOMER_PASSWORD)

        # Driver login/register
        driver_token = _login_or_register(session, "driver", DRIVER_EMAIL, DRIVER_PASSWORD)

        # Pick vendor + ensure coords
        vendor = _pick_vendor(session)
        vendor_id = int(vendor["id"])
        _ensure_vendor_coords(session, vendor_id)

        # Driver location + online
        status, data = _req(
            session,
            "POST",
            "/api/drivers/me/location",
            headers=_auth_headers(driver_token),
            json_body={"lat": DEFAULT_VENDOR_LAT, "lng": DEFAULT_VENDOR_LNG},
        )
        if status != 200:
            raise RuntimeError(f"Driver location failed: {status} {data}")

        status, data = _req(
            session,
            "POST",
            "/api/drivers/me/online",
            headers=_auth_headers(driver_token),
            json_body={"is_online": True},
        )
        if status != 200:
            raise RuntimeError(f"Driver online failed: {status} {data}")

        # Create order
        items = _pick_menu_items(session, vendor_id)
        status, data = _req(
            session,
            "POST",
            "/api/orders",
            headers=_auth_headers(customer_token),
            json_body={
                "vendor_id": vendor_id,
                "items": items,
                "dropoff": {
                    "address_text": DEFAULT_DROPOFF_TEXT,
                    "lat": DEFAULT_DROPOFF_LAT,
                    "lng": DEFAULT_DROPOFF_LNG,
                },
            },
        )
        if status not in (200, 201):
            raise RuntimeError(f"Create order failed: {status} {data}")
        order_id = data.get("id")
        if not order_id:
            raise RuntimeError(f"Create order missing id: {data}")

        # WhatsApp vendor flow: accept -> ready (auto-dispatch on Ready)
        status, data = _req(session, "POST", f"/api/whatsapp/order/{order_id}/accept")
        if status != 200:
            raise RuntimeError(f"WhatsApp accept failed: {status} {data}")

        status, data = _req(session, "POST", f"/api/whatsapp/order/{order_id}/ready")
        if status != 200:
            raise RuntimeError(f"WhatsApp ready failed: {status} {data}")

        # Poll offers
        offer = None
        start = time.time()
        while time.time() - start < OFFER_POLL_TIMEOUT_SEC:
            status, data = _req(
                session,
                "GET",
                "/api/drivers/me/offers",
                headers=_auth_headers(driver_token),
            )
            if status != 200:
                raise RuntimeError(f"Driver offers failed: {status} {data}")
            offer = data.get("offer")
            if offer:
                offer_id = offer.get("id") or offer_id
                break
            time.sleep(OFFER_POLL_INTERVAL_SEC)
        if not offer_id:
            raise RuntimeError("No offer received within timeout.")

        # Accept offer
        status, data = _req(
            session,
            "POST",
            f"/api/drivers/me/offers/{offer_id}/accept",
            headers=_auth_headers(driver_token),
        )
        if status != 200:
            raise RuntimeError(f"Accept offer failed: {status} {data}")

        # Mark picked up / delivered
        status, data = _req(
            session,
            "POST",
            f"/api/orders/{order_id}/status",
            headers=_auth_headers(driver_token),
            json_body={"status": "PICKED_UP"},
        )
        if status != 200:
            raise RuntimeError(f"Mark picked up failed: {status} {data}")

        status, data = _req(
            session,
            "POST",
            f"/api/orders/{order_id}/status",
            headers=_auth_headers(driver_token),
            json_body={"status": "DELIVERED"},
        )
        if status != 200:
            raise RuntimeError(f"Mark delivered failed: {status} {data}")

        # Fetch order detail
        status, data = _req(
            session,
            "GET",
            f"/api/orders/{order_id}",
            headers=_auth_headers(customer_token),
        )
        if status != 200:
            raise RuntimeError(f"Fetch order failed: {status} {data}")
        final_status = data.get("status")
        if final_status != "Delivered":
            raise RuntimeError(f"Unexpected final status: {final_status}")
        if not data.get("driver"):
            raise RuntimeError("Driver info missing in order detail.")

        print("PASS: dispatch flow completed.")
    except Exception as exc:
        errors.append(str(exc))
        print("FAIL: dispatch flow failed.")
    finally:
        print("\nSummary")
        print(f"- order_id: {order_id}")
        print(f"- offer_id: {offer_id}")
        print(f"- final_status: {final_status}")
        if errors:
            print("- errors:")
            for e in errors:
                print(f"  - {e}")

    return 0 if not errors else 1


if __name__ == "__main__":
    sys.exit(main())
