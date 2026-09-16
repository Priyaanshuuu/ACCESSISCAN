# Stack, Third Parties & Libraries

## Core Stack

| Layer | Choice | Why |
|---|---|---|
| Language | TypeScript | Type safety, shared types across monorepo |
| Frontend | Next.js 16 (App Router) | SSR, route handlers, file-based routing, Vercel-native |
| UI | React 19 + Tailwind + shadcn/ui | Fast, accessible components (Radix-based) |
| Backend API | Next.js route handlers | Shared deployment and authentication boundary |
| Worker | Node.js + Playwright | Headless browser automation |
| Database | PostgreSQL | Relational, reliable, mature |
| ORM | Prisma | Best DX, migrations, type-safe |
| Queue | BullMQ + Redis | Simple, reliable, Bull Board UI |
| Auth | Clerk | GitHub OAuth, session management |
| Storage | Cloudflare R2 | S3-compatible, zero egress |
| Email | Resend | Modern API, React email templates |
| Payments | Stripe + Razorpay | Global + India |
| Monitoring | Sentry + Axiom | Errors + logs |
| Deploy (Web) | Vercel | Next.js native |
| Deploy (Worker) | Railway / Fly.io | Long-running process |
| CI/CD | GitHub Actions | Obvious |

## Scanning Engine

| Library | Purpose |
|---|---|
| Playwright | Headless browser (Chromium/Firefox/WebKit) |
| axe-core | WCAG 2.2 AA accessibility rules |
| @axe-core/playwright | Playwright integration |
| lighthouse | Performance, SEO, best practices |
| chrome-launcher | Chrome process for Lighthouse |
| cheerio | HTML parsing for custom rules |

## Supporting Libraries

| Library | Purpose |
|---|---|
| Zod | Runtime validation |
| TanStack Query | Server state (frontend) |
| Zustand | Client state |
| date-fns | Dates |
| nanoid | Short IDs for reports |
| pino | Structured logging |
| ioredis | Redis client |
| @react-pdf/renderer | PDF reports |
| OpenAI / Anthropic SDK | AI fix suggestions |
| Recharts | Score charts |
| Lucide | Icons |
| Sonner | Toasts |

## Dev Tools

| Tool | Purpose |
|---|---|
| pnpm | Package manager + workspaces |
| Turborepo | Monorepo build system |
| ESLint + Prettier | Lint + format |
| Vitest | Unit tests |
| Playwright Test | E2E tests |
| Docker | Local Postgres + Redis |
| Husky + lint-staged | Pre-commit hooks |
| changesets | Versioning for GitHub Action |

## Third-Party Services (External)

| Service | Purpose | Free Tier |
|---|---|---|
| Clerk | Auth | 10K MAU |
| Cloudflare R2 | Storage | 10 GB |
| Resend | Email | 3K emails/mo |
| Sentry | Errors | 5K events/mo |
| Axiom | Logs | 500 MB/mo |
| Stripe | Payments | Pay per txn |
| Vercel | Hosting | Hobby free |
| Railway | Worker | $5 credit |
| Upstash | Redis | 10K commands/day |
