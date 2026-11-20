import { lazy, Suspense, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Armchair, Bookmark, CircleCheck, Clock, Sofa, User, Wrench } from 'lucide-react'
import { useStore } from '../store'
import { Field, Modal, SeatBadge } from '../components/ui'
import type { Key } from '../i18n'
import { PAY_METHODS, type PaymentMethod, type Seat, type SeatStatus, type Visit } from '../types'

// Lazy so three.js never blocks the 2D floor below it.
const Floor3D = lazy(() => import('../components/Three3D').then((m) => ({ default: m.Floor3D })))

const STATUS_ICON = { available: CircleCheck, occupied: User, reserved: Bookmark, out_of_service: Wrench }
const STATUSES: SeatStatus[] = ['available', 'occupied', 'reserved', 'out_of_service']

export function useNow(ms = 30000) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(id)
  }, [ms])
  return now
}

/** readOnly: the public view. Customers see seat status only, never other customers' details. */
export default function Floor({ readOnly = false }: { readOnly?: boolean }) {
  const { state, i18n } = useStore()
  const { t } = i18n
  const [selected, setSelected] = useState<string | null>(null)
  const now = useNow()
  const seat = state.seats.find((s) => s.id === selected)
  const group = (kind: Seat['kind']) => state.seats.filter((s) => s.kind === kind)

  return (
    <div className="stack">
      <section className="card floor-3d" aria-label={t('d.floor3d')}>
        <p className="muted small">{t(readOnly ? 'pub.drag' : 'floor.drag3d')}</p>
        <Suspense fallback={null}>
          <Floor3D height={320} onSelect={setSelected} />
        </Suspense>
      </section>
      <div className="floor-summary" aria-live="polite">
        {STATUSES.map((st) => {
          const Icon = STATUS_ICON[st]
          return (
            <div key={st} className={`sum s-${st}`}>
              <Icon size={18} aria-hidden />
              <span className="sum-n">{i18n.num(state.seats.filter((s) => s.status === st).length)}</span>
              <span>{t(`seat.${st}`)}</span>
            </div>
          )
        })}
      </div>
      <p className="muted">{t(readOnly ? 'pub.hint' : 'floor.hint')}</p>

      <section className="floor-zone" aria-labelledby="zone-sofa">
        <h2 id="zone-sofa" className="zone-title">
          <Sofa size={18} aria-hidden /> {t('seat.sofa')} <span className="muted small">· {t('floor.wait')}</span>
        </h2>
        {readOnly && !state.customerId && (
          <p className="muted small">
            <a className="link" href="#/login">
              {t('pub.reserveHint')}
            </a>
          </p>
        )}
        <div className="sofa">
          {group('sofa').map((s) => (
            <SeatTile key={s.id} seat={s} now={now} onOpen={readOnly ? undefined : () => setSelected(s.id)}>
              {readOnly && state.customerId && <SofaReservation seat={s} customerId={state.customerId} />}
            </SeatTile>
          ))}
        </div>
      </section>

      <section className="floor-zone" aria-labelledby="zone-chairs">
        <h2 id="zone-chairs" className="zone-title">
          <Armchair size={18} aria-hidden /> {t('seat.chairs')} <span className="muted small">· {t('floor.stations')}</span>
        </h2>
        <div className="chairs">
          {group('chair').map((s) => (
            <SeatTile key={s.id} seat={s} now={now} onOpen={readOnly ? undefined : () => setSelected(s.id)} />
          ))}
        </div>
      </section>

      <Modal open={!!seat} onClose={() => setSelected(null)} title={seat ? i18n.seatName(seat) : ''}>
        {seat && (readOnly ? <PublicSeatPanel seat={seat} /> : <SeatPanel key={seat.id + seat.status} seat={seat} now={now} onDone={() => setSelected(null)} />)}
      </Modal>
    </div>
  )
}

