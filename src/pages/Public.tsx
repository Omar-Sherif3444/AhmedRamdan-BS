import { useEffect, useState } from 'react'
import ShopFooter from '../components/ShopFooter'
import '../public.css'

/**
 * The public wait board: the page a customer opens on their own phone at the shop door.
 * Its entire job is "how many people are waiting, and roughly how long". No login, no booking,
 * no names, no photos, no 3D — see DESIGN.md "Public page" for the binding rules.
 *
 * Deliberately standalone: it must not import ./store, ./lib/api, three.js or any image, so the
 * route stays inside the hard budget (JS <= 10 KB gzip, first load <= 50 KB). For the same reason
 * the RPC is called with a bare fetch instead of @supabase/supabase-js (~40 KB gzip): same
 * PostgREST endpoint, same anon key, no client bundle.
 */

// i18n: move to i18n.ts when the public page gets a language toggle. Western digits only (DESIGN.md).
const L = {
  eyebrow: 'في الانتظار دلوقتي',
  moreThan: 'أكثر من',
  about: 'حوالي',
  minutes: 'دقيقة',
  noWait: 'مفيش انتظار — تعال دلوقتي',
  free: 'فاضي',
  normal: 'عادي',
  busy: 'زحمة',
  updated: 'آخر تحديث',
  stale: 'الرقم ده مش محدّث — بنحاول نوصل للمحل',
  unavailable: 'مش قادرين نعرف حالة الانتظار دلوقتي',
  trying: 'بنحاول تاني…',
  loading: 'بنجيب حالة الانتظار…',
  couch: 'كرسي الانتظار',
}

const BASE = String(import.meta.env.VITE_SUPABASE_URL ?? '')
const KEY = String(import.meta.env.VITE_SUPABASE_ANON_KEY ?? '')
const ENDPOINT = BASE && KEY ? `${BASE}/rest/v1/rpc/public_wait_status` : ''

/** Poll, never socket: a QR code at the door is a thundering herd, and this number moves every few minutes. */
const INTERVAL = 20_000
const JITTER = 3_000
const MAX_INTERVAL = 120_000
const REQUEST_TIMEOUT = 8_000
/** No successful fetch for this long and the number is labelled stale instead of being trusted. */
const STALE_AFTER = 90_000
/** Shown count is capped; the estimate still uses the real queue length. */
const CAP = 8

interface Status {
  waiting: number
  barbers: number
  minutesPer: number
  at: string
}

interface Band {
  low: number
  high: number
}

type Tone = 'free' | 'normal' | 'busy' | 'none'

const num = (v: unknown, fallback: number): number => {
  const n = typeof v === 'string' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) ? n : fallback
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

/** PostgREST returns a bare object for a scalar function and a one-row array for RETURNS TABLE. */
function parse(body: unknown): Status | null {
  const row = (Array.isArray(body) ? body[0] : body) as Record<string, unknown> | null
  if (!row || typeof row !== 'object' || row.waiting === undefined || row.waiting === null) return null
  return {
    waiting: Math.max(0, Math.round(num(row.waiting, 0))),
    barbers: Math.max(0, Math.round(num(row.barbers_active, 1))),
    minutesPer: clamp(num(row.minutes_per_customer, 20) || 20, 5, 120),
    at: typeof row.at === 'string' ? row.at : new Date().toISOString(),
  }
}

/**
 * An honest range, never a point and never a countdown: 5-minute steps, upper bound padded 18%
 * (posted waits that run long are the only ones people remember), minimum band width 10 minutes.
 */
function estimate(s: Status): Band | null {
  if (s.waiting <= 0) return null
  const raw = (s.waiting * s.minutesPer) / Math.max(1, s.barbers)
  const low = Math.max(5, Math.round(raw / 5) * 5)
  const padded = Math.ceil((raw * 1.18) / 5) * 5
  return { low, high: Math.max(padded, low + 10) }
}

const mid = (b: Band) => (b.low + b.high) / 2

