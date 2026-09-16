# Full Pipeline

End-to-end flow from trigger to response.

```
TRIGGER → API → QUEUE → WORKER → BROWSER → SCAN → PROCESS → STORE → NOTIFY → RESPONSE
```

---

## 1. Trigger

Three ways a scan starts:

- **GitHub Action** — PR raised or code pushed
- **Dashboard** — user clicks "Scan"
- **Scheduled** — weekly/daily automatic

---

## 2. API

Auth → rate limit → validate URL → create DB record → push job to queue → return `scanId`.

```
POST /v1/scan
{ "url": "https://...", "source": "github_action", "pr": 42 }
→ { "scanId": "scan_abc123", "status": "queued" }
```

**Validations:** Zod schema, SSRF-safe destination checks that block loopback, private, link-local, and cloud-metadata addresses (including IPv6), redirect revalidation, and rate limits per plan (free: 3/mo, indie: 100, business: 1000).

---

## 3. Queue (BullMQ + Redis)

```
waiting → active → completed
                 → failed → retry (3x, exponential backoff) → DLQ
```

**Priorities:** Agency > Business > Indie > Free.

**Features:** priority, retries, backoff, DLQ, concurrency 5, repeatable jobs for scheduling.

---

## 4. Worker (Node.js + Playwright)

Long-running process picks jobs from queue.

```
Update status → acquire browser → navigate → run scans → classify → score → fixes → save → notify
```

Concurrency: 5 jobs at once. Browser pool: 3 reusable Chromium instances (avoids 2s launch cost).

---

## 5. Browser (Playwright)

```
Navigate (networkidle, 30s timeout)
  → wait for hydration (2s)
  → auto-scroll (lazy content)
  → screenshot (webp, fullPage)
```

---

## 6. Scan (Three Engines)

| Engine | Purpose | Output |
|---|---|---|
| **axe-core** | Accessibility (WCAG 2.2 AA) | Violations with impact |
| **Lighthouse** | Performance + SEO | Scores + metrics (LCP, CLS, TBT) |
| **Custom rules** | Legal, mobile, broken links | Context-specific issues |

---

## 7. Process

### Classify

```
axe impact → our severity:
  critical/serious → 🔴 critical
  moderate         → 🟡 warning
  minor            → 🔵 info

Context overrides:
  donation form label missing → critical
  decorative image alt missing → info
```

### Score

```
Overall = (a11y × 0.40) + (perf × 0.25) + (seo × 0.20) + (bestPractices × 0.15)
Category = 0 if any critical, else 100 − (warnings × 5) − (info × 2)
```

### Fix Generation

1. Template lookup (fast, free)
2. Platform guide (WordPress/Wix)
3. AI fallback (LLM, cached)

---

## 8. Store

- **Postgres** — scan, issues, scores
- **R2** — screenshots
- **Redis** — 6h cache for duplicate URLs

---

## 9. Notify

- **GitHub** — PR comment via Octokit
- **Email** — Resend with React Email template
- **Webhook** — optional user-configured URL

---

## 10. Response

- **GitHub Action** — polls every 5s, posts comment, sets check status
- **Dashboard** — score card, issue list, history chart, PDF download

---

## Timing

| Stage | Time |
|---|---|
| Trigger | 0s |
| API | 100–500ms |
| Queue wait | 0–30s |
| Worker pickup | 0–5s |
| Browser navigate | 3–10s |
| axe-core | 2–5s |
| Lighthouse | 15–30s |
| Custom rules | 1–3s |
| Process | 1–2s |
| Fix generation | 1–5s |
| Store | 0.5–2s |
| Notify | 1–3s |
| **Total** | **25–96s, depending on queue and site response time** |

---

## Error Handling

| Error | Handling |
|---|---|
| Invalid URL | 400 with message |
| Rate limit | 429 with retry-after |
| Site down | Retry 3x, then fail |
| Timeout | 30s cap, partial report |
| Browser crash | Auto-restart, retry |
| axe/Lighthouse fail | Log, continue with other |
| DB/R2 fail | Retry, DLQ |
| GitHub/Email fail | Retry, Sentry |

---

## Scaling

| Users | Workers | Browsers | Concurrency |
|---|---|---|---|
| 0–100 | 1 | 3 | 5 |
| 100–1000 | 3 | 10 | 15 |
| 1000–10000 | 10 | 30 | 50 |
| 10000+ | K8s autoscale | Per-worker | 100+ |

---

## One-Line Summary

**Trigger → API → Queue → Worker → Browser → Scan → Process → Store → Notify → Response.**

Every stage is independently observable and retryable where the operation is idempotent. Automated results are signals, not proof of legal compliance; manual testing and professional review remain necessary.