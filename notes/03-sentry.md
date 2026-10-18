# Phase 3: Sentry Error Tracking

## A. Set up (about 10 min)
1. Sign up at **sentry.io** (free Developer plan) → **Create project** → platform **React** → alert frequency: *"Alert me on every new issue"* → name `depot-observability-ui`.
2. Copy the **DSN** (Project Settings → Client Keys). It looks like `https://abc123@o456.ingest.us.sentry.io/789`.
3. Paste it into `web/.env.local` → `VITE_SENTRY_DSN=...`
4. **Restart** `npm run dev` (Vite reads env files only at startup).
5. Chaos Lab → trigger **Render crash**, **Unhandled promise rejection**, **Failing API**, **Flaky API** (x3).
6. Sentry → **Issues**. You should see 4 issues.

### Readable stack traces (optional, 10 min)
Create an **auth token**: Settings → Auth Tokens → *Organization token*. Then:
```powershell
cd web
$env:SENTRY_AUTH_TOKEN="sntrys_..."; $env:SENTRY_ORG="<org-slug>"; $env:SENTRY_PROJECT="depot-observability-ui"
$env:VITE_APP_VERSION="1.0.1"
npm run build          # Sentry vite plugin creates release 1.0.1 + uploads maps
npm run preview        # trigger Render crash → Sentry shows Chaos.tsx:13
```
Auth token = **secret** (CI only). DSN = **public** (in the bundle, can only *send* events).

## B. What we built, and why

| Code | What | Interview angle |
|---|---|---|
| [sentry.ts](../web/src/observability/sentry.ts) | `Sentry.init` with `environment`, `release`, noise filters, URL scrubbing | `release` = same value as Datadog `version`. One release ID across all tools |
| **No tracing, no replay** in Sentry | Datadog owns performance and replay; Sentry owns errors | Two recorders means double bundle, CPU and cost. **One tool per job** |
| [index.ts](../web/src/observability/index.ts) `obs` facade | Components call `obs.error / action / timing`, never a vendor SDK | Swapping or adding a vendor (or OTel) touches one file |
| `obs.action` → Sentry **breadcrumb** | Sentry shows the user's steps before the error | Breadcrumbs = "what happened before it broke" |
| `scope.setFingerprint(['api-error', endpoint])` | **Custom grouping**: all `/api/flaky` failures = 1 issue | Default grouping splits by message/stack. Too many issues = noise, too few = hidden bugs |
| `setTag('feature' / 'endpoint')` | Searchable, filterable | Tags = indexed and low-cardinality. **Context** (`setContext`) = free-form detail |
| [main.tsx](../web/src/main.tsx) `onCaughtError` / `onUncaughtError` | React 19 root hooks → `Sentry.reactErrorHandler()` | The Datadog boundary reports caught errors to DD, `onCaughtError` sends them to Sentry. **One report per tool, no duplicates** |
| [vite.config.ts](../web/vite.config.ts) `sentryVitePlugin` | Creates the release + uploads source maps, **only when a token exists** | Maps are kept for the Datadog upload, which then deletes them |

## C. Sentry concepts you must know

| Concept | Meaning |
|---|---|
| **Event** | One occurrence of an error |
| **Issue** | Events grouped by **fingerprint** (stack trace + message by default). You triage issues, not events |
| **Release** | A version. Enables *first seen in*, *regressed in*, **suspect commits**, and readable stacks via source maps |
| **Resolve in next release** | Marks the issue fixed. If it happens again in a newer release, it reopens as a **regression** and alerts |
| **Release health** | **Crash-free sessions / users %** per release, from the default session tracking. A strong frontend SLI |
| **Environment** | `local / staging / prod`. Filter everything, and alert only on prod |
| **Breadcrumbs** | Automatic trail: clicks, navigation, console, fetch/XHR, plus our custom ones |
| **Ownership rules / CODEOWNERS** | Auto-assign issues by file path or URL to a team |
| **Inbound filters** | Server-side drop of browser-extension errors, legacy browsers, crawlers |
| **Spike protection / quotas / rate limits** | Cost control when a bug fires 1M events |
| **Tunnel** | Sentry's version of Datadog's `proxy`: route events via your own domain past ad blockers |

