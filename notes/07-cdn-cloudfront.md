# Phase 7: CDN and Asset Delivery (S3 + CloudFront)

## Architecture
```
                    ┌──────────────── CloudFront (edge, global) ────────────────┐
Browser ──HTTPS──▶  │ /assets/*   → CachingOptimized (1 yr, immutable)   ─┐      │
                    │ /dd-proxy*  → CF Function rewrite → Datadog intake  │      │
                    │ /* (default)→ CF Function: /services → /index.html ─┤      │
                    │ + response headers: HSTS, CSP-RO, XFO, Server-Timing│      │
                    └─────────────────────────────────────────────────────┼──────┘
                                                         OAC (SigV4)      ▼
                                                   S3 bucket (private, versioned)
GitHub Actions ──OIDC──▶ IAM role (this repo + env only) ──▶ s3 sync + invalidation
```
Template: [infra/aws/frontend-stack.yml](../infra/aws/frontend-stack.yml) · Deploy: [.github/workflows/deploy.yml](../.github/workflows/deploy.yml)

## A. Create the stack (AWS Console, ~10 min)
1. Region selector (top right) → **Asia Pacific (Sydney) ap-southeast-2**. (The bucket lives here. CloudFront itself is global; its console URL always says us-east-1.)
2. **CloudFormation → Create stack → With new resources → Upload a template file** → `infra/aws/frontend-stack.yml` → Next.
3. Stack name: **`depot-ui`** (lowercase; the bucket name derives from it).
4. Parameters: keep the defaults. Set **CreateGitHubOidcProvider = false** only if *IAM → Identity providers* already lists `token.actions.githubusercontent.com`.
5. Next → Next → tick **"I acknowledge that AWS CloudFormation might create IAM resources"** → **Submit**.
6. Wait for **CREATE_COMPLETE** (CloudFront takes 3–8 min). Watch the **Events** tab: that's your infrastructure being built.
7. **Outputs** tab → keep it open for step B.

If it fails: Events tab → the first red `CREATE_FAILED` row has the reason. Send me a screenshot.

## B. Connect GitHub (~10 min)
Repo → **Settings → Secrets and variables → Actions**.

**Variables** tab (visible, not secret):