/** Hysteresis: a band that twitches while you stare at it reads as a guess. Redraw on >1 min or >10%. */
function settle(prev: Band | null, next: Band | null): Band | null {
  if (!prev || !next) return next
  const move = Math.abs(mid(next) - mid(prev))
  return move > 1 || move > 0.1 * mid(prev) ? next : prev
}

function toneOf(waiting: number, band: Band | null): Tone {
  if (waiting <= 0) return 'free'
  return band && mid(band) >= 45 ? 'busy' : 'normal'
}

const WORD: Record<Tone, string> = { free: L.free, normal: L.normal, busy: L.busy, none: '' }

// ar-EG defaults to Arabic-Indic digits in ICU, so the numbering system is locked to latn.
const CLOCK = new Intl.DateTimeFormat('ar-EG-u-nu-latn', { hour: '2-digit', minute: '2-digit', hour12: false })

function clockOf(status: Status | null, fetchedAt: number | null): string {
  const t = status ? Date.parse(status.at) : NaN
  const ms = Number.isFinite(t) ? t : fetchedAt
  return ms === null ? '' : CLOCK.format(new Date(ms))
}

export default function Public() {
  const [status, setStatus] = useState<Status | null>(null)
  const [band, setBand] = useState<Band | null>(null)
  const [fetchedAt, setFetchedAt] = useState<number | null>(null)
  // False only until the first attempt settles, so the first paint never accuses the shop of being offline.
  const [tried, setTried] = useState(!ENDPOINT)
  const [now, setNow] = useState(() => Date.now())

  // One shared loop: poll with jitter, pause while hidden, back off on failure. No websocket here.
  useEffect(() => {
    if (!ENDPOINT) return
    let alive = true
    let timer: number | undefined
    let fails = 0
    let current: AbortController | null = null
    let etag = ''

    const nextDelay = () => {
      const base = fails >= 3 ? Math.min(MAX_INTERVAL, INTERVAL * 2 ** (fails - 2)) : INTERVAL
      return base + (Math.random() * 2 - 1) * JITTER
    }

    const load = async () => {
      const ac = new AbortController()
      current = ac
      const cutoff = window.setTimeout(() => ac.abort(), REQUEST_TIMEOUT)
      try {
        const res = await fetch(ENDPOINT, {
          method: 'POST',
          headers: {
            apikey: KEY,
            authorization: `Bearer ${KEY}`,
            'content-type': 'application/json',
            accept: 'application/json',
            ...(etag ? { 'if-none-match': etag } : {}),
          },
          body: '{}',
          signal: ac.signal,
        })
        if (!alive || current !== ac) return
        // 304 means nothing changed: the data we are showing is current, so only freshness moves.
        if (res.status === 304) {
          fails = 0
          setFetchedAt(Date.now())
          setNow(Date.now())
          return
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const row = parse((await res.json()) as unknown)
        if (!row) throw new Error('unexpected payload')
        if (!alive || current !== ac) return
        etag = res.headers.get('etag') ?? ''
        fails = 0
        setStatus(row)
        setBand((prev) => settle(prev, estimate(row)))
        setFetchedAt(Date.now())
        setNow(Date.now())
        setTried(true)
      } catch {
        // The RPC may not exist yet (404) or the shop's link may be down: show the stale/unavailable
        // state, keep the last good number on screen, and slow the loop down instead of hammering.
        if (!alive || current !== ac) return
        fails += 1
        setNow(Date.now())
        setTried(true)
      } finally {
        window.clearTimeout(cutoff)
        if (current === ac) current = null
      }
    }

    const schedule = () => {
      timer = window.setTimeout(tick, nextDelay())
    }

    async function tick() {
      timer = undefined
      if (!alive) return
      if (document.hidden) return // paused; visibilitychange resumes immediately
      await load()
      if (alive && !document.hidden) schedule()
    }

    const onVisible = () => {
      if (document.hidden || !alive) return
      setNow(Date.now())
      if (timer !== undefined) window.clearTimeout(timer)
      void tick()
    }

    void tick()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      alive = false
      if (timer !== undefined) window.clearTimeout(timer)
      current?.abort()
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  // Freshness has to decay without a fetch, otherwise a dead network looks like a quiet shop.
  useEffect(() => {
    const id = window.setInterval(() => {
      if (!document.hidden) setNow(Date.now())
    }, 5_000)
    return () => window.clearInterval(id)
  }, [])

  const stale = fetchedAt === null || now - fetchedAt > STALE_AFTER
  const unknown = status === null
  const waiting = status?.waiting ?? 0
  const shown = unknown ? '—' : String(Math.min(waiting, CAP))
  const capped = !unknown && waiting > CAP
  const tone: Tone = unknown ? 'none' : toneOf(waiting, band)
  const clock = clockOf(status, fetchedAt)
  // Cross-fade key: remounting the block runs the 150-200 ms fade. Digits never animate.
  const frame = `${shown}|${band ? `${band.low}-${band.high}` : '0'}|${tone}|${unknown ? (tried ? 'down' : 'wait') : 'ok'}`

  return (
    <>
    <main className={`pw pw-${tone}${stale && !unknown ? ' pw-is-stale' : ''}`} dir="rtl">
      <section className="pw-card">
        <p className="pw-eyebrow">{L.eyebrow}</p>

        <div className="pw-live" aria-live="polite" aria-atomic="true">
          <div className="pw-frame" key={frame}>
            <p className="pw-hero">
              {capped && <span className="pw-cap">{L.moreThan}</span>}
              <span className="pw-num">{shown}</span>
            </p>
            {/* Always rendered, so the first successful poll adds no layout shift. */}
            <p className="pw-state">
              {!unknown && (
                <>
                  <span className="pw-dot" aria-hidden="true" />
                  {WORD[tone]}
                </>
              )}
            </p>
            <p className="pw-line">
              {unknown ? (
                tried ? (
                  L.unavailable
                ) : (
                  L.loading
                )
              ) : band === null ? (
                L.noWait
              ) : (
                <>
                  {L.about}{' '}
                  <span className="pw-range" dir="ltr">
                    {band.low}–{band.high}
                  </span>{' '}
                  {L.minutes}
                </>
              )}
            </p>
          </div>
        </div>

        <Couch filled={unknown ? 0 : Math.min(waiting, CAP)} />

        <p className="pw-stamp">
          {clock ? (
            <>
              {L.updated}:{' '}
              <span className="pw-time" dir="ltr">
                {clock}
              </span>
            </>
          ) : (
            L.trying
          )}
        </p>
        {stale && !unknown && <p className="pw-warn">{L.stale}</p>}
      </section>
    </main>
    <ShopFooter />
    </>
  )
}

/**
 * The waiting metaphor, drawn in SVG so the public page costs zero images and zero three.js.
 * Symmetric on purpose: nothing to mirror under dir="rtl". Occupied seats are filled, empty seats
 * are outlined, so the state is never carried by colour alone.
 */
function Couch({ filled }: { filled: number }) {
  const seats = Array.from({ length: CAP }, (_, i) => 48 + i * 35)
  return (
    <svg className="pw-couch" viewBox="0 0 340 150" role="img" aria-label={L.couch} focusable="false">
      <rect className="pw-sofa" x="14" y="52" width="312" height="48" rx="16" />
      <rect className="pw-sofa" x="4" y="76" width="28" height="58" rx="13" />
      <rect className="pw-sofa" x="308" y="76" width="28" height="58" rx="13" />
      {/* People sit from the inline-start side, which is the right-hand side in RTL. */}
      {seats.map((x, i) => {
        const taken = CAP - i <= filled
        return (
          <g key={x} className={taken ? 'pw-seat pw-taken' : 'pw-seat'}>
            <circle cx={x} cy="44" r="11" />
            <path d={`M${x - 16} 98 L${x - 16} 72 a16 16 0 0 1 32 0 L${x + 16} 98 z`} />
          </g>
        )
      })}
      <rect className="pw-sofa" x="14" y="96" width="312" height="38" rx="13" />
      <rect className="pw-sofa" x="48" y="132" width="14" height="14" rx="4" />
      <rect className="pw-sofa" x="278" y="132" width="14" height="14" rx="4" />
    </svg>
  )
}
