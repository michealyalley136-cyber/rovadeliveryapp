# ROVA MVP — Bike-first food delivery (Accra)

## Scope: food only

- **Customer**: register/login, list vendors, view menu, create cart, place order, track order status.
- **Driver**: go online/offline, receive order offer (15s window), accept/decline, navigate, mark picked up, mark delivered.
- **Admin (endpoints)**: approve vendors/drivers, set vendor type + WhatsApp number, view orders, force cancel, reassign.
- **Dispatch**: auto-select nearest available driver within radius; 15s offer; on timeout/decline, offer to next driver.
- **Pricing**: base fee 0–3 km, + per_km fee after 3 km (config in backend).
- **WhatsApp vendors (Phase 1)**: no WhatsApp API. Formatted order message generator endpoint; vendor accept/reject endpoints for Ops/Admin.

---

## Entities

| Entity       | Notes |
|-------------|--------|
| **User**    | Customer: email + password (MVP); phone later. |
| **Driver**  | Email + password, online/offline, last_known_lat/lng, approved, optional fleet_partner_id. |
| **Vendor**  | Type: WHATSAPP or DASHBOARD; optional WhatsApp number; optional lat/lng; approved. |
| **MenuItem**| name, description, price_cents, is_available. |
| **Order**   | customer, vendor, driver (optional), delivery_address; status; subtotal, delivery_fee, total (cents). |
| **OrderItem** | order, menu_item, quantity, unit_price_cents (snapshot). |
| **Address** | user, label, address_text, lat, lng. |
| **Rating**  | order, customer; driver_rating/driver_comment (delivery only); vendor_rating/vendor_comment (food). Separates driver from “food issue” blame. |
| **FleetPartner** | Optional; drivers can have fleet_partner_id. |
| **Config**  | key/value for pricing (base_fee_cents, per_km_cents, free_km). |

---

## Order status flow

1. **Created** → 2. **SentToVendor** → 3. **Accepted** → 4. **Preparing** → 5. **Ready**  
   → 6. **Assigned** (driver offered) → 7. **PickedUp** → 8. **Delivered**  
   **Cancelled** at various points (customer, admin, vendor reject).

---

## Core flows

### Customer

- Register / login (email + password).
- List approved vendors; view vendor menu.
- Manage addresses (CRUD).
- Create cart (items + delivery_address_id); place order → order created, sent to vendor, dispatch may assign driver.
- Track order (get order by id; show status).

### Driver

- Register / login.
- Go online / offline; update location (lat/lng).
- Receive order offer (auto-push; 15s accept window).
- Accept or decline; if decline, next driver offered.
- Navigate (deep link to maps).
- Mark picked up → mark delivered.

### Admin (simple endpoints; UI later)

- List/approve vendors; set vendor type + WhatsApp number (+ vendor lat/lng).
- List/approve drivers.
- View orders; force cancel; reassign (trigger dispatch again).

### Dispatch (Phase 1)

- When order is Ready (or SentToVendor with auto-dispatch), select nearest available (online, approved) driver by last_known_lat/lng within radius.
- Offer for 15s; on timeout or decline, offer to next driver.

### Pricing

- Hybrid flat + distance: base_fee for 0–3 km, + per_km_fee after 3 km.
- Stored in backend config table.

### WhatsApp vendor handling (Phase 1)

- **No** WhatsApp API integration.
- Endpoint: return WhatsApp-ready formatted message text for a given order/vendor.
- Endpoints for Ops/Admin to mark vendor “accept” or “reject” after vendor replies.

---

## Tech stack (MVP)

- **Backend**: Flask, PostgreSQL, SQLAlchemy, Alembic, JWT auth.
- **Mobile**: Flutter (rova_customer, rova_driver); API base URL from env/dart-define.
- **Docs**: This spec + API.md.
