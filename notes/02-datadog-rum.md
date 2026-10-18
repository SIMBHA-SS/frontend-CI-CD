# Phase 2: Datadog RUM

## A. Run it

### 1. Frontend RUM (needs only the RUM app)
```powershell
cd web
Copy-Item .env.example .env.local    # fill in Application ID, Client Token, Site
npm run dev                          # http://localhost:5173
```
In another terminal: `cd api; npm run dev`.

Click around for 5 minutes: switch pages, type in the Services filter, and trigger every Chaos Lab card.
Then open Datadog → **Digital Experience → Sessions & Replays** (data appears in about 1–2 min).

### 2. Backend APM + RUM↔trace correlation
Get an **API key** (Organization Settings → API Keys; this is *not* the client token).
```powershell
$env:DD_API_KEY="<api key>"; $env:DD_SITE="datadoghq.com"
docker compose up -d                 # from project root; Agent listens on :8126
cd api; npm run dev:traced           # dd-trace instruments express
```
Trigger "Slow API (4 s)". In RUM, open that session → the `/api/slow` resource → **Traces** tab. You'll see the backend span for the same request. This is the "full-stack root-cause analysis" the JD asks for.

### 3. Source maps (readable stack traces)
Error stack traces from a prod build are minified (`index-F8KM.js:1:48213`) until maps are uploaded.
```powershell
cd web
$env:VITE_APP_VERSION="1.0.0"; npm run build
$env:DATADOG_API_KEY="<api key>"; $env:DATADOG_SITE="datadoghq.com"
npx datadog-ci sourcemaps upload ./dist --service=depot-observability-ui --release-version=1.0.0 --minified-path-prefix=/
npm run preview                      # http://localhost:4173, trigger Render crash
```
**service + version + path prefix must match** what the SDK reports, or Datadog can't pair them.
`build.sourcemap: 'hidden'` in [vite.config.ts](../web/vite.config.ts) writes `.map` files without a `//# sourceMappingURL` comment, so users never download them. In CI (Phase 6) we delete them from `dist/` after upload.

## B. What we instrumented, and why (be able to explain every line)

| Code | Purpose | Interview angle |
|---|---|---|
| [datadog.ts](../web/src/observability/datadog.ts) `init` at top of [main.tsx](../web/src/main.tsx) | Start before anything can fail | Errors before init are lost. The CDN async snippet loads earlier but adds a dependency |
| `service` / `env` / `version` | Unified service tagging | `version` = deploy SHA → compare vitals/errors per release, catch canary regressions |
| `sessionSampleRate` / `sessionReplaySampleRate` | Cost control | Billing is per session. Typical: 100% of sessions for errors/vitals on small apps, 10–30% on big ones, replay at 5–20% |
| `trackUserInteractions` | Clicks become actions; needed for INP/frustration signals | Rage clicks, dead clicks, error clicks |
| `trackResources`, `trackLongTasks` | Network waterfall + main-thread blocking | Long task = > 50 ms. This is how you explain bad INP |
| `defaultPrivacyLevel: 'mask-user-input'` | Replay never captures typed text | GDPR/PII. Options: `allow`, `mask-user-input`, `mask`. Add `data-dd-privacy="mask"` per element |
| `allowedTracingUrls` + `propagatorTypes` | Adds `x-datadog-*` and W3C `traceparent` headers to our API calls | Backend must allow these headers in **CORS** (`Access-Control-Allow-Headers`) when cross-origin. Never add third-party URLs (leaks headers, breaks CORS) |
| `beforeSend` | Scrub PII from URLs, drop noisy errors | Filter in the client = less cost + less noise. `ResizeObserver loop` is the classic benign error |
| `setUser`, `setGlobalContextProperty` | "Which users/tenants are affected?" | Blast-radius questions during incidents |
| `reactPlugin({ router: true })` + Datadog `Routes` | One RUM **view** per route, named by pattern | Without it, SPA views are named by raw URL (`/services/42`), giving high cardinality and useless aggregates |
| `ErrorBoundary` (in [App.tsx](../web/src/App.tsx)) | Catches render errors, reports them, shows a fallback | Page-level boundary keeps nav alive. `key={pathname}` resets on navigation |
| `onUncaughtError` in `createRoot` | React 19 hook for errors that escape all boundaries | Don't also use `onCaughtError` with the DD boundary, or you get duplicate errors |
| `rum.error(...)` in Dashboard | Report *handled* errors | A caught `fetch` failure is invisible to RUM unless you call `addError` |
| `rum.timing('dashboard_metrics_visible')` | Custom "time to useful data" | LCP may fire on a skeleton, so this is a better SLI for data UIs |
| `rum.action('services_filter', …)` | Custom business events | Funnels, feature usage, and attaching context to slow interactions |

