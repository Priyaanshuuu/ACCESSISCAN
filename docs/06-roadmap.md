Step 15: Add Authentication and User Accounts
Add ownership and privacy.

Add authentication
Associate scans with users
Add protected dashboard routes
Add user-owned sites
Prevent users from viewing other users’ scans
Result: The product supports real user accounts safely.

Step 16: Add Site Dashboard and Scan History
Organize repeated usage.

Add saved sites
Add scan history
Add latest score
Add score trends
Add “scan again” action
Add delete-site behavior
Result: Users can continuously monitor their websites.

Step 17: Add GitHub Action
Support the developer workflow.

Create the GitHub Action package
Accept API key and URL
Start a scan
Wait for completion
Post a pull-request comment
Optionally fail the check based on severity
Result: Developers can scan websites from CI/CD.

## Step 17.5: Secure and Harden the Scan Boundary

Complete this before exposing the API or GitHub Action publicly.

Add SSRF protection for loopback, private, link-local, IPv6, and cloud-metadata addresses
Revalidate every redirect destination
Add per-user and per-API-key rate limits
Add scan quotas and maximum concurrent scans
Add API-key rotation and revocation
Scope API keys to a user, repository, or organization
Add request audit logging
Add maximum scan duration and cancellation handling
Add worker heartbeats and stalled-job recovery
Add dead-letter queue visibility and retry controls
Add duplicate-scan/idempotency protection
Result: Untrusted URLs and integrations cannot exhaust or access internal resources.

Step 18: Add Scheduling and Email Notifications
Support ongoing monitoring.

Add scheduled scans
Add repeatable queue jobs
Add email notifications
Notify on new or worsened issues
Add notification preferences
Add notification deduplication and unsubscribe handling
Add issue regression detection between scans
Add issue resolution tracking
Result: Users no longer need to manually start every scan.

Step 19: Add Reports and Billing
Add business features after the core workflow is stable.

Generate PDF reports
Add report downloads
Add plan limits
Add usage tracking
Add Stripe billing
Add nonprofit handling
Add plan-based scan quotas
Add plan-based worker concurrency limits
Add billing webhook handling
Add payment failure and subscription cancellation handling
Result: The product is ready for paid usage.

Step 20: Deploy and Harden
Prepare for production.

Deploy the web app
Deploy the worker
Configure managed PostgreSQL and Redis
Configure object storage if reports or screenshots are enabled
Add logging and error monitoring
Add backups
Add database migration deployment workflow
Add Redis persistence and recovery policy
Add worker autoscaling policy
Add queue and database health endpoints
Add structured logs with request, scan, job, and user identifiers
Add alerting for failed scans, queue backlog, and worker crashes
Add secret rotation procedure
Add dependency and container vulnerability scanning
Add authentication and authorization review
Add API-key abuse monitoring
Test SSRF protection
Test rate limits
Test DNS rebinding and redirect handling
Test worker crash recovery
Test duplicate jobs and retry behavior
Test authenticated and unauthorized scan access
Test GitHub Action permissions and comment behavior
Add CI checks
Run production smoke tests
Result: The system is ready for real users.

## Step 21: Expand Scanner Coverage

Move beyond the current single rendered-page audit.

Add same-origin multi-page crawling
Add crawl limits and robots policy controls
Add authenticated scan sessions
Add mobile viewport and touch-target scans
Add keyboard-flow checks
Add screen-reader/manual review workflow
Add PDF accessibility scanning
Add authenticated user-flow recording
Add cross-scan issue deduplication
Add false-positive review and suppression
Add confidence labels for automated findings
Document that automated results do not establish legal compliance
Result: The product provides broader evidence while clearly separating automation from manual accessibility review.

## Step 22: Product Reliability and Operations

Make repeated use safe and understandable.

Add scan cancellation from the dashboard
Add live worker/queue status
Add scan timeout explanations
Add partial-result handling when one engine fails
Add scan retention and user data deletion
Add account deletion cleanup
Add dashboard pagination and filtering
Add site rename/edit controls
Add scan comparison views
Add API documentation and integration examples
Add production runbooks and incident procedures
Result: Users and operators can understand, control, and recover from scan failures.

/*
 Priority    Finding
  ━━━━━━━━━━  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Blocker     Build does not type-check, so no production build can be released.
  ──────────  ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
   High        Invalid scan requests reserve a Redis concurrency slot before JSON/URL validation, then return without releasing it. Two malformed
               requests can block an identity for up to 30 minutes. scans route (app/api/scans/route.ts:31)
  ──────────  ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
   High        “Scheduled” scans run immediately, then never schedule themselves again: the queue job has neither a delay/repeat configuration nor
               a subsequent enqueue. schedule creation (app/api/schedules/route.ts:40), worker (worker/scan-worker.ts:352)
  ──────────  ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
   High        Plan limits are not enforced. Scan usage is incremented but never checked; site count, scheduled scans, reports, and GitHub-action
               access are unrestricted despite pricing promises. plan limits (lib/plan-limits.ts:3), usage increment (app/api/scans/route.ts:94)
  ──────────  ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
   High        Billing is a one-time Razorpay order that permanently assigns a plan; it is not a monthly subscription with renewal, expiry,
               downgrade, or cancellation handling.
  ──────────  ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
   High        The Lighthouse subprocess scans arbitrary URLs with --no-sandbox and outside the Playwright request filter. This weakens isolation
               for a service designed to visit untrusted sites. worker (worker/scan-worker.ts:479)
  ──────────  ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
   Medium      Razorpay signature checks call timingSafeEqual without checking buffer lengths; malformed signatures can throw a 500 instead of
               returning 400. webhook (app/api/webhooks/razorpay/route.ts:13)
  ──────────  ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
   Medium      “Manual secure handoff” is stored but not implemented in the worker—the worker treats it as empty Playwright storage state and
               performs an unauthenticated scan.
  ──────────  ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
   Medium      Historical issue records are mutated to resolved when a later scan no longer finds them, undermining immutable historic reports/
               audit evidence.
  ──────────  ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
   Medium      No automated tests were found, and there are no Prisma migrations—only a schema and db push workflow.
  ──────────  ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
   Low         README, metadata, docs, and pricing are stale or contradictory: README says scanning is unimplemented and mentions Stripe/$ pricing;
               code has Razorpay/INR and working scanning. Layout metadata still says “Create Next App.” layout (app/layout.tsx:25)
*/