/** A customer tapped a seat in 3D: ask them to sign in first, or let them reserve it. */
function PublicSeatPanel({ seat }: { seat: Seat }) {
  const { state, i18n } = useStore()
  const { t } = i18n
  if (!state.customerId)
    return (
      <div className="stack">
        <p className="confirm" role="alert">
          {t('pub.loginFirst')}
        </p>
        <div className="actions">
          <a className="btn primary" href="#/login">
            {t('auth.signIn')}
          </a>
        </div>
      </div>
    )
  return (
    <div className="stack">
      <p>
        <SeatBadge status={seat.status} />
        {seat.status === 'reserved' && seat.reservedName && seat.reservedBy !== state.customerId && ` ${t('pub.reservedFor', { name: seat.reservedName })}`}
      </p>
      {seat.kind === 'chair' ? (
        <p className="muted">{t('pub.chairInfo')}</p>
      ) : seat.status === 'available' && state.seats.some((x) => x.reservedBy === state.customerId) ? (
        <p className="muted">{t('err.alreadyReserved')}</p>
      ) : (
        <SofaReservation seat={seat} customerId={state.customerId} />
      )}
    </div>
  )
}

/** A signed-in customer reserves one free sofa seat, or cancels their own reservation. */
function SofaReservation({ seat, customerId }: { seat: Seat; customerId: string }) {
  const { state, dispatch, toast, i18n } = useStore()
  const { t } = i18n
  if (seat.reservedBy === customerId)
    return (
      <span className="seat-action">
        <strong className="mine">
          {t('pub.yours')}
          {seat.reservedUntil && ` · ${t('pub.until', { time: i18n.time(seat.reservedUntil) })}`}
        </strong>
        <button className="btn sm" onClick={() => dispatch({ type: 'customerCancel', seatId: seat.id, customerId })}>
          {t('pub.cancelMine')}
        </button>
      </span>
    )
  if (seat.status !== 'available' || state.seats.some((x) => x.reservedBy === customerId)) return null
  return (
    <span className="seat-action">
      <button
        className="btn primary sm"
        onClick={() => {
          dispatch({ type: 'customerReserve', seatId: seat.id, customerId })
          toast(t('pub.reservedOk'))
        }}
      >
        <Bookmark size={14} aria-hidden /> {t('pub.reserve')}
      </button>
    </span>
  )
}

function SeatTile({ seat, now, onOpen, children }: { seat: Seat; now: number; onOpen?: () => void; children?: ReactNode }) {
  const { state, i18n } = useStore()
  const { t } = i18n
  const visit = state.visits.find((v) => v.id === seat.visitId)
  const customer = visit && state.customers.find((c) => c.id === visit.customerId)
  const employee = visit && state.employees.find((e) => e.id === visit.employeeId)
  const Kind = seat.kind === 'sofa' ? Sofa : Armchair
  const StatusIcon = STATUS_ICON[seat.status]
  const label = `${i18n.seatName(seat)}, ${t(`seat.${seat.status}`)}${customer && onOpen ? `, ${customer.name}` : ''}`
  const Tag = onOpen ? 'button' : 'div'
  return (
    <Tag className={`seat s-${seat.status}${onOpen ? '' : ' static'}`} onClick={onOpen} aria-label={onOpen ? label : undefined}>
      <span className="seat-top">
        <Kind size={22} aria-hidden />
        <span className="seat-name">{i18n.seatName(seat)}</span>
      </span>
      <span className="seat-status">
        <StatusIcon size={15} aria-hidden /> {t(`seat.${seat.status}`)}
      </span>
      {visit && customer ? (
        <span className="seat-info">
          {onOpen && <strong>{customer.name}</strong>}
          {onOpen && <span className="muted small">{employee?.name}</span>}
          <span className="muted small">
            <Clock size={12} aria-hidden /> {t('c.minutes', { n: Math.max(0, Math.round((now - Date.parse(visit.startedAt)) / 60000)) })}
            {visit.expectNext && (
              <>
                {' · '}
                <Bookmark size={12} aria-hidden /> {t('seat.reserved')}
              </>
            )}
          </span>
        </span>
      ) : (
        <span className="seat-info muted small">
          {seat.status === 'occupied' && seat.since
            ? `${t('floor.occupiedText')} · ${t('c.minutes', { n: Math.max(0, Math.round((now - Date.parse(seat.since)) / 60000)) })}`
            : seat.reservedBy
              ? `${t('pub.reservedFor', { name: (onOpen && state.customers.find((c) => c.id === seat.reservedBy)?.name) || seat.reservedName || '' })}${seat.reservedUntil ? ` · ${t('pub.until', { time: i18n.time(seat.reservedUntil) })}` : ''}`
              : t(
                seat.status === 'reserved' ? 'floor.reservedText' : seat.status === 'out_of_service' ? 'floor.oosText' : seat.status === 'occupied' ? 'floor.occupiedText' : 'floor.availableText',
              )}
        </span>
      )}
      {children}
    </Tag>
  )
}

