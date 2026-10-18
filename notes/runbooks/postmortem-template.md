# Postmortem: <title>

> **Blameless:** we look at how the *system* (process, tooling, guardrails) allowed this, never at who made a mistake. People acted reasonably given what they knew.

| | |
|---|---|
| **Date** | YYYY-MM-DD |
| **Severity** | SEV2 |
| **Duration** | detected HH:MM → mitigated HH:MM → resolved HH:MM (UTC) |
| **Authors** | |
| **Status** | Draft / In review / Final |

## Summary
Two or three sentences: what broke, who was affected, how it was fixed.

## Impact
- Users affected: N sessions (~X% of traffic), regions/browsers
- SLOs: LCP SLO dropped from 97.8% to 93.1%; **Y% of the 30-day error budget burned**
- Business/customer impact, support tickets

## Timeline (UTC)
| Time | Event |
|---|---|
| 14:02 | v1.42.0 deployed |
| 14:09 | Burn-rate alert (14.4×) paged on-call (**MTTD 7 min**) |
| 14:12 | Acknowledged, RUM shows regression only on v1.42.0 |
| 14:15 | Rollback started |
| 14:18 | p75 LCP back to baseline (**MTTR 16 min**) |

## Root cause and contributing factors
Use **5 Whys**. Usually there is no single root cause:
1. Why was LCP slow? The hero chart's JS chunk grew from 80KB to 640KB.
2. Why? A full charting library was imported instead of a tree-shaken module.
3. Why wasn't it caught? There's no bundle-size budget in CI.
4. ...

## What went well / badly / where we got lucky
- ✅ The burn-rate alert fired in 7 min, and `version` tagging pointed straight at the release
- ❌ No CI guard for bundle size
- 🍀 Happened during business hours

## Action items
| Action | Type | Owner | Due | Ticket |
|---|---|---|---|---|
| Add `size-limit` budget for the main chunk in CI | Prevent | | | |
| Lighthouse CI LCP assertion on PRs | Detect | | | |
| Document the rollback command in the runbook | Mitigate | | | |
