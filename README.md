# ROVA — Bike-first food delivery (Accra) — MVP

Monorepo: Flask backend + PostgreSQL + two Flutter apps (customer + driver).

## Prerequisites

- **Backend**: Python 3.11+, Docker (for Postgres)
- **Mobile**: Flutter 3.x, Dart 3.x

## Quick start

### 1. Backend (Flask + Postgres)

```bash
cd backend
cp .env.example .env
# Edit .env if needed (DB URL, JWT secret)

# Start Postgres only
docker compose -f ../docker-compose.yml up -d postgres

# Create venv and install
python -m venv venv
# Windows: venv\Scripts\activate
# macOS/Linux: source venv/bin/activate
pip install -r requirements.txt

# Run migrations
flask db upgrade

# Seed (optional): one vendor + menu + one driver + delivery pricing config (run from backend/)
python scripts/seed.py
# If using SQLite, use same DATABASE_URL as above; for relative path, run from backend/

# Smoke test delivery pricing (GET /pricing, create order, PATCH admin pricing)
python scripts/smoke_test_pricing.py

# Smoke test dispatch (create order -> set Ready -> dispatch -> driver poll/accept)
python scripts/smoke_test_dispatch.py

# Run dispatch smoke test (end-to-end)
# Windows (PowerShell):
#   set BASE_URL=http://127.0.0.1:5000
#   set ADMIN_API_KEY=dev-admin-key
#   python scripts/smoke_dispatch_flow.py
# macOS/Linux:
#   BASE_URL=http://127.0.0.1:5000 ADMIN_API_KEY=dev-admin-key python scripts/smoke_dispatch_flow.py
#
# Notes:
# - If it fails with "no drivers found", driver may be offline or missing location.
# - If it fails with "order must be Ready", set-ready was not called or status mismatch.
# - If it fails with "pickup coords missing", vendor lat/lng must be set.

# Run server
python run.py
```

API: http://127.0.0.1:5000  
Health: http://127.0.0.1:5000/health

### 2. Customer app (Flutter)

```bash
cd mobile/rova_customer
# If project was not created with Flutter CLI, run: flutter create . --project-name=rova_customer
cp .env.example .env
# Set API_BASE_URL: flutter run --dart-define=API_BASE_URL=http://10.0.2.2:5000 (Android emulator)

flutter pub get
flutter run
```

### 3. Driver app (Flutter)

```bash
cd mobile/rova_driver
# If needed: flutter create . --project-name=rova_driver
cp .env.example .env
flutter pub get
# Android emulator (backend on host):
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:5000
# Or: flutter run
```

Log in (Profile) with seed driver: `driver@rova.test` / `driver123`. Go online to poll offers; accept opens Active delivery (Mark Picked Up → Mark Delivered).

## Repo structure

```
rova/
  backend/          # Flask + SQLAlchemy + Alembic
  mobile/
    rova_customer/  # Flutter customer app
    rova_driver/    # Flutter driver app
  docs/             # MVP_SPEC.md, API.md
  docker-compose.yml
```

## Docs

- [MVP_SPEC.md](docs/MVP_SPEC.md) — Scope and flows
- [API.md](docs/API.md) — REST API reference

## Web dashboards (React + Vite + Tailwind)

Admin:

```bash
cd web/admin
cp .env.example .env
npm i
npm run dev
```

Vendor:

```bash
cd web/vendor
cp .env.example .env
npm i
npm run dev
```

## One command per component

| Component        | Command (from repo root) |
|-----------------|---------------------------|
| Postgres        | `docker compose up -d postgres` |
| Backend         | `cd backend && python run.py` |
| Customer app    | `cd mobile/rova_customer && flutter run` |
| Driver app      | `cd mobile/rova_driver && flutter run` |