| Name | Value |
|---|---|
| `AWS_REGION` | `ap-southeast-2` |
| `AWS_DEPLOY_ROLE_ARN` | Output `DeployRoleArn` |
| `S3_BUCKET` | Output `BucketName` |
| `CLOUDFRONT_DISTRIBUTION_ID` | Output `DistributionId` |
| `CLOUDFRONT_DOMAIN` | Output `CloudFrontDomain` (no https://) |
| `VITE_DD_APPLICATION_ID` | from `web/.env.local` |
| `VITE_DD_CLIENT_TOKEN` | from `web/.env.local` (public token) |
| `VITE_SENTRY_DSN` | from `web/.env.local` (public) |
| `SENTRY_ORG` | `sourav-sw` |
| `SENTRY_PROJECT` | your Sentry project slug (e.g. `react-sentry`) |

**Secrets** tab (write-only, masked in logs):

| Name | Value |
|---|---|
| `DATADOG_API_KEY` | Datadog API key (source map upload) |
| `SENTRY_AUTH_TOKEN` | Sentry org auth token (source maps + release) |

Then **Actions → Deploy → Run workflow** (or merge any PR). The job summary shows the live URL.

## C. Verify like an SRE (~15 min)
```bash
D=https://dxxxx.cloudfront.net
curl -sI $D/                        # cache-control: no-cache · x-cache · strict-transport-security
curl -sI $D/services                # 200: SPA routing via CloudFront Function
curl -sI $D/assets/index-XXXX.js    # cache-control: public, max-age=31536000, immutable
curl -sI $D/assets/index-XXXX.js    # 2nd time: x-cache: Hit from cloudfront
curl -sI $D/assets/nope.js          # 403 (a real error, NOT index.html: missing assets stay visible)
```
In the browser (DevTools → Network):
- `Server-Timing` header → `cdn-cache-hit` / `cdn-cache-miss`, `cdn-pop`, `cdn-upstream-dns`… (also visible in RUM resource timings).
- `dd-proxy?ddforward=…` requests → **202**, with an ad blocker on.
- Console: **CSP Report-Only** warnings (if any) show what enforcing would break.

**Metrics:** CloudWatch (switch region to **us-east-1**, where CloudFront metrics live) → CloudFront → your distribution: **CacheHitRate**, **OriginLatency**, **4xxErrorRate/5xxErrorRate**, **BytesDownloaded**. Or in the console: CloudFront → distribution → **Monitoring** / **Reports → Cache statistics**.

**Origin offload** = % of requests (or bytes) served from the edge without touching S3 = roughly your cache hit ratio by bytes. Target: > 90% for a SPA (assets are immutable, so only `index.html` misses).

## D. Datadog Synthetics (~10 min): catches outages with zero traffic
Datadog → **Digital Experience → Synthetic Monitoring → New test → API test (HTTP)**:
- URL `https://<domain>/` · assert **status = 200**, **response time < 1000 ms**, header `content-type` contains `text/html`
- Locations: 3 regions (e.g. Sydney, Frankfurt, N. Virginia) · every 5 min
- Alert when **2 of 3 locations fail** (avoids paging on one flaky probe) → `@your-email`

Optional **Browser test**: record "open dashboard → see metric cards → go to Services → type 'pay'". This validates the *journey*, not just the HTML. Synthetics results also make a clean **availability SLO** (by monitor uptime).

## E. Clean up after the interview
1. S3 → bucket → **Empty** (it's versioned: the Empty button deletes all versions).
2. CloudFormation → `depot-ui` → **Delete** (CloudFront disable + delete takes ~5 min).

## F. Caching strategy: be able to explain every line
| Path | Cache-Control | Edge policy | Why |
|---|---|---|---|
| `/assets/*` (hashed: `index-CVLq7TfK.js`) | `public, max-age=31536000, immutable` | CachingOptimized | Content-hash filenames: a new deploy = new URLs, so cache forever. `immutable` skips revalidation even on reload |
| `/index.html` + app routes | `no-cache` | TTL 0 | Must always revalidate so users get the newest asset references. `no-cache` ≠ `no-store`: the browser *may* store it but must check (ETag → cheap 304) |
| `favicon` etc. | `max-age=3600` | default | Not hashed → short TTL |
| `/dd-proxy*` | n/a | CachingDisabled, forward query + headers | It's an API proxy, never cached |

**Cache key hygiene:** the HTML policy has no cookies, headers or query strings in the key, so `/?utm_source=x` doesn't fragment the cache. Each extra key dimension lowers the hit ratio.

**Invalidation workflow:** only `/index.html`. Hashed assets never need invalidation. Avoid `/*` invalidations: slower, costly at scale, and they hammer the origin with cache misses. The first 1,000 paths/month are free.

**Deploy ordering (zero-downtime):** assets → other files → `index.html` last. Never `--delete` old assets immediately: open tabs still reference them (`ChunkLoadError`). A lifecycle rule or periodic cleanup removes assets older than N releases.

**Rollback:** re-run an older successful Deploy workflow (rebuilds that commit), or restore the previous `index.html` version from S3 versioning + invalidate (seconds, since old assets are still there).

## G. Security notes
- **Private bucket + OAC** (SigV4 signed requests, replaced the legacy OAI). Bucket policy allows only *this* distribution's ARN. Website hosting endpoint is not used (it can't be private and has no HTTPS).
- **HSTS, X-Content-Type-Options, X-Frame-Options DENY, Referrer-Policy, Permissions-Policy** via a response headers policy (no Lambda needed).
- **CSP in Report-Only** first → fix violations → switch to enforcing `Content-Security-Policy`. Breaking a site with a CSP is a classic self-inflicted incident.
- **OIDC deploy role:** no AWS keys in GitHub. Trust is limited by `aud` and **`sub = repo:SIMBHA-SS/frontend-CI-CD:environment:production`**. Gotcha: with `environment:` in the job, the `sub` claim is the environment, not the branch. Least-privilege policy: one bucket, one distribution.

## H. CloudFront Functions vs Lambda@Edge
| | CloudFront Functions | Lambda@Edge |
|---|---|---|
| Runs at | 400+ edge locations | Regional edge caches |
| Triggers | Viewer request/response | Viewer + **origin** request/response |
| Limits | ~1 ms, no network, no body access | Up to 5–30 s, network calls, body access |
| Cost | ~1/6 of Lambda@Edge | Higher |
| Use for | Rewrites (SPA routing), redirects, header tweaks, simple auth tokens, A/B cookie bucketing | Auth with external calls, image resizing, SSR, origin selection logic |

We use Functions for SPA routing and the RUM proxy rewrite: tiny, synchronous, and cheap.

## I. Azure CDN / Front Door equivalents (the JD mentions Azure)
| AWS | Azure |
|---|---|
| CloudFront | **Azure Front Door** (Standard/Premium; classic Azure CDN is being retired) |
| S3 + OAC | Blob Storage (static website) + Private Link origin |
| Cache policies / behaviours | Rules engine + caching rules / route config |
| CloudFront Functions | Rules engine actions (rewrites, headers) |
| Invalidation | **Purge** |
| Response headers policy | Rule set: modify response header |

## J. Interview Q&A
**Q: Design the caching strategy for a React SPA on a CDN.**
"Hashed assets: one-year immutable cache. The HTML shell: no-cache so it always revalidates. Minimal cache keys so the hit ratio stays high. Brotli/gzip at the edge. Deploy assets first and HTML last, invalidate only the HTML, keep old assets so open tabs don't break. Then monitor cache hit ratio, origin latency and 5xx rate, plus RUM TTFB by geography."

**Q: Users in one region report slowness. Is it the CDN?**
"RUM TTFB and LCP broken down by `@geo.country` versus other regions, plus the `Server-Timing` `cdn-pop` and cache hit/miss on resources. Then CloudWatch per-distribution metrics and AWS Health for that edge. If it's misses, check cache-key fragmentation or a recent invalidation. If origin latency, check S3 or the origin. Mitigate with a synthetic test from that region to confirm and to track the fix."

**Q: After a deploy some users see a blank page. Why?**
"Classic causes: `index.html` cached with old asset references (wrong Cache-Control or no invalidation), or new `index.html` pointing to assets that weren't uploaded yet (wrong deploy order), or old assets deleted while tabs were still open (`ChunkLoadError`). Detect it with a Sentry/RUM error spike by version. Fix with the deploy ordering, `no-cache` HTML, keeping old assets, and `lazyWithRetry`."

**Q: Why OIDC instead of AWS access keys in GitHub secrets?**
"No long-lived credentials to leak or rotate. Tokens are short-lived (an hour) and scoped by trust conditions to one repo and environment. The role has least-privilege permissions. If GitHub were compromised, there's no static key to steal."

**Q: Cache hit ratio dropped from 95% to 60%. What happened?**
"Usually a cache-key change (a new query string or header in the key, such as tracking params or cookies), a `/*` invalidation, a Cache-Control change at the origin (e.g. a build stopped setting max-age), or a traffic shift to uncached paths (an API or bots). Check what changed in the distribution config and the deploy, and the top URLs by misses in the CloudFront reports."
