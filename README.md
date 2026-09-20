# AccessiScan

AccessiScan scans a deployed website and explains accessibility, performance, SEO, and best-practice issues in plain language. It is a Next.js web app backed by a queue and a separate browser worker.

## What works today

- Sign-in and user-owned sites and scans with Clerk.
- One free scan for each free user. Further scans and paid features require a paid plan.
- Playwright browser scans with axe-core accessibility checks, Lighthouse metrics, and custom checks.
- Scan history, issue review, score history, and scan status updates.
- Saved browser storage state for sites that need an authenticated session.
- Recurring scheduled scans through BullMQ.
- PDF report downloads for paid users.
- Razorpay order verification and webhook signature verification.
- GitHub Action integration for starting a scan and reporting its result.
- SSRF protections for private IPs, metadata endpoints, redirects, DNS rebinding, and Lighthouse requests.

Automated results are useful signals, not proof of legal compliance. Keyboard testing, screen-reader testing, real user flows, and professional review are still needed for a complete audit.

## How the system is arranged

```text
Browser -> Next.js app/API -> PostgreSQL
                         -> Redis/BullMQ -> scan worker
                                               -> Playwright + axe-core + Lighthouse
```

- **Web app:** dashboard, authentication, route handlers, billing, reports, and webhooks.
- **Worker:** consumes scan jobs, opens a browser, runs the scan engines, and saves results.
- **PostgreSQL:** users, sites, scans, issues, schedules, and browser states.
- **Redis:** queue, retries, rate-limit counters, and repeatable schedule jobs.

See [docs/04-architecture.md](./docs/04-architecture.md) and [docs/05-pipeline.md](./docs/05-pipeline.md) for the detailed flow.

## Local setup

### Requirements

- Node.js 20 or newer
- npm
- PostgreSQL (Neon works) and Redis
- A Clerk application
- Razorpay credentials if payment flows are being tested

### Install and configure

```bash
npm install
cp .env.example .env
npm run db:generate
npm run db:push
```

Fill in `.env` before starting the app. The full variable list is documented in [docs/07-configuration.md](./docs/07-configuration.md). Never commit `.env` or real secrets.

For local Redis, use Docker: `npm run redis:up`.

### Run the app and worker

Use two terminals:

```bash
# terminal 1
npm run dev

# terminal 2
npm run worker
```

Open http://localhost:3000, sign in, and start a scan. The worker must be running for a queued scan to finish.

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Start the development web server |
| `npm run worker` | Start the BullMQ scan worker |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Run TypeScript without emitting files |
| `npm test` | Run unit and security tests |
| `npm run build` | Create the production Next.js build |
| `npm run start` | Start the production web server |
| `npm run db:generate` | Generate the Prisma client |
| `npm run db:push` | Apply the current Prisma schema to a database |
| `npm run db:studio` | Open Prisma Studio |
| `npm run redis:up` | Start local Redis |
| `npm run redis:down` | Stop local Redis |

## Plans and access

Free users can use one scan. Paid plans can run additional scans and use paid features such as scheduling, browser states, and PDF reports. The scan route reserves the free entitlement atomically, so two simultaneous requests cannot spend the same free scan twice. A failed request releases the reservation.

The exact limits are defined in [lib/plan-limits.ts](./lib/plan-limits.ts). Keep dashboard copy and plan configuration in sync when changing limits.

## GitHub Action

The action lives in `.github/actions/accessiscan`. It needs an API key and a target URL. Store the key in repository Actions secrets; never place it in workflow source. The action is an integration boundary and should use a user-owned, revocable key before public release.

## Testing and CI

Tests are in `tests/` and use Node's built-in test runner through `tsx`. They cover URL/SSRF rules, IPv4-mapped IPv6 handling, signature comparison, and plan entitlements. GitHub Actions runs lint, type-checking, tests, and the production build for every push to `main` and every pull request.

Run the same checks locally with:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## Documentation map

- [01-problem.md](./docs/01-problem.md) — product scope and safety limits
- [02-stack.md](./docs/02-stack.md) — technologies actually used
- [03-tradeoffs.md](./docs/03-tradeoffs.md) — important design decisions
- [04-architecture.md](./docs/04-architecture.md) — components, ownership, and data boundaries
- [05-pipeline.md](./docs/05-pipeline.md) — a scan from request to result
- [06-roadmap.md](./docs/06-roadmap.md) — completed work and next work
- [07-configuration.md](./docs/07-configuration.md) — environment variables and deployment settings

## Contributing

1. Create a branch from `main`.
2. Make a focused change.
3. Run lint, type-checking, tests, and the build.
4. Update the relevant documentation.
5. Open a pull request and explain the user-visible change.

Do not commit secrets, production data, generated `.next` files, or local `.env` files.

## License

MIT © AccessiScan
