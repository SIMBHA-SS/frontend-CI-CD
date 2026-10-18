import { useState, useSyncExternalStore } from 'react'
import { vitalsStore } from './observability/webVitals'

const ORDER = ['LCP', 'INP', 'CLS', 'FCP', 'TTFB'] as const
const UNIT: Record<string, string> = { LCP: 'ms', INP: 'ms', FCP: 'ms', TTFB: 'ms', CLS: '' }

/** Dev-only overlay: live Core Web Vitals with attribution on click. */
export default function VitalsHud() {
  const vitals = useSyncExternalStore(vitalsStore.subscribe, vitalsStore.get)
  const [open, setOpen] = useState<string | null>(null)
  const detail = open ? vitals[open]?.detail : null

  return (
    <div className="vitals-hud" aria-label="Web Vitals">
      {detail && (
        <pre className="vitals-detail">
          {Object.entries(detail)
            .filter(([, v]) => v !== undefined && v !== '')
            .map(([k, v]) => `${k}: ${v}`)
            .join('\n')}
        </pre>
      )}
      <div className="vitals-row">
        {ORDER.map((name) => {
          const v = vitals[name]
          return (
            <button
              key={name}
              className={`vital vital-${v?.rating ?? 'pending'}`}
              onClick={() => setOpen(open === name ? null : name)}
              title={v ? `${name} is ${v.rating}. Click for attribution` : `${name} not measured yet`}
            >
              <span className="vital-name">{name}</span>
              <span className="vital-value">{v ? `${v.value}${UNIT[name]}` : '…'}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
