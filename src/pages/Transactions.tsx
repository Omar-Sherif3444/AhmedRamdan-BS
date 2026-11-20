import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { ArrowUpDown, ChevronLeft, ChevronRight, Download, Pencil, Receipt, Search } from 'lucide-react'
import { useStore } from '../store'
import { downloadCSV, inRange, revenue } from '../lib/calc'
import { Card, Empty, Field, Modal, RangePicker, VisitBadge, useRange } from '../components/ui'
import type { Key } from '../i18n'
import { PAY_METHODS, type PaymentMethod, type Visit, type VisitStatus } from '../types'

type Col = 'customer' | 'date' | 'employee' | 'service' | 'seat' | 'amount' | 'method' | 'status'
const COLS: Col[] = ['customer', 'date', 'employee', 'service', 'seat', 'amount', 'method', 'status']
const PAGE = 15

/** Resolves a visit's related names once, for tables, search, sort and CSV alike. */
export function useTxRows(visits: Visit[]) {
  const { state, i18n } = useStore()
  return useMemo(() => {
    const by = <T extends { id: string }>(xs: T[]) => new Map(xs.map((x) => [x.id, x]))
    const customers = by(state.customers)
    const employees = by(state.employees)
    const services = by(state.services)
    const seats = by(state.seats)
    return visits.map((v) => {
      const seat = seats.get(v.seatId)
      return {
        v,
        customer: customers.get(v.customerId)?.name ?? '',
        phone: customers.get(v.customerId)?.phone ?? '',
        employee: employees.get(v.employeeId)?.name ?? '',
        service: i18n.serviceName(services.get(v.serviceId)),
        seat: seat ? i18n.seatName(seat) : v.seatId,
      }
    })
  }, [visits, state.customers, state.employees, state.services, state.seats, i18n])
}
type Row = ReturnType<typeof useTxRows>[number]

