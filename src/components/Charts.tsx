import { useEffect, useId, useRef, useState } from 'react'
import { useStore } from '../store'

export interface Point {
  label: string
  value: number
}

function niceMax(v: number) {
  if (v <= 0) return 1
  const mag = 10 ** Math.floor(Math.log10(v))
  return [1, 2, 2.5, 5, 10].map((m) => m * mag).find((m) => m >= v)!
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [w, setW] = useState(600)
  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width))
    ro.observe(ref.current!)
    return () => ro.disconnect()
  }, [])
  return [ref, w] as const
}

/** Area/line chart for trends. Mirrors along x in RTL so time reads in the page direction. */
export function AreaChart({ data, format, label, height = 220 }: { data: Point[]; format: (n: number) => string; label: string; height?: number }) {
  const { dir } = useStore().i18n
  const [ref, w] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const gid = useId()
  const pad = { t: 16, b: 26, s: 10 }
  const max = niceMax(Math.max(0, ...data.map((d) => d.value)))
  const n = data.length
  const x = (i: number) => {
    const p = pad.s + (n < 2 ? 0.5 : i / (n - 1)) * (w - 2 * pad.s)
    return dir === 'rtl' ? w - p : p
  }
  const y = (v: number) => pad.t + (1 - v / max) * (height - pad.t - pad.b)
  const line = data.map((d, i) => `${i ? 'L' : 'M'}${x(i)},${y(d.value)}`).join('')
  const area = n ? `${line}L${x(n - 1)},${y(0)}L${x(0)},${y(0)}Z` : ''
  const step = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(w / 80))))

  const onMove = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect()
    let f = (clientX - r.left - pad.s) / (w - 2 * pad.s)
    if (dir === 'rtl') f = 1 - f
    setHover(Math.min(n - 1, Math.max(0, Math.round(f * (n - 1)))))
  }

  return (
    <div className="chart" ref={ref} onPointerMove={(e) => onMove(e.clientX)} onPointerLeave={() => setHover(null)}>
      <svg width={w} height={height} role="img" aria-label={label}>
        <defs>
          <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" className="grad-top" />
            <stop offset="1" className="grad-bottom" />
          </linearGradient>
        </defs>
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line className="grid" x1={0} x2={w} y1={y(max * f)} y2={y(max * f)} />
            {f > 0 && (
              <text className="axis" x={dir === 'rtl' ? w - 2 : 2} y={y(max * f) - 4} textAnchor="start">
                {format(max * f)}
              </text>
            )}
          </g>
        ))}
        <path d={area} fill={`url(#${gid})`} />
        <path d={line} className="line" />
        {data.map((d, i) =>
          i % step === 0 ? (
            <text key={i} className="axis" x={x(i)} y={height - 6} textAnchor="middle">
              {d.label}
            </text>
          ) : null,
        )}
        {hover !== null && n > 0 && (
          <>
            <line className="cursor" x1={x(hover)} x2={x(hover)} y1={pad.t} y2={y(0)} />
            <circle className="dot" cx={x(hover)} cy={y(data[hover].value)} r={4} />
          </>
        )}
      </svg>
      {hover !== null && n > 0 && (
        <div className="tip" style={{ left: Math.min(Math.max(x(hover), 60), w - 60), top: 0 }}>
          <span className="muted">{data[hover].label}</span>
          <strong>{format(data[hover].value)}</strong>
        </div>
      )}
    </div>
  )
}

/** Vertical bars in HTML so flex order follows the page direction. */
export function Columns({ data, format, label, height = 200 }: { data: Point[]; format: (n: number) => string; label: string; height?: number }) {
  const max = niceMax(Math.max(0, ...data.map((d) => d.value)))
  const step = Math.max(1, Math.ceil(data.length / 12))
  return (
    <div className="columns" role="list" aria-label={label} style={{ height }}>
      {data.map((d, i) => (
        <div className="col" role="listitem" key={i} tabIndex={0} aria-label={`${d.label}: ${format(d.value)}`}>
          <div className="col-track">
            <div className="col-bar" style={{ height: `${(d.value / max) * 100}%` }} />
            <span className="col-tip" aria-hidden>
              {d.label}
              <strong>{format(d.value)}</strong>
            </span>
          </div>
          <span className="col-label" aria-hidden>
            {i % step === 0 ? d.label : ''}
          </span>
        </div>
      ))}
    </div>
  )
}

export function HBars({ data, format, label }: { data: Point[]; format: (n: number) => string; label: string }) {
  const max = Math.max(1, ...data.map((d) => d.value))
  return (
    <ul className="hbars" aria-label={label}>
      {data.map((d) => (
        <li key={d.label}>
          <div className="hbar-row">
            <span>{d.label}</span>
            <strong>{format(d.value)}</strong>
          </div>
          <div className="hbar-track" aria-hidden>
            <div className="hbar" style={{ width: `${(d.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  )
}
