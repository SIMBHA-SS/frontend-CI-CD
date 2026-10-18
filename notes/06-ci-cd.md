# Phase 6: CI/CD and Quality Gates

## A. The pipeline ([.github/workflows/ci.yml](../.github/workflows/ci.yml))

```
PR opened / pushed
  └─ quality job ────────────────────────────────────────────────┐
       npm ci → lint → typecheck → unit + axe tests → build → bundle budget → upload dist
  └─ lighthouse job (needs: quality) ─────────────────────────────┤
       download same dist → start API → Lighthouse ×3 runs per page → assert budgets
  └─ (Phase 7) deploy job on main: S3 sync + CloudFront + source maps + release markers
```

| Gate | Tool | Fails the PR when |
|---|---|---|
| Lint | oxlint | errors (warnings allowed) |
| Types | `tsc -b` | any type error |
| Unit tests | Vitest + Testing Library | behaviour broken; **virtualisation removed** (guard test) |
| Accessibility (component) | axe-core in jsdom | missing labels, heading order, names, ARIA misuse |
| Bundle budget | [check-bundle-size.mjs](../web/scripts/check-bundle-size.mjs) | first-load JS > 195KB gzip |
| Lab performance + a11y | Lighthouse CI ([lighthouserc.cjs](../web/lighthouserc.cjs)) | perf < 90, a11y < 95, LCP > 2.5s, TBT > 200ms, CLS > 0.1, contrast/label/heading regressions |

### Design choices to talk about
- **Build once, test that artifact.** Lighthouse downloads the exact `dist/` that was built and size-checked, not a rebuild. In CD, the *same* artifact gets promoted staging → prod.
- **`npm ci`**, not `npm install`: a reproducible install from the lockfile, which fails if the lockfile is out of sync.
- **Caching** (`setup-node` npm cache) for speed. **Concurrency** cancels stale runs on new pushes.
- **Least privilege:** `permissions: contents: read`. Deploy jobs get `id-token: write` for **OIDC** to AWS (no long-lived keys in GitHub secrets).
- **Median of 3 Lighthouse runs**: lab scores are noisy. Gate on metrics with margins.
- **Desktop preset:** our users are engineers on desktops. A consumer site gates on mobile.
- **Ratchet budgets:** set the budget slightly above today's number (181.8 → 195KB), then lower it as you optimise. Never let it creep up silently.
- `VITE_APP_VERSION = github.sha`: one release ID across RUM, Sentry and source maps.

## B. What the gates caught in this repo (real stories for the interview)
1. **Missing form label** on the Services filter (placeholder isn't a label). Caught by the `getByLabelText` test → fixed with an `sr-only` `<label>`.
2. **Heading order** h1 → h3 on the Chaos Lab. Caught by axe → card titles became h2.
3. **Colour contrast 4.18:1** on the banner (needs 4.5:1). jsdom can't compute colours; caught by **Lighthouse** in the real browser → fixed with theme tokens (~9:1).
4. **A race condition in my own performance instrumentation**: fast typing cleared a `performance.mark` before the deferred measure read it → uncaught exception. Caught by unit tests (Vitest flagged unhandled errors) → fixed by claiming the mark synchronously.
5. **Tests were sending real telemetry** (Vite loads `.env.local` in tests). Fixed by blanking SDK keys in `vitest.config.ts`.
6. Lab vs dev: **LCP 464ms on the production build vs 2144ms on the dev server.**

> "Automated a11y tools catch ~30–50% of WCAG issues. Unit-level axe catches structure (labels, roles, headings) fast; Lighthouse in a real browser catches rendering issues like contrast. Keyboard and screen-reader testing still need a human."

## C. Run it locally
```powershell
cd web
npm run lint; npm run typecheck; npm test
npm run build; npm run size
# Lighthouse (API must be running in another terminal: cd api; npm run dev)
npm run lhci
```

## D. Make it a real quality gate on GitHub
After the first push: **repo Settings → Branches → Add branch ruleset** for `main`:
- ✅ Require a pull request before merging (1 approval)
- ✅ **Require status checks to pass**: `Lint · Types · Tests · Build · Bundle budget` and `Lighthouse CI`
- ✅ Require branches to be up to date · ✅ Block force pushes

Without this, CI is only advice. With it, CI is a **gate**.

**Try it:** create a branch, break something (e.g. remove the `<label>` or set `JS_BUDGET_KB=100`), open a PR, and watch the check go red and the merge button lock.

## E. Progressive delivery (concepts the JD asks for)

| Strategy | How (frontend) | Rollback |
|---|---|---|
| **Atomic deploy** | Upload hashed assets first, swap `index.html` last | Re-upload the previous `index.html` (seconds) |
| **Canary** | CloudFront: weighted routing / continuous deployment policy sends 5% of traffic to the new version (staging distribution), or a cookie set at the edge | Shift weight to 0% |
| **Blue/green** | Two S3 prefixes (`/releases/<sha>/`); the edge points at one | Point back to the old prefix |
| **Feature flags** | Ship code dark; enable per user / tenant / % (LaunchDarkly, Unleash, ConfigCat, or your own) | Flip the flag, no deploy |

**Canary analysis with our observability:** RUM is tagged with `version`, so compare **canary vs stable** on error rate, p75 LCP / INP, and crash-free sessions (Sentry release health). Promote automatically if within thresholds for N minutes, roll back otherwise.
Datadog: `datadogRum.addFeatureFlagEvaluation('new-table', true)` attaches flag state to RUM events, so you can filter vitals and errors by flag variant.

**Why frontend rollback is special:** users keep old tabs open. Keep old hashed assets on the CDN for days (avoid `ChunkLoadError`), keep `index.html` `no-cache`, and make API changes backwards compatible (expand → migrate → contract).

## F. Interview Q&A

**Q: Design a CI/CD pipeline for a React app.**
"On PR: install from lockfile, lint, typecheck, unit and accessibility tests, build, bundle-size budget, then Lighthouse CI on the built artifact with performance and a11y budgets. All are required checks on protected main. On merge: build once with the git SHA as version, upload source maps to Sentry and Datadog, deploy hashed assets to S3 with long cache headers, then `index.html` with no-cache, invalidate only `index.html`, and mark the release. Canary 5% through the CDN, compare RUM metrics by version, then promote or roll back automatically."

**Q: Lighthouse is flaky in CI. What do you do?**
"Run 3–5 times and take the median. Assert on metrics with margins rather than exact scores. Use a dedicated, consistent runner. Use warn vs error levels. Track trends on an LHCI server instead of single runs. And never use lab data as the SLO: that's field RUM."

**Q: How do you stop performance regressions reaching production?**
"Three layers. CI budgets (bundle size, Lighthouse LCP/TBT/CLS) block the PR. A canary compares RUM vitals by version before full rollout. Production monitors on p75 vitals by version plus SLO burn-rate alerts catch what slipped through. Each layer is cheaper than the next."

**Q: Where do accessibility checks fit in the lifecycle?**
"Design-system components ship accessible by default (tested once, reused everywhere). axe in unit tests on every PR. Lighthouse a11y in CI. Manual keyboard and screen-reader passes for new flows. Accessibility bugs are tracked with the same severity model as other defects."