**What can't be caught by error boundaries:** event handlers, async code (promises, `setTimeout`), SSR, and errors in the boundary itself. RUM's global `onerror`/`unhandledrejection` hooks catch those. Try "Unhandled promise rejection" in the Chaos Lab.

## C. Build these in Datadog (hands-on, about 30 min)

### 1. Explore
- **RUM → Performance Summary**: Core Web Vitals p75 per view. Check LCP/INP/CLS for `/chaos` (the banner causes CLS).
- **Sessions & Replays**: watch a replay of a Chaos session.
- **Error Tracking**: errors grouped into issues. Check that the render crash shows the component stack.
- **RUM Explorer**: query `@type:action @action.name:services_filter` and `@type:long_task`.

### 2. Create SLOs (Service Mgmt → SLOs → New SLO)
**SLO 1: Page load performance (metric-based)**
First create a RUM metric: *Digital Experience → Settings → Generate Metrics* → count of views, group by `@view.name`, filter `@view.largest_contentful_paint:<2500000000` (nanoseconds!) for good loads, plus one metric for all views.
SLO = good / total, target **95%**, window **30 days**.

**SLO 2: Error-free sessions**
Good = sessions with `@session.error.count:0`. Target **99%**.

**SLO 3: API success from the browser**
Good = `@type:resource @resource.type:fetch -@resource.status_code:>=500`, total = all fetch resources. Target **99.5%**. Spam "Flaky API" and watch it burn.

### 3. Monitors (Monitors → New → Real User Monitoring)
- **Burn-rate alert** on SLO 3: `burn_rate > 14.4` over 1h with a 5m short window → page. `> 6` over 6h → page. Use the SLO page's "New Alert" button.
- **RUM monitor on CWV regression**: p75 `@view.largest_contentful_paint` > 2.5s for `@view.name:/` over 15 min, grouped by `version`.
- **Error spike**: count of `@type:error` > N in 5 min. Include a runbook link and `@slack-…` or email in the message.

### 4. Dashboard
Clone the default RUM dashboard. Add SLO widgets, vitals by `version`, top errors, and slowest resources.

## D. Interview Q&A

**Q: How would you set up RUM for a React app from scratch?**
Install `@datadog/browser-rum` + `browser-rum-react`. Init first with service/env/version. Router integration for view names. Error boundary + `onUncaughtError`. Source maps uploaded in CI per version. Sampling and privacy decided with the business. Trace propagation to our own APIs only. Then SLOs and burn-rate monitors on top.

**Q: A user says "the dashboard is slow" but you can't reproduce it. What do you do?**
Find their session in RUM (`@usr.id`). Watch the replay. Check view LCP/INP, the resource waterfall (slow API? big asset? CDN miss?), and long tasks. Click a slow fetch → linked APM trace → backend span or DB query. Check device/browser/geo and compare with p75 for that segment.

**Q: How do you correlate frontend and backend?**
`allowedTracingUrls` makes the SDK inject trace context headers (Datadog + W3C `traceparent`). The backend tracer continues the trace, so the browser resource and backend spans share a trace ID. Requires CORS to allow the headers. The trace sample rate decides which requests carry it.

**Q: RUM cost is too high. What levers do you have?**
Session sample rate, replay sample rate (replay is the expensive part), retention filters, dropping events in `beforeSend`, `trackResources` scope, excluding bots/synthetics, and environment filtering (don't send `local`).

**Q: Why tag with `version`?**
To compare error rate and vitals between releases, detect canary regressions, map source maps, and give a fast rollback decision ("errors started exactly with v1.4.2").

**Q: What are frustration signals?**
Rage clicks (repeated clicks in one spot), dead clicks (click with no effect), and error clicks (click followed by a JS error). Good leading indicators of UX bugs before users report them.

**Q: RUM vs Synthetics?**
RUM = real users, passive, field data, catches long-tail devices. Synthetics = scripted browser tests from fixed locations on a schedule. It catches outages **with zero traffic** (e.g. at 3am, or a broken login before users arrive), and its data is stable enough for availability SLOs. Use both.
