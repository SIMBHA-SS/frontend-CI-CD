# Phase 4: Web Vitals and Custom Performance Instrumentation

## A. Try it (15 min)
`npm run dev` → a **Vitals HUD** is in the bottom-right corner (dev only). Click any metric to see its **attribution** (the *why*).

| Do this | Watch | Expected |
|---|---|---|
| Hard refresh `/` | LCP, FCP, TTFB | Green. Localhost is fast |
| Go to **Chaos Lab**, wait 2s | **CLS** | The late banner pushes content down. Click CLS → `element:` names the shifted node |
| Chaos → **Long task (bad INP)** | **INP** | Red ~800ms. Click INP → `processing: ~800` (the handler blocked) |
| **Services**, type fast in the filter | **INP** + console `[vital] services_filter_latency` | 100-300ms+. Our Phase 5 target |
| DevTools → Network **Slow 4G** + Performance **CPU 6×**, hard refresh | LCP breakdown | `ttfb` / `loadDuration` / `renderDelay`: which part grew? |
| DevTools → **Performance** → record while filtering | **Timings** track | `services_filter_latency` bars from `performance.measure` |

In Datadog: RUM Explorer → `@type:action @action.name:web_vital` (attribution per view) and `@type:vital @vital.name:services_filter_latency` (custom vital). Plot p75 on your dashboard.

## B. What we built

| File | What | Why |
|---|---|---|
| [webVitals.ts](../web/src/observability/webVitals.ts) | `web-vitals/attribution` for LCP, INP, CLS, FCP, TTFB. **Final** values go to telemetry, **every change** goes to the HUD | Datadog already has the scores; attribution explains *which element / phase / script* |
| [perf.ts](../web/src/observability/perf.ts) | `performance.mark` on keystroke → `measure` after the next paint → `obs.vital` | A **business-specific** latency metric: "filter feels instant" |
| `obs.vital` | `datadogRum.addDurationVital` | Custom vitals can have their own SLO and monitor |
| [VitalsHud.tsx](../web/src/VitalsHud.tsx) | `useSyncExternalStore` over a tiny store | Instant feedback while profiling (Phase 5 before/after) |

**Why `reportAllChanges` only for the HUD?** LCP can update several times while loading, CLS accumulates, and INP is the worst interaction so far. Telemetry should get the **final** value once (sent when the page is hidden, `visibilitychange`), or you'd double-count.

## C. The breakdowns you must be able to explain

### LCP = TTFB + resource load delay + resource load duration + element render delay
| Sub-part | Too big means | Fix |
|---|---|---|
| **TTFB** | Slow server / CDN miss / redirects | CDN caching, edge, fewer redirects |
| **Load delay** | The browser found the LCP image late | `<link rel=preload>`, `fetchpriority="high"`, don't lazy-load it, no JS-injected hero |
| **Load duration** | The resource is big | AVIF/WebP, responsive `srcset`, compression |
| **Render delay** | Resource ready but not painted: render-blocking JS/CSS, or a client-rendered SPA | Smaller bundles, code splitting, SSR, inline critical CSS |

> In our SPA, LCP is usually text rendered by JS, so **render delay** dominates. That's why bundle size (183KB gzip) directly hurts LCP.

### INP = input delay + processing duration + presentation delay
| Sub-part | Too big means | Fix |
|---|---|---|
| **Input delay** | Main thread busy when the user clicked (another long task) | Break up long tasks, `scheduler.yield()`, defer 3rd-party scripts |
| **Processing** | Event handlers + React render are slow | Memoize, virtualize, `useTransition` / `useDeferredValue`, less work per keystroke |
| **Presentation** | Huge DOM / layout / paint after the update | Smaller DOM (virtualization!), `content-visibility`, avoid layout thrashing |

`longestScript` (from the **Long Animation Frames API**, LoAF) names the actual function and file that ran during the interaction. That's the modern way to find INP culprits in the field.

### CLS
Sum of the *largest burst* (session window: shifts < 1s apart, max 5s) of unexpected layout shifts. Shifts within 500ms after user input don't count.
Fix: reserve space (`min-height`, `aspect-ratio`, width/height on images), use overlays for late content, `font-display` with size-adjusted fallbacks, animate `transform`, not `top/height`.

## D. Performance budgets
Write them down, enforce them in CI (Phase 6), and alert on them in prod (Phase 2 monitors).

| Budget | Value | Enforced by |
|---|---|---|
| LCP (lab, mobile throttled) | ≤ 2.5s | Lighthouse CI assertion |
| TBT (lab proxy for INP) | ≤ 200ms | Lighthouse CI |
| CLS | ≤ 0.1 | Lighthouse CI + RUM monitor |
| Initial JS (gzip) | ≤ 170KB → **we're at 188KB, over budget** | `size-limit` in CI |
| `services_filter_latency` p75 | ≤ 100ms | RUM custom vital monitor |
| Field p75 LCP / INP / CLS | 2.5s / 200ms / 0.1 | Datadog SLO + monitors |

## E. Interview Q&A

**Q: Datadog already measures Web Vitals. Why add the `web-vitals` library?**
"Attribution and portability. The library gives the LCP sub-parts, the INP phases and the LoAF script that caused the slowness, plus the same numbers in any tool or our own endpoint. Datadog also exposes target selectors, but the breakdown tells you *which team* owns the fix: CDN, bundle, or component."

**Q: INP is 450ms on the dashboard page. Walk me through it.**
"Check the RUM attribution: which element and which phase. High **input delay** means something else was hogging the main thread (polling, 3rd-party, hydration). High **processing** means our handler or the React render: profile it, memoize, defer non-urgent updates with `useTransition`, virtualize the list. High **presentation** means the DOM is too big or layout is expensive. Then verify with a custom vital for that interaction and a regression monitor."

**Q: Why is INP better than FID?**
"FID measured only the *input delay* of the *first* interaction. INP measures the *full* latency (delay + processing + paint) of nearly the worst interaction across the whole visit. For SPAs and dashboards, where users interact a lot after load, INP reflects real experience."

**Q: How would you measure something Web Vitals don't cover?**
"User Timing marks and measures around the interaction, ending after the next paint, sent as a custom RUM vital (`addDurationVital`) with context. It shows in DevTools' Timings track locally and gets p75 dashboards, an SLO and a monitor in prod. Example: our `services_filter_latency`."

**Q: Lab vs field for INP?**
"Lab tools can't measure INP without real interactions. Lighthouse uses **TBT** as a proxy. Field RUM is the source of truth. Use TBT budgets in CI to catch regressions early."
