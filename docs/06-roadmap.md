# Roadmap and project status

This file separates work that already exists from work that still needs product or operational decisions.

## Complete

- Clerk authentication and user-owned sites, scans, issues, and browser states.
- One free scan per free user with an atomic entitlement reservation.
- Paid-plan checks for schedules, browser states, and PDF reports.
- Playwright, axe-core, Lighthouse, and custom scan processing.
- BullMQ retries and recurring schedule jobs.
- Razorpay order verification and webhook signature verification.
- Historical issue integrity: a later scan does not rewrite old scan results.
- SSRF protection for URL validation, redirects, DNS rebinding, private addresses, and Lighthouse traffic.
- Lint, type-checking, unit/security tests, and production build checks in GitHub Actions.
- Plain-language setup, configuration, architecture, and pipeline documentation.

## Next production-readiness work

1. Create a reviewed Prisma migration baseline and deploy migrations safely.
2. Replace the global GitHub Action key with user-owned, revocable, repository-scoped keys.
3. Add end-to-end tests for authenticated scans, payment webhooks, schedules, and report access.
4. Decide whether paid access is a one-time purchase or a recurring subscription, then implement expiry, cancellation, and downgrade rules accordingly.
5. Add structured logs, error monitoring, queue health checks, worker heartbeats, and alerts.
6. Add account deletion, scan retention, data export, and secret-rotation runbooks.
7. Review Prisma and other dependency advisories before upgrading major versions.

## Later product improvements

- Scan cancellation and clearer partial-result states.
- Same-origin multi-page crawling with explicit page limits.
- Mobile viewport and keyboard-flow checks.
- Scan comparison and issue suppression/false-positive review.
- API documentation and integration examples.
- Badges, richer GitHub comments, and team/organization support.
- Manual review workflows for keyboard, screen-reader, and authenticated user flows.

Automated scanning should remain clearly labeled as an aid, not a legal-compliance certificate.