function SeatPanel({ seat, now, onDone }: { seat: Seat; now: number; onDone: () => void }) {
  const { dispatch, toast, i18n } = useStore()
  const { t } = i18n
  const [registering, setRegistering] = useState(seat.status === 'available')
  const act = (type: 'reserve' | 'cancelReservation' | 'outOfService' | 'restore', msg: Key) => {
    dispatch({ type, seatId: seat.id })
    toast(`${i18n.seatName(seat)}: ${t(msg)}`)
    onDone()
  }

  if (seat.status === 'occupied') return <OccupiedPanel seat={seat} now={now} onDone={onDone} />
  if (registering) return <RegisterForm seat={seat} onDone={onDone} onReserve={seat.status === 'available' ? () => act('reserve', 'seat.reserved') : undefined} onOutOfService={() => act('outOfService', 'seat.out_of_service')} />

  return (
    <div className="stack">
      <p>
        <SeatBadge status={seat.status} />
      </p>
      <p>{t(seat.status === 'reserved' ? 'floor.reservedText' : 'floor.oosText')}</p>
      <div className="actions">
        {seat.status === 'reserved' ? (
          <>
            <button className="btn primary" onClick={() => setRegistering(true)}>
              {t('floor.registerHere')}
            </button>
            <button className="btn" onClick={() => act('cancelReservation', 'seat.available')}>
              {t('floor.cancelReservation')}
            </button>
            <button className="btn ghost" onClick={() => act('outOfService', 'seat.out_of_service')}>
              {t('floor.outOfService')}
            </button>
          </>
        ) : (
          <button className="btn primary" onClick={() => act('restore', 'seat.available')}>
            {t('floor.restore')}
          </button>
        )}
      </div>
    </div>
  )
}

const PHONE = /^\+?[\d\s-]{7,15}$/

