# Architecture

AccessiScan has two runtime processes: a Next.js web app and a Node.js scan worker. They share PostgreSQL, Redis, and the browser-state encryption key.

## Main flow

```text
User or GitHub Action
        |
        v
Next.js route handler -- validates/authenticates --> PostgreSQL
        |
        +--------------------> Redis/BullMQ
                                      |
                                      v
                              Node.js scan worker
                                      |
                       Playwright + axe-core + Lighthouse
                                      |
                                      v
                                  PostgreSQL
```

The web app never performs the long browser task inside a request. It creates a scan record, queues a job, and returns the scan ID. The dashboard reads the scan record until the worker marks it complete or failed.

## Components

| Component | Responsibility | Trust boundary |
|---|---|---|
| Next.js pages | Dashboard, scan history, plans, and reports | Authenticated user session |
| Next.js route handlers | Validate input, authorize ownership, write records, queue work | Untrusted HTTP input enters here |
| Clerk | Identity and sessions | External identity provider |
| PostgreSQL/Prisma | Durable application state | User ownership is enforced in queries |
| Redis/BullMQ | Queue, retries, rate limits, schedulers | Jobs are treated as untrusted data |
| Worker | Browser execution and result persistence | Runs with least required network/database access |
| Lighthouse proxy | Revalidates browser destinations | Loopback-only local server |
| Razorpay webhook | Payment updates | Signature must be verified before use |

## Ownership rules

Every site belongs to one user. A scan is reachable only through its site owner. Browser states and schedules also carry user ownership. Route handlers check the signed-in Clerk user before reading or mutating any of these records.

## Scan boundary safety

- Only `http` and `https` URLs are accepted.
- Credentials in URLs are rejected.
- Hostnames and every resolved address are checked for loopback, private, link-local, multicast, metadata, and reserved ranges.
- Redirect destinations are checked again by the browser request filter.
- Lighthouse uses a loopback proxy that resolves and pins each destination before connecting. This prevents DNS rebinding from changing a validated public hostname into a private address.
- Saved browser storage state is encrypted at rest and expires according to its record.

## Data model summary

The Prisma schema is the source of truth. The important relationships are:

```text
User 1---many Site 1---many Scan 1---many Issue
User 1---many Schedule
User 1---many BrowserState
```

Scans store their own findings. A later scan does not rewrite old issue rows, so historical reports remain evidence of what that scan found.

## Runtime deployment

Deploy the web app on a Next.js-compatible host and the worker on a long-running Node.js host with Chromium available. Put PostgreSQL and Redis behind private or authenticated connections. Scale workers horizontally only after queue concurrency, database limits, and target-site protections have been measured.

## Failure behavior

The queue retries transient worker failures. A scan is marked failed when retries are exhausted. If one scan engine fails, the worker can still save results from the other engines when possible. Payment, email, and notification failures must not grant access without a verified payment or delete the scan result.
