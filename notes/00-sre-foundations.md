# Phase 0: SRE Foundations for Frontend: Cheat Sheet

## 1. SLI / SLO / SLA

| Term | What it is | Who owns it | Example |
|---|---|---|---|
| **SLI** (Indicator) | A *measurement*, usually a ratio of good events to total events | Engineering | `good page loads / all page loads` |
| **SLO** (Objective) | A *target* for an SLI over a window | Engineering + Product | 95% of page loads have LCP < 2.5s over 28 days |
| **SLA** (Agreement) | A *contract* with consequences (credits/penalties) | Business/Legal | 99.5% monthly availability or the customer gets a 10% credit |

**Rule:** SLA is always looser than SLO. The SLO is your internal early warning before you breach the SLA.

> Interview line: "An SLI is what we measure, an SLO is what we aim for, an SLA is what we promise, and the gap between SLO and SLA is our safety margin."

### Good frontend SLIs (always phrase them as good/total)
| SLI | Good event | Source |
|---|---|---|
| Page load performance | Views with LCP ≤ 2.5s | Datadog RUM |
| Interactivity | Views with INP ≤ 200ms | Datadog RUM |
| Visual stability | Views with CLS ≤ 0.1 | Datadog RUM |
| Error-free sessions | Sessions with 0 JS errors | RUM / Sentry |
| Crash-free sessions | Sessions without error-boundary fallback | Sentry release health |
| API success (from browser) | XHR/fetch with status < 500 | RUM resources |
| Availability | Synthetic check for app shell passes | Datadog Synthetics |

**Why measure from the browser?** The backend can report 100% healthy while users see a white screen: a bad JS bundle, a CDN serving stale `index.html` pointing at deleted chunks (`ChunkLoadError`), a third-party script crash, or CORS breakage. Only client-side telemetry catches these.

