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
| `OPENAI_API_KEY` | Server-only OpenAI key used by the scan worker for AEO/GEO content reviews |
| `OPENAI_AEO_GEO_MODEL` | Responses API model with Structured Outputs support; defaults to `gpt-4.1-mini` |
| `AEO_GEO_AI_ENABLED` | Set `false` to disable AI review; otherwise enabled when an OpenAI key is configured |

An integration may be unset during local development. The related feature should be unavailable rather than given a fake production secret.

## AEO/GEO analysis

Add the following to the worker's `.env` to enable AI reviews, then restart `npm run worker`:

```dotenv
OPENAI_API_KEY="your-openai-api-key"
OPENAI_AEO_GEO_MODEL="gpt-4.1-mini"
AEO_GEO_AI_ENABLED="true"
```

The worker analyses every successfully crawled HTML page within the existing page/depth allowance (one page for the free scan, up to ten pages at depth two for the current paid plan). The report records attempted, analysed and skipped pages, plus discovered links left outside the scan. It follows same-origin links from the starting page's final URL, deduplicates redirected pages, and skips navigation failures/non-HTML child pages. It does not discover disconnected pages through sitemaps. Rendering waits up to two seconds for network idle; later content may still be absent.

Rule-based checks work without OpenAI. New reports contain page evidence, applicable check counts, duplicate titles/descriptions, and recommendations. They do not produce ranking or citation scores. FAQ/HowTo, identity references and external links are informational; author/date checks apply to detected articles. JSON-LD is parsed recursively (including `@graph`), but vocabulary validity and factual accuracy are not verified. Page-level robots metadata/headers are inspected; robots.txt and actual engine accessibility are not tested. Question detection recognizes English question prefixes and question marks; whitespace-based word counts are approximate for languages without word separators.

One OpenAI Responses request reviews at most the first ten analysed pages per scan attempt, with at most 6,500 characters of evidence per page, at most 3,500 output tokens and a 45-second timeout. Responses use a strict JSON schema and `store: false`. AI output is checked against supplied URLs and verbatim evidence quotes before display. The provider receives URLs, selected metadata and content excerpts; it receives no cookies or saved browser state. Scans using saved sign-in sessions skip AI entirely. Full text excerpts are not persisted, though short answer examples and evidence quotes remain in the report. OpenAI usage is billed to the configured API account separately from application pricing.

The AI has no browsing tools: it evaluates supplied content and suggests improvements, not live visibility in ChatGPT, AI Overviews, or another engine. Timeouts, missing credentials, refusals and invalid output leave the structural report usable. Existing scans keep the legacy report view; start a new scan to generate enhanced reports. The existing JSON database columns store versioned reports, so no schema migration is needed. Enhanced findings are also included in PDF exports.

API implementation follows the [OpenAI Structured Outputs guide](https://developers.openai.com/api/docs/guides/structured-outputs). A different model can be configured, but it must support the Responses API and strict structured text output.

Run `npm run test` for fixture-based Chromium extraction, report aggregation, and mocked OpenAI success/failure tests. Install the browser with `npx playwright install chromium` if needed. After configuring a real key, scan a public site with linked pages and check the **AEO + GEO** tab: page count, per-page findings, AI evidence links, skipped-page coverage, and the downloaded PDF. This live call consumes API credit.

## Database workflow

This repository currently uses Prisma `db push`, not a committed migration history. Run `npm run db:push` against a disposable or reviewed database during development. Before production deployment, establish and review a migration baseline; do not use `db push` as an unattended production migration strategy.

## Deployment shape

Deploy the Next.js app and worker as separate processes. Both must use the same database, Redis instance, and browser-state encryption key. The worker needs a host that can run Chromium and long-lived Node.js processes; a serverless-only host is not sufficient for the worker.

For Railway, use the same repository as a separate worker service. Set its `RAILWAY_DOCKERFILE_PATH` variable to `Dockerfile.worker`, remove any custom build/start command so the Dockerfile's `CMD` runs, and do not assign the worker a public domain. The image installs Playwright Chromium plus Linux dependencies at build time and uses the installed full Chromium for Lighthouse. Keep `DATABASE_URL`, `REDIS_URL`, and `BROWSER_STATE_ENCRYPTION_KEY` on this service. Redeploy the worker after changing the Dockerfile; restarting an old image will not install browsers. The web service should keep its normal Next.js build and should not use `Dockerfile.worker`.

## Secret handling

- Keep `.env` out of Git.
- Use separate secrets for local, staging, and production.
- Rotate API keys and webhook secrets if exposed.
- Do not log connection strings, cookies, browser state, payment signatures, or authorization headers.
- Give CI only the permissions required by its job.
