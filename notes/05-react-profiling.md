# Phase 5: React Performance Profiling

**Method (say this in the interview):** *Measure → find the bottleneck with a profiler → fix one thing → measure again → guard against regression.* Never optimize on a hunch.

The buggy version is saved as the git tag `phase5-before`. To profile it:
```powershell
git stash; git checkout phase5-before     # buggy version
# ...profile...
git checkout main; git stash pop          # back to fixed version
```
(If you have no local changes, skip the stash commands. The branch may be `master` instead of `main`: check with `git branch`.)

## Your before/after table (fill it in yourself)
| Measurement | Tool | Before | After |
|---|---|---|---|
| Re-renders per second on Dashboard (idle) | Profiler | ~1/s, whole app | |
| `services_filter_latency` per keystroke | Console / Datadog | | |
| INP while typing in Services | Vitals HUD | | |
| DOM nodes on Services | Console: `document.querySelectorAll('*').length` | ~30,000+ | |
| CLS on Chaos Lab | Vitals HUD | ~0.098 | |
| Initial JS gzip | `npm run build` | 188 KB | ~188 KB |

## 1. Unnecessary re-renders: React DevTools Profiler
**Bug:** a `ClockProvider` context wrapped the whole app and ticked every second. Every `useClock()` consumer (Dashboard) re-rendered each second.

**Find it:**
1. React DevTools → ⚙ → **"Highlight updates when components render"**. Dashboard flashes every second.
2. ⚙ → Profiler → **"Record why each component rendered while profiling"**.
3. **Profiler** tab → ● record for 5s idle → stop.
   - **Flamegraph:** one commit per second, `Dashboard` + `Card`s inside it.
   - Click Dashboard → *"Why did this render? Context changed"*.
   - **Ranked** view: components sorted by render time.

**Fix (in [App.tsx](../web/src/App.tsx)):** **colocate state.** The `Clock` component owns its own `setInterval`, so a tick re-renders only that `<div>`. Dashboard's "viewed at" is computed once with `useState(() => new Date())`.

**The general rules for context:**
- Context value changes re-render **every consumer**, and `memo` doesn't stop it.
- Split contexts by update frequency (fast-changing values like a clock, mouse position or websocket ticks in their own context).
- Or use a store with selectors (`useSyncExternalStore`, Zustand, Redux) so components subscribe to slices.

## 2. Slow interaction (INP): Performance panel + Profiler
**Bug:** Services filtered and sorted 5,000 rows **on every render**, rendered **all 5,000 rows** (~30k DOM nodes), and every keystroke was an urgent update.

**Find it:**
1. Chrome DevTools → **Performance** → CPU **4× slowdown** → ● record → type "pay" → stop.
2. **Main** track: long tasks (red corner) after each keystroke. Expand: `filter`/`sort` + React `performWorkUntilDeadline` + a big **Layout/Paint**.
3. The **Timings** track shows our `services_filter_latency` measures.
4. React Profiler: each keystroke commit renders 5,000 `Row`s.

**Fixes (in [Services.tsx](../web/src/pages/Services.tsx)):**
| Fix | What it does | Which INP phase it cuts |
|---|---|---|
| `useMemo` sort once / filter on query | No recompute on unrelated renders | Processing |
| `useDeferredValue(query)` | Input updates urgently; the table renders at low priority and is **interruptible** while typing | Input delay + processing |
| **Virtualization** (`@tanstack/react-virtual`) | ~45 rows in the DOM instead of 5,000 | Processing + **presentation** (layout/paint) |
| `memo(Row)` | Rows with unchanged props skip render while scrolling | Processing |
| `opacity` while `isStale` | Visual hint that results are updating | UX |

