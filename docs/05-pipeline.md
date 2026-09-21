# Scan pipeline

This is the path from a user's click to a completed report.

## 1. Request and authorization

The dashboard sends a scan request to the Next.js API. The route identifies the Clerk user, validates the URL and scan options, checks the site's ownership, and applies plan access. A free user has one scan entitlement. The entitlement is reserved atomically so concurrent requests cannot spend it twice.

Invalid input is rejected before a queue slot is reserved. This avoids wasting quota on malformed URLs, unsupported browser states, or invalid scan options.

## 2. Create and queue

The API creates a `Scan` row with a queued status and adds a BullMQ job containing the scan ID and the selected browser-state ID, if any. The response contains the scan ID; the browser request does not wait for the scan to finish.

Schedules use BullMQ job schedulers. Enabling a schedule creates or updates its repeating scheduler; disabling it removes future runs while preserving completed scan history.

## 3. Worker lifecycle

The worker claims the job and marks the scan as running. Before launching Chromium it checks that a requested browser state exists, belongs to the same user, is not expired, and is a supported storage-state record. Expired or unsupported state fails clearly without leaving a browser process open.

## 4. Browser navigation

Playwright opens the target URL with bounded timeouts. Requests and redirects are checked against the SSRF policy. Private, loopback, link-local, metadata, multicast, and reserved destinations are blocked, including IPv4-mapped IPv6 addresses.

The worker may capture page HTML, screenshots, and browser console/network information needed by the report. It does not expose saved cookies or storage state to the dashboard.

## 5. Scan engines

| Engine | Purpose | Typical result |
|---|---|---|
| Playwright | Real rendered page and browser behavior | Page metadata, links, screenshots, custom checks |
| axe-core | Automated accessibility checks | Rule, impact, selector, and help text |
| Lighthouse | Performance, SEO, and best practices | Category scores and metrics |

Lighthouse runs through a loopback validating proxy. The proxy validates and pins every connection, including HTTPS `CONNECT` destinations, so a redirect or DNS change cannot bypass the URL policy.

Both sides of each proxy connection have error/close handlers. A browser or destination disconnect closes its paired stream rather than crashing the worker. Idle connections expire after 30 seconds, and proxy shutdown explicitly destroys HTTP sockets and CONNECT tunnels. The worker owns Lighthouse's Chrome process and closes it even when the Lighthouse CLI reaches its two-minute timeout. If Lighthouse fails, other scan results can still complete with `lighthouseError` explaining why its scores are unavailable.

## 6. Normalize and save

The worker maps engine output into the application's issue format, calculates category scores, and stores the scan and its issues. Findings are attached to that scan only; old scans are not modified when a later scan runs.

The scan status becomes `completed` when results are saved. A terminal worker failure becomes `failed` with an error message suitable for the dashboard.

## 7. Read results

The dashboard reads only scans owned by the signed-in user. Paid users can download a PDF report. Free users can see the scan result but cannot use paid report, schedule, or browser-state features.

## 8. Retries and operational limits

BullMQ handles retryable worker failures with backoff. The API and queue apply rate and concurrency limits. Production operators should monitor queue depth, stalled jobs, worker memory, browser launch failures, and repeated target-site timeouts.

A failed attempt leaves the scan running and keeps its concurrency slot while the queue retries it. Only an exhausted/terminal queue failure marks the scan failed. New scan jobs use a renewable 60-second lock; stalled-job checks recover interrupted jobs when the worker restarts. Previously created locks can retain their old five-minute expiry.

On startup and every minute, the worker checks unfinished database rows older than five minutes against the queue. Active, waiting, delayed and other runnable jobs are preserved, including legitimate long-running scans. Terminal or missing jobs become failed with a recovery message. Status updates compare the original timestamp so reconciliation cannot overwrite a newer attempt or completed scan. A Redis error leaves scan statuses unchanged.

After installing a worker fix, restart the process with `npm.cmd run worker` on Windows (or `npm run worker` elsewhere). Existing interrupted jobs can retry once their locks expire; orphaned records are reconciled instead of remaining running forever. This does not refund or reset an already-used free scan.

## What the result means

Automated checks can miss keyboard, screen-reader, authentication-flow, and content-context problems. A successful scan means the engines completed; it does not certify legal compliance or guarantee that every visitor can use the site.