### Choosing SLO targets
- Start from **current baseline** (e.g. p75 LCP today), not aspirational numbers.
- Use **p75** for Web Vitals (Google's standard); p95/p99 for latency-sensitive APIs.
- Window: **rolling 28 or 30 days** is typical.
- Fewer SLOs that are meaningful beat many vanity ones. Tie them to **critical user journeys** (login, view dashboard, run query).

## 2. Error Budgets

**Error budget = 100% − SLO.** With a 99.5% SLO over 30 days, 0.5% of events are allowed to be bad.

- 1M page loads/month × 0.5% = **5,000 bad loads allowed**.
- Time-based: 99.9% over 30 days = **43.2 min** of downtime.

| Availability | Downtime / 30 days |
|---|---|
| 99% | 7.2 h |
| 99.5% | 3.6 h |
| 99.9% | 43.2 min |
| 99.95% | 21.6 min |
| 99.99% | 4.3 min |

### Error budget policy (what you do with it)
- Budget **healthy** → ship features, run experiments, take risks.
- Budget **< 25% remaining** → slow down; extra review on risky changes.
- Budget **exhausted** → feature freeze; only reliability work and fixes until it recovers.
- Burned by one incident → mandatory postmortem.

**Error-budget review** (the JD says you'll "lead" these): a weekly or bi-weekly meeting covering budget remaining per SLO, what burned it (incidents, deploys, third parties), trend, and action items. The output is a prioritization decision: features vs reliability.

## 3. Burn Rate Alerting

**Burn rate** = how fast you consume budget relative to the "even" rate.
Burn rate 1 = budget lasts exactly the window. Burn rate 14.4 = whole 30-day budget gone in ~2 days.

Google SRE multi-window, multi-burn-rate (the standard answer):

| Severity | Burn rate | Long window | Short window | Budget consumed |
|---|---|---|---|---|
| Page (urgent) | 14.4 | 1 h | 5 min | 2% in 1 h |
| Page | 6 | 6 h | 30 min | 5% in 6 h |
| Ticket | 1 | 3 days | 6 h | 10% in 3 days |

The **short window** makes the alert reset quickly once the problem is fixed. The **long window** prevents flapping on blips. Datadog supports burn-rate alerts directly on SLOs.

> Why not alert on "error rate > 1%"? Static thresholds are noisy at low traffic and blind to slow burns. Burn-rate alerts tie paging to **user impact against the SLO**.

## 4. Incident Vocabulary

- **MTTD**: mean time to detect. **MTTA**: to acknowledge. **MTTR**: to resolve/restore. **MTBF**: between failures.
- **Severity levels**: SEV1 (major outage, all users) → SEV4 (minor, workaround exists).
- **Roles**: Incident Commander (coordinates, doesn't debug), Ops/Tech lead (debugs), Comms lead (status page, stakeholders), Scribe.
- **Lifecycle**: Detect → Triage (severity, scope) → Mitigate (**rollback first, debug later**) → Resolve → Postmortem → Follow-ups.
- **Blameless postmortem**: focus on *systems and process*, not people. "Why did the system allow this?" Sections: summary, impact (users, duration, budget burned), timeline, root cause + contributing factors (5 Whys), what went well / badly / lucky, action items with owners and dates.
- **Toil**: manual, repetitive, automatable work with no lasting value. SRE aims for < 50% toil.
- **Runbook**: step-by-step guide for a specific alert ("If LCP SLO burn alert fires: 1. check recent deploys…").

## 5. Core Web Vitals (know these cold)

| Metric | Measures | Good | Needs work | Poor |
|---|---|---|---|---|
| **LCP** Largest Contentful Paint | Loading | ≤ 2.5s | ≤ 4s | > 4s |
| **INP** Interaction to Next Paint | Responsiveness | ≤ 200ms | ≤ 500ms | > 500ms |
| **CLS** Cumulative Layout Shift | Visual stability | ≤ 0.1 | ≤ 0.25 | > 0.25 |

Assessed at **p75** of page loads, split by mobile and desktop.

**INP replaced FID in March 2024.** FID measured only the *input delay* of the *first* interaction. INP measures the *full latency* (input delay + processing + presentation delay) of roughly the *worst* interaction across the whole page life. For SPAs and dashboards, INP is far more meaningful.

Supporting metrics: **TTFB** (≤ 0.8s; server/CDN), **FCP** (≤ 1.8s), **TBT** (lab-only proxy for INP), **Long Tasks** (> 50ms on main thread).

### Causes and fixes
**LCP**
- LCP sub-parts: TTFB → resource load delay → resource load duration → element render delay.
- Fixes: CDN + caching (TTFB), `<link rel="preload">` / `fetchpriority="high"` for the hero image, no lazy-loading the LCP image, smaller JS so render isn't blocked, SSR/SSG for content, compressed images (AVIF/WebP), font `display: swap`.
- SPA gotcha: if LCP content needs JS → API → render, LCP is inherently slow. Consider SSR, streaming, or skeletons (but skeletons don't count as LCP if the real content is bigger).

**INP**
- Long tasks on the main thread; heavy re-renders on input; huge DOM (no virtualization); synchronous third-party scripts.
- Fixes: `useTransition` / `useDeferredValue`, memoization, virtualization (react-window / TanStack Virtual), breaking up work (`scheduler.yield()`, `setTimeout`), moving work to Web Workers, debouncing.

**CLS**
- Images without width/height, late-injected banners/ads, web fonts swapping (FOIT/FOUT), content inserted above existing content.
- Fixes: reserve space (`aspect-ratio`, min-height), `font-display: optional` or size-adjusted fallbacks, insert below the fold or in overlays, animate with `transform` rather than layout properties.

## 6. Lab vs Field Data

| | Lab (synthetic) | Field (RUM) |
|---|---|---|
| Tools | Lighthouse, WebPageTest, Lighthouse CI, Datadog Synthetics | Datadog RUM, CrUX, `web-vitals` lib, Sentry Perf |
| Environment | Controlled device and network | Real users, devices, networks |
| Good for | **Catching regressions pre-deploy** (CI gate), debugging | **Truth about user experience**, SLOs |
| INP? | No (uses TBT as a proxy) | Yes |

> Why they disagree: Lighthouse runs one cold load on a simulated mid-tier mobile device with throttling. Real users have warm caches, varied devices, interactions, and long sessions. Use **lab to prevent** regressions and **field to measure** reality. SLOs are always on field data.

## 7. Performance Budgets
Thresholds that fail the build or alert:
- **Metric-based**: LCP < 2.5s, TBT < 200ms, CLS < 0.1 (Lighthouse CI assertions).
- **Quantity-based**: JS ≤ 200KB gzipped for the initial route, ≤ N requests, total page weight ≤ 1MB.
- **Rule-based**: Lighthouse performance score ≥ 90, accessibility ≥ 95.

Enforce in CI (Lighthouse CI, `size-limit`, bundlesize) **and** monitor in production (RUM monitors on p75 vitals per `version`).

## 8. Practice Questions (answer out loud)
1. How would you define SLOs for a React observability dashboard? *(Pick critical journeys → choose SLIs → baseline → set target → error budget policy → burn-rate alerts → review cadence.)*
2. The backend is green but users report a broken UI. How do you detect this proactively?
3. Our LCP p75 went from 2.1s to 3.4s after Tuesday's deploy. Walk me through it.
4. What's the difference between FID and INP, and why did Google switch?
5. Explain error budgets to a product manager who wants to ship faster.
6. Why alert on burn rate instead of error-rate thresholds?
7. What goes into a blameless postmortem? How do you keep it blameless?
8. Lighthouse says 98 but RUM says LCP is poor. Why?
