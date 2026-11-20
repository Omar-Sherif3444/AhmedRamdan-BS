import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Clock, Minus, Plus, Scissors, Undo2, User, X } from 'lucide-react'
import { useStore } from '../store'
import type { Visit } from '../types'
import '../operator.css'

/** Mis-tap guard: a commit is ignored inside this window after the in-progress list reflows. */
const REFLOW_MS = 200
/** One commit per this window; the control is disabled meanwhile. */
const LOCK_MS = 600
/** Undo stays this long, per DESIGN.md. */
const UNDO_MS = 8000

/**
 * Feedback order: the visual state change has already been dispatched when this runs, the haptic is
 * the second channel (next frame), and there is no third — a salon is too loud for audio to matter.
 */
function buzz(pattern: number | number[] = 12) {
  requestAnimationFrame(() => {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(pattern)
  })
}

/** Minute ticker for elapsed times; one timer for the whole screen. */
function useNow(ms = 30000) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(id)
  }, [ms])
  return now
}

const elapsed = (from: string, now: number) => Math.max(0, Math.round((now - Date.parse(from)) / 60000))

/**
 * The whole front-desk product: one screen, no modal, no navigation.
 * Entry row (top) → in-progress cards (middle) → waiting counter (bottom third on a phone,
 * side rail on a tablet). Target for a walk-in: 3 taps, 0 keystrokes.
 */
