# Tradeoffs & Decisions

Every technical choice is a tradeoff. This doc explains what we chose, what we gave up, and why.

## 1. Single application repository

**Chose:** Keep the Next.js app, worker, and GitHub Action definition in one repository without a workspace tool.

**Why:**
- The current product has one web app and one worker, not several independently versioned packages.
- A simple npm install and simple CI job make local setup easier.
- Shared behavior is kept in `lib/` and documented instead of hidden behind a workspace build.

**Gave up:**
- Packages cannot be released independently.
- A larger team may eventually need workspace boundaries and shared package versioning.

**Verdict:** Keep the repository simple until separate release schedules or multiple consumers justify a workspace migration.

---

## 2. Next.js API Routes vs Separate Backend

**Chose:** Next.js route handlers for the web API and a separate Node.js worker for scans.

**Why:**
- Faster to ship MVP
- Same deployment as frontend
- Clerk auth works out-of-box
- Colocated with frontend code

**Gave up:**
- Long-running tasks (scanning) can't run in Next.js API routes — hence separate worker
- Cold starts on serverless
- Less control over runtime

**Verdict:** Keep the API in Next.js and isolate long-running scanning in the worker. A separate API service is unnecessary until the web API has a demonstrated scaling constraint.

---

## 3. Playwright vs Puppeteer

**Chose:** Playwright.

**Why:**
- Multi-browser (Chromium, Firefox, WebKit)
- Better auto-wait (network idle, hydration)
- Built-in test runner
- Active development (Microsoft)

**Gave up:**
- Larger install size (~300 MB with browsers)
- Slower cold start than Puppeteer

**Verdict:** Playwright wins for reliability. Cold start handled by keeping workers warm.

---

## 4. BullMQ vs GCP Pub/Sub vs SQS

**Chose:** BullMQ + Redis.

**Why:**
- Simple setup, great local DX
- Bull Board UI for debugging
- Retries, backoff, priorities built-in
- Works on any host (Railway, Fly, etc.)

**Gave up:**
- Redis is stateful — extra infra to manage
- Not as scalable as Pub/Sub at massive scale

**Verdict:** BullMQ is perfect for MVP → mid-scale. Migrate to Pub/Sub later if needed.

---

## 5. Prisma vs Drizzle vs Raw SQL

**Chose:** Prisma.

**Why:**
- Best DX, migrations, type-safe client
- Studio for local DB inspection
- Great docs and community

**Gave up:**
- Some queries slower than raw SQL
- Less control over generated SQL
- Heavier runtime

**Verdict:** Prisma for speed of development. Optimize later with raw SQL for hot paths.

---

## 6. Clerk vs NextAuth vs Supabase Auth

**Chose:** Clerk.

**Why:**
- GitHub OAuth out-of-box (critical for vibe coders)
- Prebuilt UI components
- Session management
- Free tier 10K MAU

**Gave up:**
- Vendor lock-in
- Cost scales with MAU
- Less control

**Verdict:** Clerk for speed. Migrate if cost becomes issue.

---

## 7. Vercel vs Self-hosted

**Chose:** Vercel for web, Railway for worker.

**Why:**
- Vercel is Next.js native — zero config
- Railway handles long-running Node processes
- Both have generous free tiers

**Gave up:**
- Vendor lock-in
- Cost scales
- Less control over infra

**Verdict:** Ship fast. Migrate to GCP Cloud Run later if cost or control demands.

---

## 8. axe-core + Lighthouse vs Custom Engine

**Chose:** Use axe-core + Lighthouse.

**Why:**
- Industry standard
- Well-maintained
- WCAG 2.2 AA rules built-in
- Recognized by legal teams

**Gave up:**
- Limited to what these engines can detect
- ~30-40% of real issues missed (known limitation)
- Dependency on external projects

**Verdict:** Wrapper around established engines. Add custom rules for context. Never claim 100% coverage.

---

## 9. AI Fix Suggestions vs Templates

**Chose:** Hybrid — templates for common issues, AI for complex.

**Why:**
- Templates are free, instant, deterministic
- AI handles edge cases templates can't
- Cost control (cache AI responses)

**Gave up:**
- AI can be wrong
- AI costs money
- AI adds latency

**Verdict:** Templates first. AI as fallback. Always show confidence score.

---

## 10. Code Review vs Deployed Site Scan

**Chose:** Deployed site scan (not code review).

**Why:**
- Real rendered output is the truth
- Framework/CSS/JS can break accessibility at runtime
- Works for non-technical clients
- Framework-agnostic

**Gave up:**
- Can't catch issues before deploy (unless we add VS Code extension)
- Slower than static analysis
- Needs a live URL

**Verdict:** Deployed scan is the core. VS Code extension is a future addition.

---

## 11. Free Tier vs Paid Only

**Chose:** Freemium.

**Why:**
- Vibe coders expect free tier
- Nonprofits get free forever (mission)
- Paid tiers for scale + features
- Free tier = acquisition channel

**Gave up:**
- Abuse risk
- Cost of free users
- Support burden

**Verdict:** Free tier strictly limited (1 site, 3 scans/month, no scheduling).

---

## 12. Postgres vs Firestore vs MongoDB

**Chose:** Postgres.

**Why:**
- Relational data (users → sites → scans → issues)
- Strong consistency
- JSON columns for flexible issue data
- Mature ecosystem

**Gave up:**
- Less flexible than document DBs
- Requires schema migrations

**Verdict:** Postgres for structure, JSONB for flexibility.

---

## 13. Single Region vs Multi-Region

**Chose:** Single region for MVP.

**Why:**
- Simpler
- Cheaper
- Faster to ship

**Gave up:**
- Higher latency for far users
- No failover

**Verdict:** Single region now. Multi-region later when we have paying customers in multiple geos.

---

## Summary Table

| Decision | Chose | Gave Up | Revisit When |
|---|---|---|---|
| Monorepo | ✅ | Simplicity | Team > 10 people |
| Next.js API | ✅ | Long-running tasks | Scan volume > 1M/month |
| Playwright | ✅ | Install size | Never |
| BullMQ | ✅ | Massive scale | > 10K jobs/min |
| Prisma | ✅ | Query control | Hot path optimization |
| Clerk | ✅ | No lock-in | > 10K MAU |
| Vercel + Railway | ✅ | Control | Cost > $500/mo |
| axe + Lighthouse | ✅ | Custom detection | Need > 60% coverage |
| AI + Templates | ✅ | Determinism | AI cost > 20% revenue |
| Deployed scan | ✅ | Pre-deploy checks | Add VS Code extension |
| Freemium | ✅ | Abuse | Abuse > 5% of cost |
| Postgres | ✅ | Flexibility | Never |
| Single region | ✅ | Latency | Multi-geo customers |
