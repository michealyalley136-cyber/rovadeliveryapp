# Integrations

Provider adapters are future work. Keep provider-specific SDKs behind server-side interfaces and never accept provider credentials from browser input.

- Maps/GPS: abstract geocoding, routing, and location updates; current map treatment is visual only.
- Payments: abstract mobile money, card, bank, partner, and cash flows; no real collection is enabled.
- Messaging: provide in-app, push, SMS, and email delivery behind a notification service.
- Storage: validate content and upload policy before persisting documents to private object storage.
- Identity: integrate an authorized verification provider only after compliance and privacy review.

The Phase One demo currently simulates dispatch and pricing only.
