# Roadmap

This roadmap describes planned work. Only the initial Next.js web shell is currently implemented.

## Phase 0: Foundation

- [x] Create the Next.js web shell
- [x] Establish documentation for the product and proposed architecture
- [ ] Decide the monorepo layout and package ownership
- [ ] Add environment variable documentation

## Phase 1: Scanning MVP

- [ ] Add the scan API as a Next.js route handler
- [ ] Add PostgreSQL and Prisma models for sites, scans, and issues
- [ ] Add Redis and BullMQ integration
- [ ] Add the Node.js Playwright worker
- [ ] Run axe-core and Lighthouse against a deployed URL
- [ ] Display scan status and results in the dashboard
- [ ] Add SSRF protection, rate limiting, and structured error handling

## Phase 2: Workflow Integrations

- [ ] Add GitHub Action and pull-request reporting
- [ ] Add scheduled scans and email notifications
- [ ] Add score history, badges, and PDF reports
- [ ] Add deterministic fix templates

## Phase 3: Product Expansion

- [ ] Add AI-assisted fix suggestions with review and confidence indicators
- [ ] Add billing and plan limits
- [ ] Add team and agency features
- [ ] Evaluate multi-region deployment based on measured demand

## Out Of Scope For Automated Scanning

Automated results are not proof of legal compliance. Manual testing, including keyboard, screen-reader, and user-flow testing, and appropriate professional or legal review remain necessary.