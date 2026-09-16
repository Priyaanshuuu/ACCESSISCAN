# Problem We Are Solving

## One-liner
AccessiScan automatically finds accessibility, performance, and SEO issues on websites and tells owners how to fix them — in plain English.

## Who We Serve

### Segment 1: Vibe Coders / Indie Hackers
Developers shipping fast with AI tools (Cursor, v0, Lovable, Bolt). They deploy fast but ship inaccessible, slow, and SEO-broken code. They don't have time or knowledge to run manual audits.

**Pain points:**
- AI-generated code consistently misses accessibility (ARIA, alt text, labels, contrast)
- No time to learn WCAG
- Existing tools (Lighthouse, axe) are raw and developer-unfriendly
- No CI/CD integration to catch issues before merge

### Segment 2: Small Businesses & Nonprofits
Owners running WordPress, Wix, or Squarespace sites. They don't know they have a problem until a lawsuit lands.

**Pain points:**
- Professional accessibility audits cost $5,000–$20,000+
- Existing tools are enterprise-priced or too technical
- Legal risk: ADA, WCAG 2.2 AA, Section 508, EAA, RPwD Act
- No clear record of remediation work and monitoring history
- No ongoing monitoring — one fix doesn't stay fixed

## The Real Cost

- **Accessibility demand is widespread.** The healthcare-referral figure and other market-size claims should be replaced with a dated, cited source before publication.
- **Website accessibility litigation is a material risk**, especially for smaller organizations, but legal exposure varies by jurisdiction and business context.
- **AI-generated code can reproduce accessibility defects** when accessibility checks are not part of the delivery workflow.
- **Automated monitoring can reduce the cost of repeated checks**, but it does not replace a manual accessibility audit.

## Why Now

1. **Regulation is changing.** Track applicable deadlines by jurisdiction and confirm legal claims with current primary sources.
2. **AI coding is exploding.** Vibe coding market is $4.7B, growing 38% CAGR.
3. **Free tools exist but don't solve the workflow problem.** axe-core and Lighthouse are engines, not products.
4. **Compliance is a recurring need.** One-time audits don't work — sites change weekly.

## What We're Building

A platform that:
1. Scans any deployed website with a headless browser
2. Runs axe-core + Lighthouse + custom rules
3. Classifies issues by severity and legal risk
4. Generates plain-English explanations + copy-paste fixes
5. Integrates with GitHub for PR-level scanning (vibe coders)
6. Sends weekly reports + PDF evidence (small businesses)
7. Tracks score history over time

> Automated scanning does not establish legal compliance or replace keyboard, screen-reader, user-flow, and professional review.