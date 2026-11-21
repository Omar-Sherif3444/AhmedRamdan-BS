import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Banknote, CalendarCheck, CalendarX, CircleCheck, Download, Info, MinusCircle, Receipt, TrendingUp, Wallet } from 'lucide-react'
import { useStore } from '../store'
import { fetchPayroll, revenueTotals } from '../lib/api'
import { dayKey, downloadCSV, monthStart, parseDay } from '../lib/calc'
import { Card, Empty, Field, Kpi, Modal } from '../components/ui'
import type { PayrollRow } from '../types'

/** Monthly payroll, calculated on the server. The owner sees and pays everyone; an employee sees only their own salary. */
export default function Payroll() {
  const { state, i18n } = useStore()
  const { t } = i18n
  const isOwner = state.employees.find((e) => e.id === state.currentUserId)?.role === 'admin'
  const [month, setMonth] = useState(monthStart().slice(0, 7))
  const [rows, setRows] = useState<PayrollRow[] | null>(null)
  const [failed, setFailed] = useState(false)

  // Recalculate whenever the month or any payroll input changes (each save reloads these lists).
  useEffect(() => {
    let live = true
    setFailed(false)
    fetchPayroll(`${month}-01`)
      .then((r) => live && setRows(r))
      .catch(() => live && setFailed(true))
    return () => {
      live = false
    }
  }, [month, state.employees, state.absences, state.deductions, state.wages, state.holidays])

  return (
    <div className="stack">
      <div className="toolbar">
        <label className="inline-field">
          <span>{t('py.month')}</span>
          <input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} />
        </label>
        {isOwner && rows && rows.length > 0 && <ExportButton rows={rows} month={month} />}
      </div>
      <p className="muted small">
        <Info size={14} aria-hidden /> {t('py.formula')}
      </p>
      {failed ? (
        <Card>
          <p className="muted">{t('py.loadError')}</p>
        </Card>
      ) : !rows ? (
        <p className="muted">{t('c.loading')}</p>
      ) : isOwner ? (
        <OwnerPayroll rows={rows} month={month} />
      ) : (
        <MyPayroll row={rows[0]} month={month} />
      )}
    </div>
  )
}

function ExportButton({ rows, month }: { rows: PayrollRow[]; month: string }) {
  const { t } = useStore().i18n
  return (
    <button
      className="btn"
      onClick={() =>
        downloadCSV(`payroll_${month}`, [
          [t('tx.employee'), t('py.dailyWage'), t('py.eligible'), t('py.absences'), t('py.payable'), t('py.gross'), t('py.deductions'), t('py.net'), t('py.status')],
          ...rows.map((r) => [r.name, r.dailyWage, r.eligibleDays, r.absenceDays, r.payableDays, r.gross, r.deductions, r.net, t(`py.${r.status}`)]),
        ])
      }
    >
      <Download size={16} aria-hidden /> {t('c.export')}
    </button>
  )
}

function StatusBadge({ row }: { row: PayrollRow }) {
  const { i18n } = useStore()
  const { t } = i18n
  return (
    <span className={row.status === 'paid' ? 'badge v-completed' : 'badge v-in_progress'} title={row.paidAt ? t('py.paidOn', { date: i18n.date(row.paidAt) }) : undefined}>
      {t(`py.${row.status}`)}
    </span>
  )
}

