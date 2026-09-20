# Technology stack

This list describes dependencies used by the current repository. It intentionally does not list planned services.

## Application

| Area | Technology | What it does |
|---|---|---|
| Web app | Next.js 16 App Router | Pages, server rendering, and API route handlers |
| UI | React 19, Tailwind CSS, local UI components | Dashboard and scan results |
| Language | TypeScript | Application, worker, and shared utilities |
| Authentication | Clerk | Sign-in, sessions, and user identity |
| Database | PostgreSQL with Prisma 7 | Users, sites, scans, issues, schedules, and browser states |
| Queue | Redis with BullMQ 6 | Scan jobs, retries, rate limits, and repeatable jobs |

## Scan engine

| Library | Role |
|---|---|
| Playwright | Opens the target site and captures rendered page data |
| axe-core | Finds automated WCAG accessibility violations |
| Lighthouse | Measures performance, SEO, and best-practice signals |
| Chrome Launcher | Starts the Chrome process used by Lighthouse |
| PDFKit | Creates downloadable scan reports |

The worker runs separately from Next.js because browser scans are long-running and resource-intensive. Lighthouse traffic goes through a local validating proxy so redirects, DNS results, and subresources receive the same public-network checks.

## Integrations

| Service | Role | Required? |
|---|---|---|
| Razorpay | Orders and payment verification | Only for billing |
| Resend | Email delivery | Only for email notifications |
| GitHub Actions | CI and optional scan action | Only for GitHub workflows |

The repository does not currently use Stripe, R2, Sentry, Axiom, Turborepo, or a pnpm workspace. Add a dependency only when the corresponding feature is implemented and documented.

## Development tools

- ESLint for linting.
- TypeScript compiler for type-checking.
- Node's built-in test runner through `tsx` for unit and security tests.
- GitHub Actions for lint, type-check, tests, and build verification.
- Docker Compose for local Redis.

## Runtime boundary

The web app validates input and creates database and queue records. The worker owns browser execution and result persistence. Neither side should trust a URL, browser state, payment callback, or API key without validation and authorization.
