import { lazy, type ComponentType } from 'react'

const KEY = 'chunk-reload-attempted'

/**
 * React.lazy + recovery from ChunkLoadError. After a deploy, a tab still
 * running the old index.html asks for chunk files that no longer exist on the
 * CDN. Reload once to pick up the new index.html; if it still fails, let the
 * error boundary show the fallback (and report it).
 */
export function lazyWithRetry<T extends ComponentType<object>>(load: () => Promise<{ default: T }>) {
  return lazy(() =>
    load()
      .then((mod) => {
        try { sessionStorage.removeItem(KEY) } catch { /* storage blocked */ }
        return mod
      })
      .catch((err) => {
        let attempted = true
        try {
          attempted = sessionStorage.getItem(KEY) === '1'
          if (!attempted) sessionStorage.setItem(KEY, '1')
        } catch { /* storage blocked: don't risk a reload loop */ }
        if (!attempted) {
          window.location.reload()
          return new Promise<never>(() => {}) // keep Suspense pending until reload
        }
        throw err
      }),
  )
}
