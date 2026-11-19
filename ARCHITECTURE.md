# Architecture

## Current structure

- `src/app`: Next.js App Router public site, role-specific portal pages, and server route handlers.
- `src/components`: shared portal shell and sign-in component; role experiences are rendered as distinct portal routes.
- `src/lib`: shared domain types, permissions, workflow transition map, and client-safe formatting.
- `src/server`: demo session handling, business rules, in-memory demo store, and pricing/compliance logic.
- `prisma/schema.prisma`: normalized PostgreSQL foundation for persisted production data.

## Request and trust boundaries

Session cookies are HTTP-only, signed, and strict same-site. Route handlers identify the session server-side, validate payloads with Zod, and enforce role checks before changing data. The demo sign-in endpoint is unavailable in production unless `ROVA_DEMO_MODE=true`. Configure `AUTH_SECRET` with at least 32 random characters in any production deployment.

The in-memory store is only a demonstration adapter; it is not durable, horizontally safe, or appropriate for real customers. Replace it with repository interfaces backed by PostgreSQL/Prisma before a pilot. Keep transition, pricing, compliance, and authorization rules in server/domain services when adding a persistent adapter.

## Phase One workflow

1. A customer submits a pickup, destination, and service request.
2. The pricing service computes a demo estimate from explicit demo configuration.
3. An operator session must pass a server-side compliance decision before availability can be enabled.
4. An online operator accepts and advances a trip through allowed states only.
5. Completion appends ledger rows and audit events; prior entries are not edited.
6. Operations reads trips, metrics, and audit events without a trip-edit endpoint.

The starter data and fee are fictional demo values. Trip assignment is simulated and the initial demo operator is marked compliant to exercise the lifecycle.

## Adapters planned

Add separate interfaces for durable repositories, dispatch, mapping/geocoding, GPS, payments, notifications, and object storage. The current Phase One implementation intentionally has no live provider dependency.