export function TxTable({ rows: visits, sort, onSort, onEdit }: { rows: Visit[]; sort?: { col: Col; desc: boolean }; onSort?: (c: Col) => void; onEdit?: (v: Visit) => void }) {
  const { i18n } = useStore()
  const { t } = i18n
  const rows = useTxRows(visits)
  return (
    <div className="table-wrap">
      <table className="rtable">
        <thead>
          <tr>
            {COLS.map((c) => (
              <th key={c} scope="col" aria-sort={sort?.col === c ? (sort.desc ? 'descending' : 'ascending') : undefined} className={c === 'amount' ? 'num' : ''}>
                {onSort ? (
                  <button className="th-sort" onClick={() => onSort(c)} aria-label={t('tx.sortBy', { col: t(`tx.${c}` as Key) })}>
                    {t(`tx.${c}` as Key)} <ArrowUpDown size={13} aria-hidden />
                  </button>
                ) : (
                  t(`tx.${c}` as Key)
                )}
              </th>
            ))}
            {onEdit && (
              <th scope="col">
                <span className="sr-only">{t('tx.actions')}</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.v.id}>
              <td data-label={t('tx.customer')}>
                <strong>{r.customer}</strong>
              </td>
              <td data-label={t('tx.date')}>{i18n.dateTime(r.v.startedAt)}</td>
              <td data-label={t('tx.employee')}>{r.employee}</td>
              <td data-label={t('tx.service')}>{r.service}</td>
              <td data-label={t('tx.seat')}>{r.seat}</td>
              <td data-label={t('tx.amount')} className={r.v.status === 'cancelled' ? 'num struck' : 'num'}>
                {i18n.money(r.v.amount)}
              </td>
              <td data-label={t('tx.method')}>{t(`pm.${r.v.method}`)}</td>
              <td data-label={t('tx.status')}>
                <VisitBadge status={r.v.status} />
              </td>
              {onEdit && (
                <td data-label={t('tx.actions')}>
                  <button className="icon-btn" onClick={() => onEdit(r.v)} aria-label={t('tx.edit')} title={t('tx.edit')}>
                    <Pencil size={16} aria-hidden />
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const sortKey = (r: Row, c: Col): string | number =>
  c === 'date' ? r.v.startedAt : c === 'amount' ? r.v.amount : c === 'method' || c === 'status' ? r.v[c] : r[c]

export default function Transactions() {
  const { state, i18n } = useStore()
  const { t } = i18n
  const [q, setQ] = useState('')
  const [range, setRange] = useRange('30d')
  const [employee, setEmployee] = useState('')
  const [status, setStatus] = useState<VisitStatus | ''>('')
  const [sort, setSort] = useState<{ col: Col; desc: boolean }>({ col: 'date', desc: true })
  const [page, setPage] = useState(0)
  const [editing, setEditing] = useState<Visit | null>(null)
  // Correcting or removing past transactions is for the owner only (the server enforces it too).
  const isOwner = state.employees.find((e) => e.id === state.currentUserId)?.role === 'owner'

  const all = useTxRows(useMemo(() => inRange(state.visits, range), [state.visits, range]))
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const out = all.filter(
      (r) =>
        (!employee || r.v.employeeId === employee) &&
        (!status || r.v.status === status) &&
        (!needle || [r.customer, r.phone, r.service].some((s) => s.toLowerCase().includes(needle))),
    )
    const dir = sort.desc ? -1 : 1
    return out.sort((a, b) => {
      const x = sortKey(a, sort.col)
      const y = sortKey(b, sort.col)
      return (typeof x === 'number' ? x - (y as number) : x.localeCompare(String(y), i18n.lang)) * dir
    })
  }, [all, q, employee, status, sort, i18n.lang])

  useEffect(() => setPage(0), [q, range, employee, status, sort])
  const pages = Math.max(1, Math.ceil(rows.length / PAGE))
  const shown = rows.slice(page * PAGE, page * PAGE + PAGE)
  const filtered = !!(q || employee || status)

  const exportCSV = () =>
    downloadCSV(`transactions_${range.from}_${range.to}`, [
      COLS.map((c) => t(`tx.${c}` as Key)),
      ...rows.map((r) => [r.customer, i18n.dateTime(r.v.startedAt), r.employee, r.service, r.seat, r.v.amount, t(`pm.${r.v.method}`), t(`v.${r.v.status}`)]),
    ])

  const Prev = i18n.dir === 'rtl' ? ChevronRight : ChevronLeft
  const Next = i18n.dir === 'rtl' ? ChevronLeft : ChevronRight

  return (
    <div className="stack">
      <div className="toolbar">
        <RangePicker value={range} onChange={setRange} />
        <button className="btn" onClick={exportCSV} disabled={!rows.length}>
          <Download size={16} aria-hidden /> {t('c.export')}
        </button>
      </div>
      <div className="filters">
        <label className="search">
          <Search size={16} aria-hidden />
          <span className="sr-only">{t('c.search')}</span>
          <input type="search" placeholder={t('tx.searchPh')} value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        {isOwner && (
          <select aria-label={t('tx.employee')} value={employee} onChange={(e) => setEmployee(e.target.value)}>
            <option value="">{t('tx.allEmployees')}</option>
            {state.employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        )}
        <select aria-label={t('tx.status')} value={status} onChange={(e) => setStatus(e.target.value as VisitStatus | '')}>
          <option value="">{t('tx.allStatuses')}</option>
          {(['in_progress', 'completed', 'cancelled'] as const).map((s) => (
            <option key={s} value={s}>
              {t(`v.${s}`)}
            </option>
          ))}
        </select>
      </div>

      <Card>
        {rows.length === 0 ? (
          <Empty
            icon={Receipt}
            title={t('c.noResults')}
            hint={t('c.noResultsHint')}
            action={
              filtered && (
                <button
                  className="btn"
                  onClick={() => {
                    setQ('')
                    setEmployee('')
                    setStatus('')
                  }}
                >
                  {t('c.clearFilters')}
                </button>
              )
            }
          />
        ) : (
          <>
            <TxTable rows={shown.map((r) => r.v)} sort={sort} onSort={(col) => setSort((s) => ({ col, desc: s.col === col ? !s.desc : col === 'date' || col === 'amount' }))} onEdit={isOwner ? setEditing : undefined} />
            <div className="table-foot">
              <span className="muted">
                {t('c.showing', { a: page * PAGE + 1, b: page * PAGE + shown.length, n: rows.length })} · {t('tx.total')}: <strong>{i18n.money(revenue(rows.map((r) => r.v)))}</strong>
              </span>
              <div className="pager">
                <button className="icon-btn" onClick={() => setPage(page - 1)} disabled={page === 0} aria-label={t('c.prev')}>
                  <Prev size={18} />
                </button>
                <span>
                  {i18n.num(page + 1)} / {i18n.num(pages)}
                </span>
                <button className="icon-btn" onClick={() => setPage(page + 1)} disabled={page >= pages - 1} aria-label={t('c.next')}>
                  <Next size={18} />
                </button>
              </div>
            </div>
          </>
        )}
      </Card>
      <Modal open={!!editing} onClose={() => setEditing(null)} title={t('tx.edit')}>
        {editing && <TxForm visit={editing} onDone={() => setEditing(null)} />}
      </Modal>
    </div>
  )
}


function TxForm({ visit, onDone }: { visit: Visit; onDone: () => void }) {
  const { state, dispatch, toast, i18n } = useStore()
  const { t } = i18n
  const [f, setF] = useState({ employeeId: visit.employeeId, serviceId: visit.serviceId, amount: String(visit.amount), method: visit.method })
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const customer = state.customers.find((c) => c.id === visit.customerId)
  // Keep inactive staff and services selectable when this visit already uses them.
  const employees = state.employees.filter((e) => e.active || e.id === visit.employeeId)
  const services = state.services.filter((s) => s.active || s.id === visit.serviceId)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const amount = Number(f.amount)
    if (!(amount > 0)) return setError(t('err.amountInvalid'))
    dispatch({ type: 'updateVisit', visitId: visit.id, ...f, amount })
    toast(t('tx.saved'))
    onDone()
  }
  const remove = () => {
    dispatch({ type: 'deleteVisit', visitId: visit.id })
    toast(t('tx.deleted'))
    onDone()
  }

  return (
    <form onSubmit={submit} noValidate className="form">
      <p className="muted">
        <strong>{customer?.name}</strong> · {i18n.dateTime(visit.startedAt)}
      </p>
      <Field label={t('tx.employee')}>
        <select value={f.employeeId} onChange={(e) => setF({ ...f, employeeId: e.target.value })}>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label={t('tx.service')}>
        <select value={f.serviceId} onChange={(e) => setF({ ...f, serviceId: e.target.value })}>
          {!f.serviceId && <option value="">{t('c.none')}</option>}
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {i18n.serviceName(s)}
            </option>
          ))}
        </select>
      </Field>
      <div className="grid-2">
        <Field label={t('tx.amount')} error={error}>
          <input inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value.replace(/[^\d.]/g, '') })} />
        </Field>
        <Field label={t('tx.method')}>
          <select value={f.method} onChange={(e) => setF({ ...f, method: e.target.value as PaymentMethod })}>
            {(visit.method === 'card' ? [...PAY_METHODS, 'card' as const] : PAY_METHODS).map((m) => (
              <option key={m} value={m}>
                {t(`pm.${m}`)}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {confirmDelete ? (
        <div className="confirm" role="alert">
          <p>{t('tx.deleteHint')}</p>
          <div className="actions">
            <button type="button" className="btn danger" onClick={remove}>
              {t('tx.deleteConfirm')}
            </button>
            <button type="button" className="btn" onClick={() => setConfirmDelete(false)}>
              {t('c.cancel')}
            </button>
          </div>
        </div>
      ) : (
        <div className="actions">
          <button type="submit" className="btn primary">
            {t('c.save')}
          </button>
          <button type="button" className="btn" onClick={onDone}>
            {t('c.cancel')}
          </button>
          <button type="button" className="btn danger" onClick={() => setConfirmDelete(true)}>
            {t('tx.delete')}
          </button>
        </div>
      )}
    </form>
  )
}
