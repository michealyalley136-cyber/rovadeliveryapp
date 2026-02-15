# ROVA REST API

Base URL: `http://localhost:5000` (or your server).  
Auth: JWT in header `Authorization: Bearer <access_token>` unless noted.

---

## Health

- **GET /health** — No auth. Returns `{ "status": "ok", "service": "rova-backend" }`.

---

## Pricing (delivery)

- **GET /api/pricing** — No auth. Returns current delivery pricing config and an example calculation.  
  Response: `{ "config": { base_km, base_fee_ghs, per_km_fee_ghs, updated_at }, "example": { "inputs": { distance_km, base_km, base_fee_ghs, per_km_fee_ghs }, "delivery_fee_ghs" } }`.  
  Model: base fee covers 0–base_km km; then + per_km_fee_ghs per km after that.
  Smoke test:
  ```bash
  curl -s http://127.0.0.1:5000/api/pricing
  ```
  ```json
  {"config":{"base_km":3.0,"base_fee_ghs":12.0,"per_km_fee_ghs":2.0,"updated_at":"..."},"example":{"delivery_fee_ghs":16.0,"inputs":{"distance_km":5.0,"base_km":3.0,"base_fee_ghs":12.0,"per_km_fee_ghs":2.0}}}
  ```

---

## Auth — Customer

- **POST /api/auth/customer/register**  
  Body: `{ "email", "password", "full_name?" }`  
  Returns: `{ "user": { id, email, full_name }, "access_token" }`.

- **POST /api/auth/customer/login**  
  Body: `{ "email", "password" }`  
  Returns: `{ "user", "access_token" }`.

- **GET /api/auth/customer/me** — JWT required. Returns current user.

---

## Auth — Driver

- **POST /api/auth/driver/register**  
  Body: `{ "email", "password", "full_name?", "phone?" }`  
  Returns: `{ "driver": { id, email, full_name, is_online, approved }, "access_token" }`.

- **POST /api/auth/driver/login**  
  Body: `{ "email", "password" }`  
  Returns: `{ "driver", "access_token" }`.

- **GET /api/auth/driver/me** — JWT required. Returns current driver.

---

## Vendors (public)

- **GET /api/vendors** — Public (no auth). List approved vendors.  
  Returns: `{ "vendors": [ { id, name, vendor_type, whatsapp_number } ] }`.

---

## Menu (public)

- **GET /api/vendors/:vendor_id/menu** — Public (no auth).  
  Returns: `{ "vendor_id", "items": [ { id, name, description, price_cents, is_available } ] }`.

---

## Addresses (customer)

- **GET /api/addresses** — JWT. List current user’s addresses.
- **POST /api/addresses** — JWT. Body: `{ "address_text", "label?", "lat?", "lng?" }`.
- **GET /api/addresses/:id** — JWT. One address.
- **PUT /api/addresses/:id** — JWT. Update address_text, label, lat, lng.
- **DELETE /api/addresses/:id** — JWT.

---

## Orders (customer)

- **POST /api/orders** - JWT. Create order.  
  Body: `{ "vendor_id", "items": [ { "menu_item_id", "qty" } ], "dropoff": { "address_text", "lat", "lng" }, "notes?" }`.  
  Delivery fee uses Haversine distance (vendor -> address) and `DeliveryPricingConfig` (base_km, base_fee_ghs, per_km_fee_ghs).  
  Order stores: delivery_distance_km, delivery_fee_ghs, subtotal_ghs, total_ghs (and legacy subtotal_cents, delivery_fee_cents, total_cents).  
  Returns order with status `Created`.
  Example request:
  ```json
  {"vendor_id":1,"items":[{"menu_item_id":2,"qty":1},{"menu_item_id":3,"qty":2}],"dropoff":{"address_text":"1 Independence Ave, Accra","lat":5.603,"lng":-0.1875}}
  ```
  Example response:
  ```json
  {"id":123,"vendor_id":1,"delivery_address_id":77,"status":"Created","subtotal_ghs":95.0,"delivery_fee_ghs":12.0,"total_ghs":107.0,"items":[{"menu_item_id":2,"name":"Jollof Rice","quantity":1,"unit_price_cents":2500}]}
  ```

- **GET /api/orders** - JWT. List current user's orders (newest first).
- **GET /api/orders/:id** - JWT. Order detail (track status).  
  Response includes: order fields + items + pricing breakdown + vendor + driver (if assigned) + dropoff.  
  Example response (shape):
  ```json
  {"id":123,"status":"Created","pricing":{"subtotal_ghs":95.0,"delivery_fee_ghs":12.0,"total_ghs":107.0},"vendor":{"id":1,"name":"Test Kitchen"},"driver":{"id":9,"full_name":"Test Driver"},"dropoff":{"address_text":"1 Independence Ave, Accra","lat":5.603,"lng":-0.1875}}
  ```
---

## Driver

Driver sees only their own offers. All require JWT (driver).