function OwnerPayroll({ rows, month }: { rows: PayrollRow[]; month: string }) {
  const { i18n } = useStore()
  const { t } = i18n
  const [deductFor, setDeductFor] = useState<PayrollRow | null>(null)
  const [paying, setPaying] = useState<PayrollRow | null>(null)
  const totals = useMemo(
    () => ({
      gross: rows.reduce((s, r) => s + r.gross, 0),
      net: rows.reduce((s, r) => s + r.net, 0),
      paid: rows.reduce((s, r) => s + (r.status === 'paid' ? r.net : 0), 0),
    }),
    [rows],
  )

  if (!rows.length) return <Empty icon={Wallet} title={t('py.empty')} />

  return (
    <>
      <div className="kpis cols-3">
        <Kpi icon={Banknote} label={t('py.totalGross')} value={i18n.money(totals.gross)} />
        <Kpi icon={Wallet} label={t('py.totalNet')} value={i18n.money(totals.net)} />
        <Kpi icon={CircleCheck} label={t('py.totalPaid')} value={i18n.money(totals.paid)} />
      </div>
      <Card title={i18n.month(month)}>
        <div className="table-wrap">
          <table className="rtable">
            <thead>
              <tr>
                <th scope="col">{t('tx.employee')}</th>
                <th scope="col" className="num">{t('py.dailyWage')}</th>
                <th scope="col" className="num">{t('py.eligible')}</th>
                <th scope="col" className="num">{t('py.absences')}</th>
                <th scope="col" className="num">{t('py.payable')}</th>
                <th scope="col" className="num">{t('py.gross')}</th>
                <th scope="col" className="num">{t('py.deductions')}</th>
                <th scope="col" className="num">{t('py.net')}</th>
                <th scope="col">{t('py.status')}</th>
                <th scope="col">
                  <span className="sr-only">{t('tx.actions')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.employeeId}>
                  <td data-label={t('tx.employee')}>
                    <strong>{r.name}</strong>
                  </td>
                  <td data-label={t('py.dailyWage')} className="num">{i18n.money(r.dailyWage)}</td>
                  <td data-label={t('py.eligible')} className="num">{i18n.num(r.eligibleDays)}</td>
                  <td data-label={t('py.absences')} className="num">{i18n.num(r.absenceDays)}</td>
                  <td data-label={t('py.payable')} className="num">{i18n.num(r.payableDays)}</td>
                  <td data-label={t('py.gross')} className="num">{i18n.money(r.gross)}</td>
                  <td data-label={t('py.deductions')} className="num">
                    <button className="link" onClick={() => setDeductFor(r)}>
                      {i18n.money(r.deductions)}
                    </button>
                  </td>
                  <td data-label={t('py.net')} className="num">
                    <strong>{i18n.money(r.net)}</strong>
                  </td>
                  <td data-label={t('py.status')}>
                    <StatusBadge row={r} />
                  </td>
                  <td data-label={t('tx.actions')}>
                    <div className="actions nowrap">
                      <button className="btn sm" onClick={() => setDeductFor(r)}>
                        <MinusCircle size={14} aria-hidden /> {t('py.deductions')}
                      </button>
                      {r.status === 'pending' && (
                        <button className="btn primary sm" onClick={() => setPaying(r)}>
                          <CircleCheck size={14} aria-hidden /> {t('py.markPaid')}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal open={!!deductFor} onClose={() => setDeductFor(null)} title={deductFor ? t('py.deductionsFor', { name: deductFor.name }) : ''}>
        {deductFor && <Deductions row={deductFor} month={month} />}
      </Modal>
      <Modal open={!!paying} onClose={() => setPaying(null)} title={t('py.markPaid')}>
        {paying && <PayConfirm row={paying} month={month} onDone={() => setPaying(null)} />}
      </Modal>
    </>
  )
}

function PayConfirm({ row, month, onDone }: { row: PayrollRow; month: string; onDone: () => void }) {
  const { dispatch, toast, i18n } = useStore()
  const { t } = i18n
  return (
    <div className="stack">
      <p className="confirm" role="alert">
        {t('py.payHint', { name: row.name, month: i18n.month(month), amount: i18n.money(row.net) })}
      </p>
      <div className="actions">
        <button
          className="btn primary"
          onClick={() => {
            dispatch({ type: 'paySalary', employeeId: row.employeeId, month: `${month}-01` })
            toast(t('py.paidOk'))
            onDone()
          }}
        >
          {t('py.payConfirm')}
        </button>
        <button className="btn" onClick={onDone}>
          {t('c.cancel')}
        </button>
      </div>
    </div>
  )
}

/** Owner-approved deductions for one employee and month. Each needs a reason; a paid month is locked. */
function Deductions({ row, month }: { row: PayrollRow; month: string }) {
  const { state, dispatch, toast, i18n } = useStore()
  const { t } = i18n
  const list = state.deductions.filter((d) => d.employeeId === row.employeeId && d.month === `${month}-01` && !d.cancelledAt)
  const locked = row.status === 'paid'
  const [f, setF] = useState({ amount: '', reason: '' })
  const [errors, setErrors] = useState<{ amount?: string; reason?: string }>({})

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const amount = Number(f.amount)
    const errs: typeof errors = {}
    if (!(amount > 0)) errs.amount = t('err.amountInvalid')
    if (!f.reason.trim()) errs.reason = t('err.reason')
    setErrors(errs)
    if (Object.keys(errs).length) return
    dispatch({ type: 'addDeduction', employeeId: row.employeeId, month: `${month}-01`, amount, reason: f.reason, now: new Date().toISOString() })
    toast(t('py.deductionSaved'))
    setF({ amount: '', reason: '' })
  }

  return (
    <div className="stack">
      {list.length === 0 ? (
        <p className="muted">{t('py.noDeductions')}</p>
      ) : (
        <ul className="history">
          {list.map((d) => (
            <li key={d.id}>
              <div>
                <strong>{i18n.money(d.amount)}</strong>
                <span className="muted small block">
                  {d.reason} · {i18n.date(d.createdAt)}
                </span>
              </div>
              {!locked && (
                <button
                  className="btn ghost sm danger-text"
                  onClick={() => {
                    dispatch({ type: 'cancelDeduction', id: d.id, now: new Date().toISOString() })
                    toast(t('py.deductionRemoved'))
                  }}
                >
                  {t('c.remove')}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {locked ? (
        <p className="muted small">{t('err.payrollLocked')}</p>
      ) : (
        <form onSubmit={submit} noValidate className="form">
          <h3>{t('py.addDeduction')}</h3>
          <Field label={t('py.deductionAmount')} error={errors.amount}>
            <input inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value.replace(/[^\d.]/g, '') })} />
          </Field>
          <Field label={t('py.reason')} error={errors.reason}>
            <textarea rows={2} placeholder={t('py.deductionReasonPh')} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} />
          </Field>
          <div className="actions">
            <button type="submit" className="btn primary">
              {t('py.addDeduction')}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}

/** An employee's own salary for the month, with their absences, deductions and revenue. */
function MyPayroll({ row, month }: { row?: PayrollRow; month: string }) {
  const { state, i18n } = useStore()
  const { t } = i18n
  const [mine, setMine] = useState<{ total: number; visits: number } | null>(null)
  useEffect(() => {
    let live = true
    const last = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)
    // The server returns only this employee's own revenue.
    revenueTotals({ from: `${month}-01`, to: dayKey(last) })
      .then((r) => live && setMine(r))
      .catch(() => live && setMine(null))
    return () => {
      live = false
    }
  }, [month, state.visits])
  const absences = state.absences.filter((a) => a.employeeId === state.currentUserId && !a.cancelledAt && a.day.startsWith(month))
  const deductions = state.deductions.filter((d) => d.employeeId === state.currentUserId && !d.cancelledAt && d.month === `${month}-01`)

  return (
    <>
      {!row ? (
        <Empty icon={Wallet} title={t('py.empty')} />
      ) : (
        <Card title={`${t('py.mine')} · ${i18n.month(month)}`} actions={<StatusBadge row={row} />}>
          <dl className="details">
            <div>
              <dt>{t('py.dailyWage')}</dt>
              <dd>{i18n.money(row.dailyWage)}</dd>
            </div>
            <div>
              <dt>{t('py.eligible')}</dt>
              <dd>{i18n.num(row.eligibleDays)}</dd>
            </div>
            <div>
              <dt>{t('py.absences')}</dt>
              <dd>{i18n.num(row.absenceDays)}</dd>
            </div>
            <div>
              <dt>{t('py.payable')}</dt>
              <dd>{i18n.num(row.payableDays)}</dd>
            </div>
            <div>
              <dt>{t('py.gross')}</dt>
              <dd>{i18n.money(row.gross)}</dd>
            </div>
            <div>
              <dt>{t('py.deductions')}</dt>
              <dd>{i18n.money(row.deductions)}</dd>
            </div>
            <div>
              <dt>{t('py.net')}</dt>
              <dd>
                <strong>{i18n.money(row.net)}</strong>
              </dd>
            </div>
            <div>
              <dt>{t('py.status')}</dt>
              <dd>{row.paidAt ? t('py.paidOn', { date: i18n.date(row.paidAt) }) : t('py.pending')}</dd>
            </div>
          </dl>
        </Card>
      )}
      <div className="kpis cols-3">
        <Kpi icon={TrendingUp} label={t('py.myRevenue')} value={mine ? i18n.money(mine.total) : '…'} sub={i18n.month(month)} />
        <Kpi icon={Receipt} label={t('py.myVisits')} value={mine ? i18n.num(mine.visits) : '…'} />
        <Kpi icon={CalendarX} label={t('py.myAbsences')} value={i18n.num(absences.length)} />
      </div>
      <div className="grid-2">
        <Card title={t('py.myAbsences')}>
          {absences.length === 0 ? (
            <p className="muted">{t('em.none')}</p>
          ) : (
            <ul className="history">
              {absences.map((a) => (
                <li key={a.id}>
                  <div>
                    <strong>
                      <CalendarCheck size={14} aria-hidden /> {i18n.day(a.day)} · {i18n.weekday(parseDay(a.day).getDay())}
                    </strong>
                    {a.reason && <span className="muted small block">{a.reason}</span>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title={t('py.deductions')}>
          {deductions.length === 0 ? (
            <p className="muted">{t('py.noDeductions')}</p>
          ) : (
            <ul className="history">
              {deductions.map((d) => (
                <li key={d.id}>
                  <div>
                    <strong>{i18n.money(d.amount)}</strong>
                    <span className="muted small block">{d.reason}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  )
}
