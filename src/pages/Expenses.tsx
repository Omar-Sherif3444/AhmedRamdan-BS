import { useMemo, useState, type FormEvent } from 'react'
import { Download, Info, Pencil, Plus, Store, User, Wallet } from 'lucide-react'
import { useStore } from '../store'
import { dayKey, downloadCSV, expenseTotals, expensesInRange } from '../lib/calc'
import { Card, Empty, Field, Kpi, Modal, RangePicker, useRange } from '../components/ui'
import type { Expense, ExpenseKind } from '../types'

const KINDS: ExpenseKind[] = ['shop', 'personal']

/** Every staff member records their own expenses; the owner sees, filters, corrects and removes all of them. */
export default function Expenses() {
  const { state, i18n } = useStore()
  const { t } = i18n
  const isOwner = state.employees.find((e) => e.id === state.currentUserId)?.role === 'admin'
  const [range, setRange] = useRange('month')
  const [employee, setEmployee] = useState('')
  const [kind, setKind] = useState<ExpenseKind | ''>('')
  const [editing, setEditing] = useState<Expense | 'new' | null>(null)

  // The server only returns other people's expenses to the owner; the filter here is for display.
  const rows = useMemo(
    () =>
      expensesInRange(state.expenses, range)
        .filter((e) => (isOwner || e.employeeId === state.currentUserId) && (!employee || e.employeeId === employee) && (!kind || e.kind === kind))
        .sort((a, b) => b.spentAt.localeCompare(a.spentAt)),
    [state.expenses, range, employee, kind, isOwner, state.currentUserId],
  )
  const totals = expenseTotals(rows)
  const name = (id: string) => state.employees.find((e) => e.id === id)?.name ?? ''

  const exportCSV = () =>
    downloadCSV(`expenses_${range.from}_${range.to}`, [
      [t('ex.date'), t('ex.by'), t('ex.kind'), t('ex.amount'), t('ex.description')],
      ...rows.map((e) => [i18n.dateTime(e.spentAt), name(e.employeeId), t(`ex.${e.kind}`), e.amount, e.description]),
    ])

  return (
    <div className="stack">
      <div className="toolbar">
        <p className="muted small">
          <Info size={14} aria-hidden /> {t(isOwner ? 'ex.ownerNote' : 'ex.mineNote')}
        </p>
        <button className="btn primary" onClick={() => setEditing('new')}>
          <Plus size={16} aria-hidden /> {t('ex.add')}
        </button>
      </div>
      <div className="toolbar">
        <RangePicker value={range} onChange={setRange} />
        <button className="btn" onClick={exportCSV} disabled={!rows.length}>
          <Download size={16} aria-hidden /> {t('c.export')}
        </button>
      </div>
      <div className="filters">
        {isOwner && (
          <select aria-label={t('ex.by')} value={employee} onChange={(e) => setEmployee(e.target.value)}>
            <option value="">{t('tx.allEmployees')}</option>
            {state.employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        )}
        <select aria-label={t('ex.kind')} value={kind} onChange={(e) => setKind(e.target.value as ExpenseKind | '')}>
          <option value="">{t('ex.allKinds')}</option>
          {KINDS.map((k) => (
            <option key={k} value={k}>
              {t(`ex.${k}`)}
            </option>
          ))}
        </select>
      </div>

      <div className="kpis cols-3">
        <Kpi icon={Store} label={t('ex.shopTotal')} value={i18n.money(totals.shop)} />
        <Kpi icon={User} label={t('ex.personalTotal')} value={i18n.money(totals.personal)} />
        <Kpi icon={Wallet} label={t('ex.count')} value={i18n.num(rows.length)} />
      </div>

      <Card>
        {rows.length === 0 ? (
          <Empty icon={Wallet} title={t('ex.empty')} hint={t('ex.emptyHint')} />
        ) : (
          <div className="table-wrap">
            <table className="rtable">
              <thead>
                <tr>
                  <th scope="col">{t('ex.date')}</th>
                  {isOwner && <th scope="col">{t('ex.by')}</th>}
                  <th scope="col">{t('ex.kind')}</th>
                  <th scope="col" className="num">
                    {t('ex.amount')}
                  </th>
                  <th scope="col">{t('ex.description')}</th>
                  {isOwner && (
                    <th scope="col">
                      <span className="sr-only">{t('tx.actions')}</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => (
                  <tr key={e.id}>
                    <td data-label={t('ex.date')}>
                      {i18n.dateTime(e.spentAt)}
                      {e.updatedAt && <span className="muted small"> · {t('ex.edited')}</span>}
                    </td>
                    {isOwner && <td data-label={t('ex.by')}>{name(e.employeeId)}</td>}
                    <td data-label={t('ex.kind')}>
                      <span className={e.kind === 'shop' ? 'badge v-in_progress' : 'badge v-cancelled'}>{t(`ex.${e.kind}`)}</span>
                    </td>
                    <td data-label={t('ex.amount')} className="num">
                      {i18n.money(e.amount)}
                    </td>
                    <td data-label={t('ex.description')} className="wrap-text">
                      {e.description || t('c.none')}
                    </td>
                    {isOwner && (
                      <td data-label={t('tx.actions')}>
                        <button className="icon-btn" onClick={() => setEditing(e)} aria-label={t('ex.edit')} title={t('ex.edit')}>
                          <Pencil size={16} aria-hidden />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing === 'new' ? t('ex.add') : t('ex.edit')}>
        {editing && <ExpenseForm expense={editing === 'new' ? undefined : editing} isOwner={isOwner} onDone={() => setEditing(null)} />}
      </Modal>
    </div>
  )
}

function ExpenseForm({ expense, isOwner, onDone }: { expense?: Expense; isOwner: boolean; onDone: () => void }) {
  const { state, dispatch, toast, i18n } = useStore()
  const { t } = i18n
  const today = dayKey(new Date())
  const [f, setF] = useState({
    amount: expense ? String(expense.amount) : '',
    kind: (expense?.kind ?? '') as ExpenseKind | '',
    description: expense?.description ?? '',
    day: expense ? dayKey(new Date(expense.spentAt)) : today,
  })
  const [errors, setErrors] = useState<Partial<Record<keyof typeof f, string>>>({})
  const [confirmDelete, setConfirmDelete] = useState(false)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const amount = Number(f.amount)
    const errs: typeof errors = {}
    if (!f.amount.trim()) errs.amount = t('err.amount')
    else if (!(amount > 0)) errs.amount = t('err.amountInvalid')
    if (!f.kind) errs.kind = t('err.kind')
    // Employees must explain the expense; for the owner the description is optional.
    if (!isOwner && !f.description.trim()) errs.description = t('err.description')
    if (isOwner && (!f.day || f.day > today)) errs.day = t('err.date')
    setErrors(errs)
    if (Object.keys(errs).length || !f.kind) return
    // The owner may back-date: keep the original time when the day is unchanged, otherwise use midday of that day.
    const sameDay = expense ? dayKey(new Date(expense.spentAt)) === f.day : f.day === today
    const spentAt = sameDay ? (expense?.spentAt ?? undefined) : new Date(`${f.day}T12:00:00`).toISOString()
    const now = new Date().toISOString()
    if (expense) dispatch({ type: 'updateExpense', id: expense.id, amount, kind: f.kind, description: f.description, spentAt: spentAt ?? expense.spentAt })
    else dispatch({ type: 'addExpense', amount, kind: f.kind, description: f.description, spentAt: isOwner ? spentAt : undefined, employeeId: state.currentUserId, now })
    toast(t(expense ? 'ex.updated' : 'ex.saved'))
    onDone()
  }
  const remove = () => {
    if (!expense) return
    dispatch({ type: 'deleteExpense', id: expense.id })
    toast(t('ex.deleted'))
    onDone()
  }

  return (
    <form onSubmit={submit} noValidate className="form">
      <div className="grid-2">
        <Field label={t('ex.amount')} error={errors.amount}>
          <input inputMode="decimal" autoFocus value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value.replace(/[^\d.]/g, '') })} />
        </Field>
        <Field label={t('ex.kind')} error={errors.kind}>
          <select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as ExpenseKind })}>
            <option value="">—</option>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`ex.${k}`)}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label={t('ex.description')} optional={isOwner} error={errors.description}>
        <textarea rows={3} placeholder={t('ex.descriptionPh')} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
      </Field>
      {isOwner ? (
        <Field label={t('c.date')} error={errors.day}>
          <input type="date" value={f.day} max={today} onChange={(e) => setF({ ...f, day: e.target.value })} />
        </Field>
      ) : (
        <p className="muted small">{t('ex.autoDate')}</p>
      )}
      {confirmDelete ? (
        <div className="confirm" role="alert">
          <p>{t('ex.deleteHint')}</p>
          <div className="actions">
            <button type="button" className="btn danger" onClick={remove}>
              {t('ex.deleteConfirm')}
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
          {expense && isOwner && (
            <button type="button" className="btn danger" onClick={() => setConfirmDelete(true)}>
              {t('c.delete')}
            </button>
          )}
        </div>
      )}
    </form>
  )
}
