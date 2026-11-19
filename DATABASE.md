# Database

PostgreSQL is the target relational store. The initial Prisma schema defines users, normalized roles/permissions, customer/operator profiles, service zones, vehicles and assignment history, compliance documents, pricing rules, trips, immutable ledger entries, and append-only audit events.

Amounts are represented as integer pesewas with currency `GHS`; never store money in floating-point columns. A production migration should add transaction boundaries and database constraints for one active assignment per vehicle/operator, allowed trip state transitions, and append-only ledger/audit access.

The current application uses an in-memory demo adapter and does not connect to `DATABASE_URL`. Apply Prisma migrations only after the persistence adapter and deployment environment are configured.
