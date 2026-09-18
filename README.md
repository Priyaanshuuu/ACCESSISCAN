# AccessiScan

> Automated accessibility, performance, and SEO scanning for vibe coders and small businesses.


AccessiScan is planned as a service that scans deployed websites with a headless browser, finds accessibility, performance, and SEO issues, and explains how to fix them in plain English.

> **Project status:** This repository currently contains the initial Next.js web shell. The scanner, worker, database, queue, authentication, and integrations described below are planned architecture, not implemented features.

---

## The Problem

- **Vibe coders** ship fast with AI tools but deploy inaccessible, slow code.
- **Small businesses** get hit with accessibility lawsuits they never saw coming.
- **Manual audits** cost $5,000–$20,000+ and don't stay fixed.
- **Free tools** (axe-core, Lighthouse) are engines, not products.

## The Solution

| For Vibe Coders | For Small Businesses |
|---|---|
| GitHub Action that scans every PR | Dashboard with plain-English reports |
| PR comments with copy-paste fixes | Weekly scheduled scans + email alerts |
| Score badges for READMEs | PDF reports for legal evidence |
| Free tier: 1 site, 3 scans/month | Free for nonprofits |

---

## Features

- 🔍 **Headless scanning** — Playwright + Chromium, real rendering, no static analysis
- ♿ **Accessibility** — axe-core, WCAG 2.2 AA rules
- ⚡ **Performance** — Lighthouse metrics (LCP, CLS, TBT, FCP, SI)
- 🔎 **SEO & Best Practices** — meta tags, mobile, crawlability
- 📋 **Custom rules** — legal checks, tap targets, broken links
- 💡 **Plain-English fixes** — templates + AI-powered suggestions
- 🔗 **GitHub Action** — scan every PR, comment results
- 📧 **Scheduled scans** — weekly monitoring with email alerts
- 📄 **PDF reports** — legal evidence + trend history
- 🏅 **Badges** — embeddable score for READMEs and websites

---

## Quick Start (Current Repository)

### Prerequisites

- Node.js 20+
- npm, pnpm, or another Node.js package manager

### Setup

```bash
# Clone
git clone https://github.com/accessiscan/accessiscan.git
cd accessiscan

# Install dependencies
npm install

# Start the Next.js development server
npm run dev
```

The current app is available at http://localhost:3000.

Scanning is not implemented in the current repository yet.

---

## Architecture

```
Client → Web App → Queue → Worker → Browser → Scan → Store → Notify
```

| Component | Tech | Host |
|---|---|---|
| Web App | Next.js 16 + React 19 | Vercel |
| Worker | Node.js + Playwright | Railway |
| Queue | Redis + BullMQ | Upstash |
| Database | PostgreSQL + Prisma | Neon |
| Storage | Cloudflare R2 | R2 |
| GitHub Action | Node.js | GitHub |

See [`docs/04-architecture.md`](./docs/04-architecture.md) for the full picture.

---

## Tech Stack

**Language:** TypeScript everywhere — frontend, backend, worker, action.

**Core:**
- Next.js 16, React 19, Tailwind CSS, shadcn/ui
- Node.js worker, BullMQ
- PostgreSQL, Prisma
- Playwright, axe-core, Lighthouse
- Clerk (auth), Resend (email), Stripe (payments)

See [`docs/02-stack.md`](./docs/02-stack.md) for the full stack.

---

## Planned Project Structure

```
accessiscan/
├── apps/
│   ├── web/          # Next.js dashboard + API
│   ├── worker/       # Scan worker (Playwright + BullMQ)
│   └── action/       # GitHub Action
├── packages/
│   ├── db/           # Prisma schema + client
│   ├── scanner/      # axe-core + Lighthouse logic
│   ├── fixes/        # Fix generation (templates + AI)
│   ├── types/        # Shared TypeScript types
│   └── ui/           # Shared UI components
├── docs/             # Project documentation
└── docker-compose.yml
```

---

## Documentation

| Doc | What's Inside |
|---|---|
| [01-problem.md](./docs/01-problem.md) | Problem statement, target users, why now |
| [02-stack.md](./docs/02-stack.md) | Full stack, third parties, libraries |
| [03-tradeoffs.md](./docs/03-tradeoffs.md) | Every technical decision + tradeoff |
| [04-architecture.md](./docs/04-architecture.md) | System structure, data model, boundaries |
| [05-pipeline.md](./docs/05-pipeline.md) | End-to-end scan flow |
| [06-roadmap.md](./docs/06-roadmap.md) | Phase-wise build plan |

---

## GitHub Action

Add the following workflow after setting `ACCESSISCAN_API_KEY` in repository secrets:

```yaml
name: AccessiScan
on:
  pull_request:
    branches: [main]
jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: ./\.github/actions/accessiscan
        with:
          api-key: ${{ secrets.ACCESSISCAN_API_KEY }}
          url: ${{ github.event.deployment_status.target_url }}
          comment-on-pr: true
          fail-on-severity: critical
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

**Outputs:** `score`, `issues-count`, `report-url`

---

## Pricing

| Plan | Price | Sites | Scans/mo | Features |
|---|---|---|---|---|
| **Free** | $0 | 1 | 3 | Basic score, no scheduling |
| **Indie** | $9/mo | 5 | 100 | GitHub Action, weekly scans, badges |
| **Business** | $29/mo | 10 | 1000 | Daily scans, PDF reports, email alerts |
| **Agency** | $99/mo | Unlimited | 10000 | White-label, API, team seats |

**Nonprofits:** Business plan free forever.

---

## Development (Current Repository)

```bash
npm run dev        # Start the Next.js development server
npm run build      # Build the Next.js app
npm run start      # Start the production server
npm run lint       # Run ESLint
```

The scanner-specific commands below are planned and will become available after the monorepo packages are added.

### Planned scan rule workflow

1. Add rule to `packages/scanner/src/custom-rules.ts`
2. Add fix template to `packages/fixes/src/templates.ts`
3. Add test in `packages/scanner/tests/`
4. Update `docs/05-pipeline.md` if flow changes

---

## Contributing

Contributions welcome. Please:

1. Fork the repo
2. Create a feature branch (`git checkout -b feat/amazing-feature`)
3. Commit with conventional commits (`feat:`, `fix:`, `docs:`)
4. Push and open a PR
5. Ensure CI passes

Contribution guidance will be added when the implementation packages are introduced.

---

## Roadmap

- [x] Initial Next.js web shell
- [ ] MVP — manual scan + dashboard
- [ ] GitHub Action on Marketplace
- [ ] Paid tiers (Stripe + Razorpay)
- [ ] Scheduled scans + email reports
- [ ] PDF generation
- [ ] Badge system
- [ ] VS Code extension
- [ ] Browser extension
- [ ] AI-powered fix suggestions
- [ ] Multi-region deployment

See [docs/06-roadmap.md](./docs/06-roadmap.md) for details.

---

## License

MIT © AccessiScan

---

## Acknowledgments

Built with [Playwright](https://playwright.dev), [axe-core](https://github.com/dequelabs/axe-core), [Lighthouse](https://developer.chrome.com/docs/lighthouse), and [Next.js](https://nextjs.org).

---

**Ship fast. Don't break accessibility.**