function RegisterForm({ seat, onDone, onReserve, onOutOfService }: { seat: Seat; onDone: () => void; onReserve?: () => void; onOutOfService: () => void }) {
  const { state, dispatch, toast, i18n } = useStore()
  const { t } = i18n
  const me = state.employees.find((e) => e.id === state.currentUserId)
  const staff = state.employees.filter((e) => e.active && e.role !== 'receptionist')
  const services = state.services.filter((s) => s.active)
  const [f, setF] = useState({
    name: '',
    phone: '',
    serviceId: '',
    amount: '',
    // A receptionist registers on behalf of a barber, so nobody is preselected for them.
    employeeId: me && me.role !== 'receptionist' ? me.id : '',
    // Required choice: Cash or Wallet.
    method: '' as PaymentMethod | '',
    expectNext: false,
  })
  const [errors, setErrors] = useState<Partial<Record<keyof typeof f, string>>>({})
  const formRef = useRef<HTMLFormElement>(null)
  const set = (patch: Partial<typeof f>) => {
    setF((x) => ({ ...x, ...patch }))
    setErrors((e) => Object.fromEntries(Object.entries(e).filter(([k]) => !(k in patch))))
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const amount = Number(f.amount)
    const errs: typeof errors = {}
    if (f.name.trim().length < 2) errs.name = t('err.name')
    if (!f.amount.trim()) errs.amount = t('err.amount')
    else if (!(amount > 0)) errs.amount = t('err.amountInvalid')
    if (f.phone.trim() && !PHONE.test(f.phone.trim())) errs.phone = t('err.phone')
    if (!f.employeeId) errs.employeeId = t('err.employee')
    if (!f.method) errs.method = t('err.method')
    setErrors(errs)
    if (Object.keys(errs).length || !f.method) {
      requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus())
      return
    }
    dispatch({ type: 'register', seatId: seat.id, ...f, method: f.method, amount, now: new Date().toISOString() })
    toast(t('n.registered', { customer: f.name.trim(), seat: i18n.seatName(seat) }))
    onDone()
  }

  return (
    <form ref={formRef} onSubmit={submit} noValidate className="form">
      <p className="muted small">{t('floor.register')}</p>
      <Field label={t('floor.customerName')} error={errors.name}>
        <input
          value={f.name}
          list="customer-names"
          autoComplete="off"
          autoFocus
          onChange={(e) => {
            const name = e.target.value
            const known = state.customers.find((c) => c.name === name)
            set({ name, phone: known && !f.phone ? known.phone : f.phone })
          }}
        />
      </Field>
      <datalist id="customer-names">
        {state.customers.map((c) => (
          <option key={c.id} value={c.name} />
        ))}
      </datalist>
      <div className="grid-2">
        <Field label={t('floor.service')} optional>
          <select
            value={f.serviceId}
            onChange={(e) => {
              const s = services.find((x) => x.id === e.target.value)
              set({ serviceId: e.target.value, amount: s ? String(s.price) : f.amount })
            }}
          >
            <option value="">{t('floor.noService')}</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {i18n.serviceName(s)} · {i18n.money(s.price)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('floor.amount')} error={errors.amount}>
          <input inputMode="decimal" value={f.amount} onChange={(e) => set({ amount: e.target.value.replace(/[^\d.]/g, '') })} />
        </Field>
        <Field label={t('c.phone')} optional error={errors.phone}>
          <input type="tel" dir="ltr" value={f.phone} onChange={(e) => set({ phone: e.target.value })} />
        </Field>
        <Field label={t('floor.method')} error={errors.method}>
          <select value={f.method} onChange={(e) => set({ method: e.target.value as PaymentMethod })}>
            <option value="">—</option>
            {PAY_METHODS.map((m) => (
              <option key={m} value={m}>
                {t(`pm.${m}`)}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label={t('floor.employee')} error={errors.employeeId}>
        <select value={f.employeeId} onChange={(e) => set({ employeeId: e.target.value })}>
          <option value="">—</option>
          {staff.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name} · {t(`role.${e.role}`)}
            </option>
          ))}
        </select>
      </Field>
      <label className="check">
        <input type="checkbox" checked={f.expectNext} onChange={(e) => set({ expectNext: e.target.checked })} />
        <span>
          {t('floor.expectNext')}
          <span className="muted small block">{t('floor.expectNextHint')}</span>
        </span>
      </label>
      <div className="actions">
        <button type="submit" className="btn primary">
          {t('floor.start')}
        </button>
        {onReserve && (
          <button type="button" className="btn" onClick={onReserve}>
            {t('floor.reserve')}
          </button>
        )}
        <button type="button" className="btn ghost" onClick={onOutOfService}>
          {t('floor.outOfService')}
        </button>
      </div>
    </form>
  )
}

function OccupiedPanel({ seat, now, onDone }: { seat: Seat; now: number; onDone: () => void }) {
  const { state } = useStore()
  const visit = state.visits.find((v) => v.id === seat.visitId)
  // Another employee's customer: the visit is private to them and the owner, so only the shared floor status shows.
  if (!visit) return <PrivateOccupiedPanel seat={seat} now={now} onDone={onDone} />
  return <OwnOccupiedPanel seat={seat} visit={visit} now={now} onDone={onDone} />
}

function PrivateOccupiedPanel({ seat, now, onDone }: { seat: Seat; now: number; onDone: () => void }) {
  const { dispatch, toast, i18n } = useStore()
  const { t } = i18n
  return (
    <div className="stack">
      <p>
        <SeatBadge status={seat.status} />
        {seat.since && ` · ${t('c.minutes', { n: Math.max(0, Math.round((now - Date.parse(seat.since)) / 60000)) })}`}
      </p>
      <p className="muted">{t('floor.otherEmployee')}</p>
      <div className="actions">
        <button
          className="btn primary"
          onClick={() => {
            dispatch({ type: 'complete', seatId: seat.id, now: new Date().toISOString() })
            toast(t('n.completed', { seat: i18n.seatName(seat) }))
            onDone()
          }}
        >
          <CircleCheck size={16} aria-hidden /> {t('floor.complete')}
        </button>
      </div>
    </div>
  )
}

