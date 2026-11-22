# ROVA account access: proposed design

This is a proposal, not an implemented authentication or authorization system. The public Login page is a disabled pre-launch interface. Real account creation, sign-in, password recovery, verified role assignment and role switching require separate approval and backend development.

## Current boundaries

- `Applicant` and `Application` records are separate from `User`; contact details do not prove account ownership. `APPROVED_FOR_NEXT_STAGE` is a recruitment status, not operational approval.
- `User` has a password hash, `PENDING`/`ACTIVE`/`SUSPENDED`/`CLOSED` status and `UserRole` relations to roles and permissions. The schema does not record verified contacts or approval state for individual role grants. `CustomerProfile` has no approval state; `OperatorProfile` has a separate operator status. These models alone do not implement account authentication or verified role approval.
- `/customer` and `/driver` currently use demo sessions, not real user credentials. `/admin` uses the separate credential-protected admin flow. Do not treat demo access as an authenticated customer or operator account.
- `/application-status` is the existing separate reference-and-contact lookup, not an authenticated account dashboard. It requires a working database. Pending applicants must not gain operational roles from it; a future authenticated applicant experience needs an independently verified account-to-application relationship.

## Proposed authorization mapping

An application category is only an expression of interest. A verified identity and an explicitly authorized server-side role grant are required; application submission or `APPROVED_FOR_NEXT_STAGE` alone must never create a role.

| Application | Possible future access, after required verification and approval |
| --- | --- |
| `CUSTOMER` | Customer dashboard for an active account with an authorized customer role and required profile. |
| `MOTORCYCLE_RIDER`, `TAXI_DRIVER`, `DELIVERY_PARTNER` | Operator dashboard only with an authorized operator role and an operator profile meeting the separately approved activation policy. |
| `MERCHANT` | Merchant portal when implemented and explicitly authorized. |
| `FLEET_OWNER` | Fleet portal when implemented and explicitly authorized. |
| `VEHICLE_DEALER` | Partner portal when implemented and explicitly authorized. |
| `VEHICLE_ACCESS`, `STRATEGIC_PARTNER` | No automatic operational permission; any later grant requires its own verified authorization process. |

No merchant, fleet or partner dashboard exists as part of this change. Define the exact approval and activation transitions before implementing grants; do not infer them from the application category or profile existence.

## Backend work requiring approval

1. Design verified phone/email ownership, normalized unique identifiers, secure credential enrollment and account-to-application linking. Avoid connecting applicant contact details to a user account solely by matching a string. Determine whether schema changes and migrations are required.
2. Implement server-side credential authentication using an approved password-hashing and verification policy, secure recovery and verification delivery. Use generic failures for unknown accounts, incorrect passwords and restricted accounts, with comparable handling to limit enumeration; add rate limiting, abuse monitoring and audit events without logging credentials.
3. Design protected real-account sessions separately from demo and admin sessions, retaining JWT environment isolation. Define expiration, renewal, revocation, secure cookies and CSRF protections. Never derive privileges from a query parameter, dropdown, or browser storage.
4. On each protected request, enforce current server-side account status, authorized role grants, permissions and applicable profile activation state. Deny suspended or closed accounts, revoked grants and unavailable portals; invalidate or recheck sessions when status or grants change. Keep pending accounts out of operational dashboards.
5. After authentication, route only to a currently authorized and implemented destination. For multiple approved roles, offer a role selector or switcher only after authentication, and reauthorize the selected role on the server for every protected request. A role choice changes context, not permissions.
6. Design customer, operator, merchant, fleet and partner navigation as their real portals become available. Add server-side integration tests for verification, approvals, pending and suspended accounts, role revocation, multi-role switching, cross-environment isolation, enumeration resistance and recovery.

## UI and verification status

The Login page has disabled credential fields and sign-in button; it does not collect or submit credentials. Forgot-password leads to an on-page availability explanation and Apply now leads to application intake, not account registration. Application status, application intake and staff login link to their existing entry points. Demo entry points remain separate and unchanged.

After a successful database transaction, application submission sets a 90-day signed, HttpOnly browser-recognition cookie containing no application reference or personal details. It is a presentation marker, not a session or authorization. Its key is derived from `AUTH_SECRET` with a separate purpose, and its issuer is environment-specific. The homepage verifies the marker on the server before showing Login; an existing authenticated administrator can also see it. Production cookies are Secure and SameSite=Lax.

Applicants from before this feature, or those returning on another device or after clearing cookies, can still use the existing application-status lookup and must not be required to submit a duplicate application. Secure recognition recovery is not implemented: design an independently verified, rate-limited ownership challenge or a verified account-linking process before issuing a marker on another device. Reference and contact details alone must not issue recognition or grant access.

The application wizard keeps answers only in component memory while the form is open. It removes the legacy `rova-application-draft` local-storage key when the page loads and does not create replacement browser-persisted drafts, so applicant details are not stored in local storage. The recognition feature itself also does not use local storage.