export default function Operator() {
  const { state, dispatch, i18n, status } = useStore()
  const { t } = i18n
  const now = useNow()

  // Western digits everywhere (DESIGN.md): ar-EG defaults to Arabic-Indic, so the numbering system is pinned.
  const money = useMemo(
    () => new Intl.NumberFormat('ar-EG-u-nu-latn', { style: 'currency', currency: state.settings.currency, maximumFractionDigits: 0 }),
    [state.settings.currency],
  )

  const services = useMemo(() => state.services.filter((s) => s.active), [state.services])
  const barbers = useMemo(() => state.employees.filter((e) => e.active && e.role === 'barber'), [state.employees])
  const live = useMemo(() => state.visits.filter((v) => v.status === 'in_progress').sort((a, b) => a.startedAt.localeCompare(b.startedAt)), [state.visits])

  // Chairs the next customer can sit in; the first one is used unless the operator cycles the pill.
  const freeSeats = useMemo(
    () => state.seats.filter((s) => s.kind === 'chair' && (s.status === 'available' || s.status === 'reserved')).sort((a, b) => a.number - b.number),
    [state.seats],
  )

  const [typed, setTyped] = useState('')
  const [picked, setPicked] = useState<string[]>([])
  const [who, setWho] = useState('')
  const [seatPick, setSeatPick] = useState('')

  // Derived, never synced by an effect: a stale pick silently falls back to a valid one.
  const seat = freeSeats.find((s) => s.id === seatPick) ?? freeSeats.at(0)
  const barberId = barbers.some((e) => e.id === who) ? who : barbers.length === 1 ? barbers[0].id : ''
  const total = picked.reduce((sum, id) => sum + (services.find((s) => s.id === id)?.price ?? 0), 0)

  // The name the customer gets for free when nobody types one.
  const autoName = useMemo(() => {
    const taken = new Set(state.customers.map((c) => c.name.trim()))
    let n = state.customers.length + 1
    while (taken.has(t('op.auto', { n }))) n += 1
    return t('op.auto', { n })
  }, [state.customers, t])

  const [lock, setLock] = useState(false)
  useEffect(() => {
    if (!lock) return
    const id = setTimeout(() => setLock(false), LOCK_MS)
    return () => clearTimeout(id)
  }, [lock])

  // A row that shifts under a thumb must not swallow the tap into the wrong customer.
  const rowKey = live.map((v) => v.id).join(',')
  const reflowAt = useRef(0)
  const [settling, setSettling] = useState(false)
  useEffect(() => {
    reflowAt.current = Date.now()
    setSettling(true)
    const id = setTimeout(() => setSettling(false), REFLOW_MS)
    return () => clearTimeout(id)
  }, [rowKey])
  const steady = () => Date.now() - reflowAt.current >= REFLOW_MS

  // Cards already told to finish: disabled until the server-backed reload drops them from the list.
  const [ending, setEnding] = useState<string[]>([])
  useEffect(() => {
    const ids = rowKey ? rowKey.split(',') : []
    setEnding((p) => (p.length ? p.filter((id) => ids.includes(id)) : p))
  }, [rowKey])

  // The snackbar carries the inverse of whatever it announces, so Undo always undoes that action.
  const [note, setNote] = useState<{ n: number; text: string; undo: () => void } | null>(null)
  const seq = useRef(0)
  useEffect(() => {
    if (!note) return
    const id = setTimeout(() => setNote(null), UNDO_MS)
    return () => clearTimeout(id)
  }, [note])
  const flash = (text: string, undo: () => void) => setNote({ n: (seq.current += 1), text, undo })

  const nameOf = (v: Visit) => state.customers.find((c) => c.id === v.customerId)?.name.trim() || t('op.guest')

  const ready = !!seat && picked.length > 0 && !!barberId
  const commit = () => {
    if (lock || !ready || !seat || !steady()) return
    const name = typed.trim() || autoName
    setLock(true)
    setTyped('')
    setPicked([])
    setWho('')
    setSeatPick('')
    const seatId = seat.id
    dispatch({ type: 'register', seatId, name, serviceIds: picked, employeeId: barberId, method: 'cash', now: new Date().toISOString() })
    // Undo of a start cancels that visit and frees the chair.
    flash(t('op.started', { name }), () => dispatch({ type: 'release', seatId, now: new Date().toISOString() }))
    buzz(12)
  }

  // No confirmation dialog: fire now, offer Undo for 8 s.
  const finish = (v: Visit) => {
    if (!steady() || ending.includes(v.id)) return
    const name = nameOf(v)
    setEnding((p) => [...p, v.id])
    dispatch({ type: 'complete', seatId: v.seatId, now: new Date().toISOString() })
    flash(t('op.finished', { name }), () => dispatch({ type: 'reopen', visitId: v.id }))
    buzz(16)
  }

  const bump = (delta: 1 | -1) => {
    if (delta === -1 && state.waiting <= 0) return
    dispatch({ type: 'waitingBump', delta })
    flash(t(delta === 1 ? 'op.bumpedUp' : 'op.bumpedDown', { n: state.waiting + delta }), () => dispatch({ type: 'undoLast' }))
    buzz(delta === 1 ? 10 : [8, 36, 8])
  }

  const undo = () => {
    if (!note) return
    setNote(null)
    note.undo()
    buzz(20)
  }

  const toggleService = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))
  const cycleSeat = () => {
    if (!seat || freeSeats.length < 2) return
    const i = freeSeats.findIndex((s) => s.id === seat.id)
    setSeatPick(freeSeats[(i + 1) % freeSeats.length].id)
  }

  return (
    <div className="op">
      <section className="op-entry" aria-label={t('op.entry')}>
        <div className="op-entry-head">
          <h2 className="op-h">{t('op.entry')}</h2>
          {seat ? (
            <button type="button" className="op-seat" onClick={cycleSeat} aria-label={freeSeats.length > 1 ? t('op.swapSeat') : t('op.seat')}>
              <span className="op-seat-k">{t('op.seat')}</span>
              <span className="op-seat-v">{i18n.seatName(seat)}</span>
            </button>
          ) : (
            <span className="op-seat op-seat-off">{t('op.noSeat')}</span>
          )}
        </div>

        <label className="op-name">
          <span className="op-k">
            {t('op.name')} <span className="op-muted">({t('op.optional')})</span>
          </span>
          <input
            className="op-input"
            dir="auto"
            value={typed}
            placeholder={autoName}
            autoComplete="off"
            enterKeyHint="done"
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && commit()}
          />
        </label>

        <div className="op-group" role="group" aria-label={t('op.services')}>
          <span className="op-k">
            <Scissors size={15} aria-hidden /> {t('op.services')}
          </span>
          <div className="op-chips">
            {services.map((s) => (
              <button key={s.id} type="button" className="op-chip" aria-pressed={picked.includes(s.id)} onClick={() => toggleService(s.id)}>
                <span className="op-chip-t">{i18n.serviceName(s)}</span>
                <span className="op-chip-s">{money.format(s.price)}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="op-group" role="group" aria-label={t('op.barber')}>
          <span className="op-k">
            <User size={15} aria-hidden /> {t('op.barber')}
          </span>
          <div className="op-chips">
            {barbers.map((e) => (
              <button key={e.id} type="button" className="op-chip" aria-pressed={barberId === e.id} onClick={() => setWho(barberId === e.id ? '' : e.id)}>
                <span className="op-chip-t">{e.name}</span>
              </button>
            ))}
            {!barbers.length && <p className="op-muted">{t('op.noBarbers')}</p>}
          </div>
        </div>
      </section>

      <section className={settling ? 'op-live settling' : 'op-live'} aria-label={t('op.live')}>
        <h2 className="op-h">
          {t('op.live')} <span className="op-count">{live.length}</span>
        </h2>
        {live.map((v) => (
          <LiveCard key={v.id} visit={v} name={nameOf(v)} minutes={elapsed(v.startedAt, now)} money={money} busy={ending.includes(v.id)} onDone={() => finish(v)} />
        ))}
        {!live.length && <p className="op-empty">{status === 'loading' ? t('c.loading') : t('op.noneLive')}</p>}
      </section>

      <div className="op-dock">
        <button type="button" className="op-start" onClick={commit} disabled={!ready || lock} aria-describedby="op-hint">
          <Check size={22} aria-hidden />
          <span>{t('op.start')}</span>
          {total > 0 && <span className="op-start-sum">{money.format(total)}</span>}
        </button>
        <p className="op-hint" id="op-hint">
          {!seat ? t('op.noSeat') : !picked.length ? t('op.pickService') : !barberId ? t('op.pickBarber') : `${typed.trim() || autoName} · ${seat ? i18n.seatName(seat) : ''}`}
        </p>

        <div className="op-counter" role="group" aria-label={t('op.waiting')}>
          <Couch />
          <button type="button" className="op-big" onClick={() => bump(1)} aria-label={t('op.walkIn')}>
            <Plus size={40} aria-hidden strokeWidth={3} />
          </button>
          <p className="op-wait">
            <span className="op-wait-n" aria-live="polite">
              {state.waiting}
            </span>
            <span className="op-wait-k">{t('op.waiting')}</span>
          </p>
          <button type="button" className="op-big" onClick={() => bump(-1)} disabled={state.waiting <= 0} aria-label={t('op.seated')}>
            <Minus size={40} aria-hidden strokeWidth={3} />
          </button>
        </div>
      </div>

      <div className="op-snack-wrap" role="status" aria-live="polite">
        {note && (
          <div className="op-snack" key={note.n}>
            <span>{note.text}</span>
            <button type="button" className="op-undo" onClick={undo}>
              <Undo2 size={18} aria-hidden /> {t('op.undo')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

/** One in-progress visit: 64 px row, one Done tap, and a tappable amount for a correction. */
function LiveCard({
  visit,
  name,
  minutes,
  money,
  busy,
  onDone,
}: {
  visit: Visit
  name: string
  minutes: number
  money: Intl.NumberFormat
  busy: boolean
  onDone: () => void
}) {
  const { state, dispatch, toast, i18n } = useStore()
  const { t } = i18n
  const [edit, setEdit] = useState(false)
  const [amount, setAmount] = useState('')

  const barber = state.employees.find((e) => e.id === visit.employeeId)?.name
  const what = visit.serviceIds.map((id: string) => i18n.serviceName(state.services.find((s) => s.id === id))).join(' + ')

  const open = () => {
    setAmount(String(visit.amount))
    setEdit(true)
  }
  const save = () => {
    const value = Number(amount)
    if (!(value > 0)) return toast(t('op.badAmount'))
    setEdit(false)
    dispatch({ type: 'updatePayment', visitId: visit.id, amount: value, method: visit.method })
    buzz(10)
  }

  return (
    <article className={busy ? 'op-card busy' : 'op-card'}>
      <div className="op-card-main">
        <strong className="op-card-name" dir="auto">
          {name}
        </strong>
        <span className="op-card-sub">
          {what}
          {barber && ` · ${barber}`}
        </span>
      </div>
      <span className="op-card-min">
        <Clock size={14} aria-hidden /> {i18n.minutes(minutes)}
      </span>
      {edit ? (
        <span className="op-pay">
          <input
            className="op-input op-pay-in"
            dir="ltr"
            inputMode="decimal"
            autoFocus
            value={amount}
            aria-label={t('op.editAmount')}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))}
            onKeyDown={(e) => e.key === 'Enter' && save()}
          />
          <button type="button" className="op-icon" onClick={save} aria-label={t('c.save')}>
            <Check size={18} aria-hidden />
          </button>
          <button type="button" className="op-icon" onClick={() => setEdit(false)} aria-label={t('c.cancel')}>
            <X size={18} aria-hidden />
          </button>
        </span>
      ) : (
        <button type="button" className="op-amount" onClick={open} aria-label={t('op.editAmount')}>
          {money.format(visit.amount)}
        </button>
      )}
      <button type="button" className="op-done" onClick={onDone} disabled={busy}>
        <Check size={20} aria-hidden /> {t('op.done')}
      </button>
    </article>
  )
}

/** The waiting metaphor, in SVG — the public page and this screen must never load three.js. */
function Couch() {
  return (
    <svg className="op-couch" viewBox="0 0 320 160" preserveAspectRatio="xMidYMid meet" aria-hidden focusable="false">
      {/* Symmetric on purpose: nothing here needs an RTL mirror. */}
      <g fill="currentColor" fillOpacity="0.18" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round">
        <rect x="46" y="20" width="228" height="74" rx="20" />
        <rect x="12" y="56" width="36" height="76" rx="17" />
        <rect x="272" y="56" width="36" height="76" rx="17" />
        <rect x="34" y="84" width="252" height="48" rx="16" />
      </g>
      <g stroke="currentColor" strokeWidth="2" strokeOpacity="0.5" strokeLinecap="round">
        <path d="M122 28v62M198 28v62M160 90v38" />
        <path d="M30 132v16M290 132v16" />
      </g>
    </svg>
  )
}