- **POST /api/drivers/me/location** - Set last_known_lat/lng. Body: `{ "lat", "lng" }`.
- **POST /api/drivers/me/online** - Set online state. Body: `{ "is_online": true }`.
- **GET /api/drivers/me/offers** - Active PENDING offer (if any) + `seconds_remaining`. Stale offers are marked expired on read. Returns `{ "offer": { id, order_id, status, offered_at, expires_at, seconds_remaining, order } }`.
- **POST /api/drivers/me/offers/:offer_id/accept** - Accept offer (idempotent; rejects if expired). Order becomes Assigned, driver_id set.
- **POST /api/drivers/me/offers/:offer_id/decline** - Decline; system tries next nearest driver (15s offer).

Legacy aliases: POST /api/driver/me/online|offline, POST /api/driver/me/location, GET /api/driver/me/offers, POST /api/driver/me/offers/:offer_id/accept|decline.

- **POST /api/orders/:id/status** - JWT (driver). Body: `{ "status": "PICKED_UP" | "DELIVERED" }`.
- **GET /api/driver/orders** - JWT. List orders assigned to this driver.
- **POST /api/driver/orders/:order_id/picked-up** - Legacy. Mark order PickedUp.
- **POST /api/driver/orders/:order_id/delivered** - Legacy. Mark order Delivered.

---

## Vendor (dashboard)

- **POST /api/vendor/login** - Body: `{ "vendor_id", "pin" }`. Returns `{ vendor, access_token }`.
- **GET /api/vendor/orders** - JWT (vendor). Optional query `statuses=Created,Preparing,Ready,Assigned`.
- **POST /api/vendor/orders/:id/accept** - JWT (vendor). Moves order to Preparing.
- **POST /api/vendor/orders/:id/ready** - JWT (vendor). Moves order to Ready and auto-dispatches.

---

## Admin (no JWT in MVP; protect in production)

- **GET /api/admin/vendors** — List all vendors.
- **POST /api/admin/vendors/:id/approve** — Approve vendor.
- **PUT /api/admin/vendors/:id** — Body: `{ "vendor_type?", "whatsapp_number?", "lat?", "lng?" }`.
- **GET /api/admin/drivers** — List all drivers.
- **POST /api/admin/drivers/:id/approve** — Approve driver.
- **GET /api/admin/orders** — List recent orders.
- **POST /api/admin/orders/:id/cancel** — Force cancel order.
- **POST /api/admin/orders/:id/set-ready** — Set order status to Ready (for testing / after vendor confirms).
- **POST /api/admin/orders/:id/set-preparing** - Set order status to Preparing (for testing).
- **POST /api/admin/orders/:id/dispatch** - Trigger dispatch: find nearest online driver within radius (default 6 km), create DriverOffer (15 s window). Order must be Ready or NeedsReassign. Returns `{ order, offer_id?, driver_id?, status, attempts? }`. Auto-dispatch also triggers when an order becomes Ready (e.g., WhatsApp ready or admin set-ready). Requires `X-Admin-API-Key` header if `ADMIN_API_KEY` is set.
  Example:
  ```bash
  curl -s -X POST http://127.0.0.1:5000/api/admin/orders/123/dispatch -H "X-Admin-API-Key: $ADMIN_API_KEY"
  ```
- **POST /api/admin/orders/:id/reassign** — Clear driver, set Ready, then run dispatch (offer to next driver).

- **PATCH /api/admin/pricing** — Update delivery pricing config (single active row).  
  Body: `{ "base_km?", "base_fee_ghs?", "per_km_fee_ghs?" }`.  
  Returns updated config. Creates default row (base_km=3, base_fee_ghs=12, per_km_fee_ghs=2) if none exists.

---

## Manual Test Checklist (Dispatch + Offers)

1. Run seed: `python scripts/seed.py`.
2. Create order (POST /api/orders).
3. WhatsApp accept: POST /api/whatsapp/order/:id/accept.
4. WhatsApp ready: POST /api/whatsapp/order/:id/ready (auto-dispatches).
5. Driver login, then POST /api/drivers/me/location and POST /api/drivers/me/online.
6. Driver GET /api/drivers/me/offers and POST /api/drivers/me/offers/:offer_id/accept.
7. Driver update status: POST /api/orders/:id/status with PICKED_UP, then DELIVERED.
8. Customer GET /api/orders/:id and verify status + driver info.

---

## WhatsApp (Phase 1 - no WhatsApp API)

- **GET /api/whatsapp/order/:order_id/message** - No auth (admin tool).  
  Returns: `{ "order_id", "message" }` - WhatsApp-ready text for the order.

- **POST /api/whatsapp/order/:order_id/accept** - Ops/Admin: vendor accepted. Moves order to Preparing.
- **POST /api/whatsapp/order/:order_id/reject** - Ops/Admin: vendor rejected. Cancels order.
- **POST /api/whatsapp/order/:order_id/ready** - Ops/Admin: vendor ready. Moves order to Ready and auto-dispatches.
---

## Errors

- **4xx/5xx** — JSON `{ "error": "message" }` (optional `"code"`).
- **401** — Missing or invalid JWT.

---

## Order status values

`Created` → `SentToVendor` → `Accepted` → `Preparing` → `Ready` → `Assigned` → `PickedUp` → `Delivered`; or `Cancelled`, or `NEEDS_REASSIGN` (no driver accepted after N attempts). Dispatch uses DriverOffer (PENDING → ACCEPTED / DECLINED / EXPIRED); 15 s offer window, max 5 attempts by default.
