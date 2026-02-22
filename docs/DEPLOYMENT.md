# Deployment Guide

This document describes how to deploy the Rova Delivery backend and web frontends, plus the operational requirements around auth, payments, storage, and monitoring.

---

**Environments**

**Development**
- Local Flask + local Postgres (default) or SQLite for tests.
- `FLASK_ENV=development`
- `ALLOW_DEV_ID_FALLBACK=true` (default) for dev-only ID fallback in some endpoints.
- Vite dev servers (ports vary per app).

**Staging**
- Mirrors production config and infra, but uses a separate database and secrets.
- Recommended: `FLASK_ENV=production` and environment-specific secrets.

**Production**
- Hardened config, secure secrets, and strict CORS.
- `FLASK_ENV=production`
- `ALLOW_DEV_ID_FALLBACK=0`

---

**Required Environment Variables**

Backend (Flask):
- `FLASK_ENV` - `development` or `production`.
- `DATABASE_URL` - Postgres connection string (required in staging/prod).
- `SECRET_KEY` - Flask session/crypto secret.
- `JWT_SECRET_KEY` - JWT signing secret.
- `ADMIN_API_KEY` - Required for admin endpoints if API key auth is enabled.
- `ALLOW_DEV_ID_FALLBACK` - `0` in production.
- `UPLOAD_FOLDER` - Optional override for uploads directory.
- `PORT` - Backend port (default 5000).

Tests:
- `TEST_DATABASE_URL` - defaults to `sqlite:///:memory:`.

Payments (only if integrated):
- Example placeholders for providers (adjust to actual integration):
  - `PAYSTACK_SECRET_KEY`, `PAYSTACK_WEBHOOK_SECRET`
  - `HUBTEL_CLIENT_ID`, `HUBTEL_CLIENT_SECRET`, `HUBTEL_WEBHOOK_SECRET`

---

**Backend Deployment**

Recommended hosts:
- Render, Railway, Fly.io, AWS ECS/Fargate.

Build/Install:
```bash
cd backend
python -m pip install -r requirements.txt
```

Start (production):
```bash
cd backend
gunicorn -w 2 -b 0.0.0.0:$PORT "app:create_app()"
```

Start (development):
```bash
cd backend
python run.py
```

Database migrations:
```bash
cd backend
FLASK_APP=app:create_app flask db upgrade
```
On Windows PowerShell:
```powershell
cd backend
$env:FLASK_APP="app:create_app"
flask db upgrade
```

Health check:
- `GET /health` returns `{ "service": "rova-backend", "status": "ok" }`.

---

**Frontend Deployment (Web Apps)**

Apps:
- Admin: `web/admin`
- Vendor: `web/vendor`
- Customer: `web/customer`
- Driver: `web/driver`

Build:
```bash
cd web/admin && npm ci && npm run build
cd ../vendor && npm ci && npm run build
cd ../customer && npm ci && npm run build
cd ../driver && npm ci && npm run build
```

API base URL in production:
- The frontend API clients use **relative** paths (`/api/...`).
- In production, **serve the web apps from the same domain** as the backend or configure a reverse proxy.
- If you must host the frontend on a different domain, add a reverse proxy rule or update the client to use an absolute `API_BASE_URL` (e.g., via `VITE_API_URL`) and adjust the API helper accordingly.

CORS strategy (production):
- Prefer same-origin hosting (no CORS required).
- If cross-origin is required, restrict allowed origins to the production domains in `backend/app/__init__.py` CORS config.

---

**Payment Webhooks**

Public webhook URL (recommended pattern):
- `https://<api-domain>/api/webhooks/<provider>`  
  Example: `https://api.rova.com/api/webhooks/paystack`

Secret verification:
- Verify the provider signature header using a shared secret stored in env vars.
- Reject unsigned or invalid signatures with `401/403`.

Rotation:
1. Add new webhook secret in the provider dashboard and your env config.
2. Deploy code that accepts **both** old and new secrets.
3. Switch provider to new secret.
4. Remove the old secret after the rotation window.

Idempotency:
- Use provider event IDs (or a hash of payload) to prevent duplicate processing.
- Store processed event IDs in a table with a unique constraint.

---

**Storage**

Local dev uploads:
- Files are saved to `UPLOAD_FOLDER` (default: `backend/uploads`).
- Served via `GET /uploads/<filename>`.

Production storage:
- Use S3/Cloudinary (or similar) for durability and CDN delivery.
- Store only public URLs/paths in the database.
- For private assets, use signed URLs or private buckets + proxy.

Security:
- Restrict file types and size.
- Scan uploads where possible.

---

**Monitoring**

Logs:
- Use platform log aggregation (Render/Railway/Fly/AWS logs).
- Capture request IDs if available.

Error reporting:
- Add Sentry/Datadog (recommended for production).

Uptime checks:
- Monitor `GET /health` at 30–60s intervals.
- Alert on non-200 or high latency.