function OwnOccupiedPanel({ seat, visit, now, onDone }: { seat: Seat; visit: Visit; now: number; onDone: () => void }) {
  const { state, dispatch, toast, i18n } = useStore()
  const { t } = i18n
  const customer = state.customers.find((c) => c.id === visit.customerId)
  const employee = state.employees.find((e) => e.id === visit.employeeId)
  const [confirmRelease, setConfirmRelease] = useState(false)
  const [pay, setPay] = useState({ amount: String(visit.amount), method: visit.method })
  const [payError, setPayError] = useState('')
  const name = i18n.seatName(seat)

  const end = (type: 'complete' | 'release') => {
    dispatch({ type, seatId: seat.id, now: new Date().toISOString() })
    toast(t(type === 'complete' ? 'n.completed' : 'n.released', { seat: name }))
    onDone()
  }
  const savePayment = () => {
    const amount = Number(pay.amount)
    if (!(amount > 0)) return setPayError(t('err.amountInvalid'))
    setPayError('')
    dispatch({ type: 'updatePayment', visitId: visit.id, amount, method: pay.method })
    toast(t('floor.paymentUpdated'))
  }
  const payChanged = Number(pay.amount) !== visit.amount || pay.method !== visit.method

  return (
    <div className="stack">
      <dl className="details">
        <div>
          <dt>{t('tx.customer')}</dt>
          <dd>{customer?.name}</dd>
        </div>
        <div>
          <dt>{t('c.phone')}</dt>
          <dd dir="ltr">{customer?.phone || t('c.none')}</dd>
        </div>
        <div>
          <dt>{t('floor.employee')}</dt>
          <dd>{employee?.name}</dd>
        </div>
        <div>
          <dt>{t('floor.service')}</dt>
          <dd>{i18n.serviceName(state.services.find((s) => s.id === visit.serviceId))}</dd>
        </div>
        <div>
          <dt>{t('floor.startedAt')}</dt>
          <dd>{i18n.time(visit.startedAt)}</dd>
        </div>
        <div>
          <dt>{t('floor.elapsed')}</dt>
          <dd>{t('c.minutes', { n: Math.max(0, Math.round((now - Date.parse(visit.startedAt)) / 60000)) })}</dd>
        </div>
      </dl>

      <fieldset className="pay">
        <legend>{t('floor.updatePayment')}</legend>
        <div className="grid-2">
          <Field label={t('floor.amount')} error={payError}>
            <input inputMode="decimal" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value.replace(/[^\d.]/g, '') })} />
          </Field>
          <Field label={t('floor.method')}>
            <select value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value as PaymentMethod })}>
              {(visit.method === 'card' ? [...PAY_METHODS, 'card' as const] : PAY_METHODS).map((m) => (
                <option key={m} value={m}>
                  {t(`pm.${m}`)}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <button className="btn" onClick={savePayment} disabled={!payChanged}>
          {t('c.save')}
        </button>
      </fieldset>

      <label className="check">
        <input type="checkbox" checked={visit.expectNext} onChange={(e) => dispatch({ type: 'setExpectNext', seatId: seat.id, value: e.target.checked })} />
        <span>
          {t('floor.expectNext')}
          <span className="muted small block">{t('floor.expectNextHint')}</span>
        </span>
      </label>

      {confirmRelease ? (
        <div className="confirm" role="alert">
          <p>{t('floor.releaseHint')}</p>
          <div className="actions">
            <button className="btn danger" onClick={() => end('release')}>
              {t('floor.releaseConfirm')}
            </button>
            <button className="btn" onClick={() => setConfirmRelease(false)}>
              {t('c.cancel')}
            </button>
          </div>
        </div>
      ) : (
        <div className="actions">
          <button className="btn primary" onClick={() => end('complete')}>
            <CircleCheck size={16} aria-hidden /> {t('floor.complete')}
          </button>
          <button className="btn ghost danger-text" onClick={() => setConfirmRelease(true)}>
            {t('floor.release')}
          </button>
        </div>
      )}
    </div>
  )
}
