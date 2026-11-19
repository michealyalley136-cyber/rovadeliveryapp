# Roles and permissions

The current UI provides isolated Customer, Operator, and Operations entry points. The demo role session is signed and validated server-side; users cannot gain access by merely changing a route or hiding/showing controls.

| Demo role | Allowed capabilities |
| --- | --- |
| Customer | Create ride requests and read own trips |
| Operator | Change own availability; accept and advance assigned trips; read own ledger |
| Operations | Read all demo trips, operational metrics, and audit events |

`src/lib/domain.ts` is the current permission registry. Route handlers must enforce permissions independently of UI navigation. Expand the registry into persisted roles and permissions for staff, merchants, fleet partners, and administrators before adding those experiences. Sensitive PII and finance access must be separately permissioned and audited.