### Alert types
| Alert | Example | Route |
|---|---|---|
| **Issue alert** | *A new issue is created* in prod, or *an issue regresses*, or an issue is seen > 100 times in 1h | Slack `#frontend-alerts` |
| **Metric alert** | **Crash-free session rate < 99%** for the latest release, or error count > N in 5 min | Page (PagerDuty) |

**Hands-on (10 min):** Alerts → Create Alert:
1. *Issue alert*: "A new issue is created" + env = local → email you. Then click **Failing API** and see the email arrive.
2. *Metric alert*: "Crash-free session rate" below 99% → email.

### Triage workflow (what you do on-call)
1. **New or regressed issue alert** → open it.
2. Check **events, users affected, first seen release**, browsers, URL. Is this new in the latest deploy?
3. Read the stack trace (source-mapped) and the **breadcrumbs**, and look at the **suspect commit**.
4. Decide: **rollback** (big impact, new in this release) / **fix forward** / **assign** via ownership / **ignore** (benign, e.g. 3rd-party noise, with a reason).
5. After the fix: **Resolve in next release** → a regression alerts automatically if it comes back.

## D. Sentry vs Datadog: why both?

| | Sentry | Datadog RUM |
|---|---|---|
| Strength | **Developer-first error workflow**: grouping, assignment, regressions, suspect commits, Jira/GitHub links | **Performance and UX**: vitals, sessions, replay, RUM↔APM traces, SLOs, dashboards |
| Who lives in it | Feature developers | SRE / on-call / platform |
| Main frontend SLI | Crash-free sessions | Vitals SLOs, error-free sessions, API success |

**Avoiding duplicate alerts:** pick one owner per signal.
- **Sentry** alerts on *new / regressed issues* (sent to dev teams as tickets).
- **Datadog** pages on *SLO burn and error spikes* (sent to on-call).
- The same error never pages twice.

## E. Interview Q&A

**Q: Walk me through setting up Sentry for a React app.**
"`@sentry/react` init early with DSN, environment and release (the git SHA, the same as our Datadog version). React 19 root error hooks plus an error boundary per route. Source maps uploaded in CI through the bundler plugin and deleted before deploy. Noise filters and inbound filters. Then alert rules: new and regressed issues per team, plus a metric alert on crash-free sessions for the latest release."

**Q: Error boundaries: what do they catch, and what don't they?**
"They catch errors during render, lifecycle methods and constructors in their subtree. They **don't** catch event handlers, async code (promises, setTimeout), SSR errors, or errors in the boundary itself. Global `onerror` / `unhandledrejection` handlers in the SDK catch those. I place boundaries per route or widget, so one broken widget doesn't blank the whole dashboard."

**Q: You have 5,000 Sentry issues. Where do you start?**
"Sort by **users affected** and by the **latest release**, not by raw event count. Fix grouping (fingerprints) so duplicates merge. Filter noise with inbound filters, `ignoreErrors` and third-party URLs. Set ownership rules so issues reach the right team. Then make 'no new issues in prod' part of release health."

**Q: An error happens only in production and you can't reproduce it.**
"Use the Sentry issue: breadcrumbs for the steps, tags for browser / OS / release, the source-mapped stack. Then the Datadog RUM session replay for the same user (`usr.id`) and its linked backend trace. Usually it's a specific browser, a data shape, a race condition, or a stale chunk after a deploy (`ChunkLoadError`)."

**Q: What's `ChunkLoadError` and how do you prevent it?**
"After a deploy, old tabs request lazy chunks that no longer exist. Prevent it by keeping old assets on the CDN for a while (don't delete previous hashed files), using `no-cache` on index.html, and catching chunk errors to prompt a reload. It's a classic deploy-correlated frontend incident."
