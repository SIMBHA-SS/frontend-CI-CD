# Runbook: LCP SLO burn-rate alert

**Alert:** `[PAGE] LCP SLO burning 14.4x over 1h` (also the 6x/6h page and 1x/3d ticket)
**SLO:** 95% of initial page loads have LCP < 2.5s over 30 days
**Owner:** frontend-reliability · **Escalation:** frontend on-call → frontend lead → platform on-call

## 1. What this alert means
Initial page loads are slow often enough that, at this rate:
| Tier | 30-day budget gone in | Urgency |
|---|---|---|
| 14.4× / 1h | ~2 days | Page. Act now |
| 6× / 6h | ~5 days | Page. Act within the hour |
| 1× / 3d | 30 days | Ticket. Fix this sprint |

At a 95% target, 14.4× means about **72% of loads are slow**. This is a real outage-level regression, not noise.

## 2. First 5 minutes: confirm and size
1. **Acknowledge** the page so the escalation stops.
2. Open the SLO → check that the SLI is actually dropping (not a metric gap).
3. RUM → Performance Summary → **p75 LCP by `version`**, **by `@view.name`**, **by `@geo.country`**, **by `@device.type`**.
4. Declare severity:
   - All users / all pages → **SEV2**, open an incident channel
   - One region, one page or one browser → **SEV3**

## 3. Triage: find the cause
Work down the list. Most common causes come first.

| Check | Where | If yes → |
|---|---|---|
| **Did a deploy just happen?** Does LCP jump line up with a new `version`? | RUM grouped by version · CI/CD history | **Roll back first, debug later** (step 4) |
| **TTFB high?** (`@view.first_byte` > 800ms) | RUM view waterfall | CDN or origin problem. Check CloudFront cache hit ratio, 5xx, origin latency |
| **CDN cache hit ratio dropped?** | CloudWatch / Datadog AWS integration | Bad cache policy, or an invalidation storm. Revert the CDN config |
| **One big resource slow?** (hero image, main JS chunk) | RUM resource waterfall, sorted by duration | Asset size regression. Check the bundle analyzer diff for the release |
| **Blocked by a third-party script?** | Resources filtered by third-party domains | Disable it with a feature flag or tag manager |
| **API on the critical path slow?** | RUM resource → **Traces tab** → backend span | Hand over to the backend on-call with the trace link |
| **Only one geo / ISP?** | RUM by country | CDN PoP issue. Check AWS Health / CloudFront status |

## 4. Mitigate
- **Rollback:** redeploy the previous artifact. Because `index.html` is `no-cache` and assets are hashed, it takes effect for users within seconds. Invalidate `/index.html` on CloudFront only if needed.
- **Feature flag:** turn off the new feature or experiment if one was involved.
- **CDN:** revert the cache policy or behavior change. Avoid `/*` invalidations unless necessary, because they hammer the origin.
- Post updates in the incident channel every 15–30 minutes. Update the status page for SEV2+.

## 5. Verify recovery
- The short window (5 min) clears first. Wait for the **long window to clear** before closing.
- p75 LCP by version back to baseline. Check the error budget remaining.

## 6. After
- SEV2+ or more than 10% of budget burned → **blameless postmortem within 5 working days** (template: [postmortem-template.md](postmortem-template.md)).
- Add a regression guard: a Lighthouse CI budget, a bundle-size limit, or a new monitor.
- Error budget below 25% → follow the error budget policy (slow down risky releases).

## Useful queries
```
RUM: @type:view @view.loading_type:initial_load service:depot-observability-ui env:prod
     → group by version, @view.name; measure pc75(@view.largest_contentful_paint)
RUM: @type:resource @resource.duration:>1000000000 @view.loading_type:initial_load
```