**`useDeferredValue` vs `useTransition`:** `useTransition` wraps the **setter** you own (`startTransition(() => setFilter(x))`) and gives `isPending`. `useDeferredValue` wraps a **value** (useful when it comes from props or you can't change the setter). Both mark work as non-urgent. **Debounce** is different: it *delays* work, whereas these make work interruptible.

**When `useMemo` / `useCallback` are a waste:** cheap calculations, or values passed to non-memoized children. They have a cost (memory + comparison). Use them for expensive computations and for keeping props stable for `memo` children. The **React Compiler** (React 19) auto-memoizes. Note that oxlint warns `useVirtualizer` is "incompatible" with the Compiler: a real-world trade-off to know.

## 3. Layout shift (CLS)
**Bug:** the banner was inserted above the content 1.5s after load, pushing everything down.
**Fix (in [Chaos.tsx](../web/src/pages/Chaos.tsx) + CSS):** a **reserved slot** with a fixed height. The banner fills existing space. CLS → 0.
Other options: overlay/toast (out of flow), skeletons with the final size, `aspect-ratio` on media.

## 4. Memory leaks: heap snapshots
The Chaos Lab "Memory leak" button is deliberately left broken so you can practice.
1. DevTools → **Memory** → **Heap snapshot** → take snapshot 1.
2. Click **Memory leak** 5 times → take snapshot 2.
3. Select snapshot 2 → view **Comparison** → sort by **Size Delta**: `Array` +40MB, retained by `leaked` (module scope).
4. Also: **Performance monitor** (⋮ → More tools) → watch **JS heap size** and **JS event listeners** grow with each click.
5. Search the snapshot for **"Detached"** to find detached DOM nodes (removed from the page but still referenced).

**Classic React leaks and their fixes:**
| Leak | Fix |
|---|---|
| `setInterval` / `setTimeout` without cleanup | `return () => clearInterval(id)` in `useEffect` |
| `addEventListener` without remove (our bug) | Remove in cleanup with the **same function reference**, or use `AbortController` signal |
| Subscriptions (websocket, store, observer) | Unsubscribe / `disconnect()` in cleanup |
| `fetch` resolving after unmount | `AbortController` → `controller.abort()` in cleanup |
| Module-level caches that grow forever (our `leaked` array) | Bounded LRU, `WeakMap` |
| Closures holding big data (in refs or global listeners) | Null out refs, scope data narrowly |

`StrictMode` mounts → unmounts → mounts components in dev precisely to surface missing cleanups.

## 5. Bundle analysis
```powershell
cd web; npm run analyze      # opens nothing: open web/dist/stats.html in a browser
```
Treemap of what's in each chunk (Vite's equivalent of Webpack Bundle Analyzer).

**Our real numbers (per-module gzip share of the main bundle):**
| Share | What |
|---|---|
| ~37% | Datadog RUM SDK |
| ~25% | react-dom |
| ~17% | Sentry |
| ~12% | react-router |
| **~3%** | **our app code** |

**Lesson:** route-level `lazy()` moved Services (10.8KB) and Chaos out of the initial load but **didn't shrink first load**, because our own code isn't the problem. Measuring first prevents optimizing the wrong thing.

**What would actually cut the initial bundle:**
1. **Load observability SDKs asynchronously:** Datadog's async CDN snippet, Sentry's Loader Script / lazy `import('@sentry/react')` after first paint (buffer early errors). Trade-off: you might miss errors in the first ~100ms.
2. Session Replay is **already** a lazy chunk (`datadogRecorder`, 12KB), loaded only for sampled sessions.
3. Lighter router, or no router library on tiny apps.
4. Smaller deps: `date-fns` not `moment`, import `lodash-es/debounce` not `lodash`, check for **duplicate packages** in the treemap.
5. **Tree-shaking hygiene:** ESM imports, `sideEffects: false`, no barrel files that pull in everything.

**`lazyWithRetry`** ([lazyWithRetry.ts](../web/src/lazyWithRetry.ts)): after a deploy, old tabs request chunk files that no longer exist (`ChunkLoadError`). It reloads once to get the new `index.html`, then gives up (the error boundary shows the fallback). Combine it with keeping old assets on the CDN for a few days.

## 6. Interview Q&A

**Q: A page feels slow. How do you find out why?**
"First, field data: RUM INP/LCP attribution tells me *which interaction or element* and *which phase*. Then reproduce locally with CPU throttling. Performance panel for long tasks, layout and paint. React Profiler for which components render, how often and why. Fix the biggest cost first, re-measure, and add a custom vital plus a CI budget so it doesn't regress."

**Q: How do you prevent unnecessary re-renders?**
"Colocate state, split contexts by update frequency or use selector-based stores, keep props stable (memoize objects and callbacks passed to `memo` children), use `key` correctly, and move expensive children out via `children` props. But only after the Profiler shows re-renders actually cost something. Many re-renders are cheap."

**Q: Virtualization: when, and what are the gotchas?**
"Long lists or tables (hundreds of rows or more). Gotchas: in-page Ctrl+F doesn't find off-screen rows, accessibility (row counts for screen readers via `aria-rowcount`), variable row heights need measurement, scroll restoration, and sticky headers."

**Q: How do you find a memory leak in an SPA?**
"Reproduce the suspect flow repeatedly (navigate in and out of a page 10 times), take heap snapshots before and after, and compare by size delta and retainers. Watch the Performance Monitor for growing heap and listener counts, and look for detached DOM nodes. Usually it's a missing effect cleanup: an interval, a listener or a subscription."

**Q: Your bundle grew 40% in a release. What do you do?**
"Bundle analyzer diff between releases to find the new or duplicated dependency. Fix it with lazy loading, a lighter alternative or tree-shakable imports. Then add a size budget in CI (`size-limit`) that fails the PR, so it can't happen silently again."
