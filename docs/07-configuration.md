# Configuration

The web app and worker read configuration from environment variables. Use `.env` locally and secret storage in hosting providers. Copy `.env.example` as a starting point, then provide values for the services you enable.

## Required settings

| Variable | Used by | Description |
|---|---|---|
| `DATABASE_URL` | Web app, worker, Prisma | PostgreSQL connection string |
| `REDIS_URL` | Web app, worker | Redis connection string for BullMQ and rate limits |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Web app | Clerk browser key |
| `CLERK_SECRET_KEY` | Web app | Clerk server key; keep private |
| `BROWSER_STATE_ENCRYPTION_KEY` | Web app, worker | Key used to encrypt saved browser storage state |

The encryption key must be stable and identical for the web app and worker. Rotate it only with a migration plan for existing browser states.

## Optional integrations

| Variable | Purpose |
|---|---|
| `RAZORPAY_KEY_ID` | Razorpay checkout/order creation |
| `RAZORPAY_KEY_SECRET` | Razorpay server verification |
| `RAZORPAY_WEBHOOK_SECRET` | Razorpay webhook signature verification |
| `RESEND_API_KEY` | Email notifications |
| `RESEND_FROM_EMAIL` | Sender address |
| `GITHUB_TOKEN` | Server-side GitHub operations, when enabled |
| `ACCESSISCAN_API_KEY` | GitHub Action authentication; use a user-owned key |
| `NEXT_PUBLIC_APP_URL` | Canonical app URL used in links and callbacks |

An integration may be unset during local development. The related feature should be unavailable rather than given a fake production secret.

## Database workflow

This repository currently uses Prisma `db push`, not a committed migration history. Run `npm run db:push` against a disposable or reviewed database during development. Before production deployment, establish and review a migration baseline; do not use `db push` as an unattended production migration strategy.

## Deployment shape

Deploy the Next.js app and worker as separate processes. Both must use the same database, Redis instance, and browser-state encryption key. The worker needs a host that can run Chromium and long-lived Node.js processes; a serverless-only host is not sufficient for the worker.

## Secret handling

- Keep `.env` out of Git.
- Use separate secrets for local, staging, and production.
- Rotate API keys and webhook secrets if exposed.
- Do not log connection strings, cookies, browser state, payment signatures, or authorization headers.
- Give CI only the permissions required by its job.
