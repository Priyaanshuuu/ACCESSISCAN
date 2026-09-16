# Architecture

Static view of the system — components, data model, boundaries.

> For request flow, see [05-pipeline.md](./05-pipeline.md).

---

## System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        CLIENTS                               │
├──────────────────────────┬──────────────────────────────────┤
│  Vibe Coder              │  Small Business Owner            │
│  GitHub PR / Action      │  Dashboard / Weekly Email        │
└──────────┬───────────────┴──────────────┬───────────────────┘
           │                               │
           ▼                               ▼
┌─────────────────────────────────────────────────────────────┐
│                    WEB APP (Next.js)                         │
│  Dashboard UI · REST API · Clerk auth · Webhooks             │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    QUEUE (Redis + BullMQ)                    │
│  Scan jobs · Priorities · Retries · Scheduled                │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    WORKER (Node.js + Playwright)             │
│  Headless browser · axe-core · Lighthouse · Custom rules     │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    DATA LAYER                                │
│  PostgreSQL (scans, issues) · R2 (screenshots, PDFs)         │
└─────────────────────────────────────────────────────────────┘
```

---

## Components

| Component | Tech | Host | Responsibility |
|---|---|---|---|
| **Web App** | Next.js 16 | Vercel | Dashboard, route handlers, auth, webhooks |
| **Worker** | Node.js + Playwright | Railway / Fly.io | Scan execution |
| **Queue** | Redis + BullMQ | Upstash | Job management |
| **Database** | PostgreSQL | Neon | Persistent data |
| **Storage** | Cloudflare R2 | R2 | Screenshots, PDF reports |
| **GitHub Action** | Node.js | GitHub | PR-level scanning |
| **CDN** | Cloudflare | — | Screenshots, badge delivery |

---

## Data Model

```
User
  ├── id, email, clerkId, plan
  └── Sites[]

Site
  ├── id, userId, url, name
  ├── platform (wordpress / wix / custom)
  └── Scans[]

Scan
  ├── id, siteId, status
  ├── scores (overall, a11y, perf, seo)
  ├── startedAt, completedAt, duration
  └── Issues[]

Issue
  ├── id, scanId
  ├── rule (button-name, image-alt)
  ├── severity (critical / warning / info)
  ├── category (a11y / perf / seo / legal / mobile)
  ├── wcag (["4.1.2"])
  ├── html, target
  ├── fix (template / AI)
  └── status (open / fixed / false-positive)
```

---

## Boundaries

| Boundary | What Crosses It | Protocol |
|---|---|---|
| Client → Web App | HTTP | REST + JSON |
| Web App → Queue | Job push | Redis |
| Queue → Worker | Job pull | Redis |
| Worker → Target Site | Page load | HTTPS |
| Worker → Database | Read/write | PostgreSQL |
| Worker → R2 | Upload | S3 API |
| Web App → GitHub | PR comment | REST API |
| Web App → Email | Send | Resend API |

---

## Auth & Access

- **Vibe Coders:** GitHub OAuth via Clerk, API key for GitHub Action
- **Small Business:** Email/password via Clerk, session cookie
- **GitHub Action:** API key in repo secrets
- **Scheduled scans:** Internal service token

---

## Environments

| Env | Web | Worker | DB | Redis |
|---|---|---|---|---|
| **Local** | localhost:3000 | localhost:3001 | Docker Postgres | Docker Redis |
| **Staging** | staging.accessiscan.com | Railway staging | Neon branch | Upstash staging |
| **Production** | accessiscan.com | Railway prod | Neon prod | Upstash prod |

---

## Tech Stack (Summary)

- **Language:** TypeScript everywhere
- **Frontend:** Next.js 16, React 19, Tailwind, shadcn/ui
- **Backend:** Next.js route handlers and a Node.js worker
- **Scanning:** Playwright, axe-core, Lighthouse
- **Data:** PostgreSQL + Prisma, Redis + BullMQ, Cloudflare R2
- **Services:** Clerk (auth), Resend (email), Stripe (payments), Sentry (errors)
- **Deploy:** Vercel (web), Railway (worker), GitHub Actions (CI/CD)

See [02-stack.md](./02-stack.md) for full details.