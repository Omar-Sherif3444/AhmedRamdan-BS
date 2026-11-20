import { useMemo, useState, type FormEvent } from 'react'
import { CalendarX, Info, Pencil, Plus, XCircle } from 'lucide-react'
import { useStore } from '../store'
import { dayKey, monthStart, parseDay } from '../lib/calc'
import { Card, Empty, Field, Modal } from '../components/ui'
import type { Absence } from '../types'

/** Owner only: record, edit and cancel employee absences. One active absence per employee and day. */
export default function Attendance() {
  const { state, i18n } = useStore()
  const { t } = i18n
  const [month, setMonth] = useState(monthStart().slice(0, 7))
  const [employee, setEmployee] = useState('')
  const [showCancelled, setShowCancelled] = useState(false)
  const [editing, setEditing] = useState<Absence | 'new' | null>(null)
  const staff = state.employees.filter((e) => e.role !== 'owner')
  const name = (id: string) => state.employees.find((e) => e.id === id)?.name ?? ''

  const rows = useMemo(
    () =>
      state.absences
        .filter((a) => a.day.startsWith(month) && (!employee || a.employeeId === employee) && (showCancelled || !a.cancelledAt))
        .sort((a, b) => b.day.localeCompare(a.day) || name(a.employeeId).localeCompare(name(b.employeeId))),
    [state.absences, state.employees, month, employee, showCancelled],
  )
  const perEmployee = useMemo(() => {
    const m = new Map<string, number>()
    for (const a of state.absences) if (!a.cancelledAt && a.day.startsWith(month)) m.set(a.employeeId, (m.get(a.employeeId) ?? 0) + 1)
    return m
  }, [state.absences, month])

  return (
    <div className="stack">
      <div className="toolbar">
        <p className="muted small">
          <Info size={14} aria-hidden /> {t('at.note')}
        </p>
        <button className="btn primary" onClick={() => setEditing('new')} disabled={!staff.length}>
          <Plus size={16} aria-hidden /> {t('at.add')}
        </button>
      </div>
      <div className="filters">
        <label className="inline-field">
          <span>{t('at.month')}</span>
          <input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} />
        </label>
        <select aria-label={t('tx.employee')} value={employee} onChange={(e) => setEmployee(e.target.value)}>
          <option value="">{t('tx.allEmployees')}</option>
          {staff.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
        <label className="check">
          <input type="checkbox" checked={showCancelled} onChange={(e) => setShowCancelled(e.target.checked)} />
          <span>{t('at.showCancelled')}</span>
        </label>
      </div>

      <div className="chips" aria-label={t('at.total')}>
        {staff.map((e) => (
          <span key={e.id} className="chip">
            {e.name}: <strong>{i18n.num(perEmployee.get(e.id) ?? 0)}</strong>
          </span>
        ))}
      </div>

      <Card title={`${t('at.history')} · ${i18n.month(month)}`}>
        {rows.length === 0 ? (
          <Empty icon={CalendarX} title={t('at.empty')} />
        ) : (
          <div className="table-wrap">
            <table className="rtable">
              <thead>
                <tr>
                  <th scope="col">{t('at.day')}</th>
                  <th scope="col">{t('tx.employee')}</th>
                  <th scope="col">{t('at.reason')}</th>
                  <th scope="col">{t('c.status')}</th>
                  <th scope="col">
                    <span className="sr-only">{t('tx.actions')}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.id} className={a.cancelledAt ? 'inactive' : ''}>
                    <td data-label={t('at.day')}>
                      {i18n.day(a.day)} <span className="muted small">· {i18n.weekday(parseDay(a.day).getDay())}</span>
                    </td>
                    <td data-label={t('tx.employee')}>{name(a.employeeId)}</td>
                    <td data-label={t('at.reason')} className="wrap-text">
                      {a.reason || t('c.none')}
                    </td>
                    <td data-label={t('c.status')}>
                      <span className={a.cancelledAt ? 'badge v-cancelled' : 'badge v-completed'}>{t(a.cancelledAt ? 'at.cancelled' : 'at.recorded')}</span>
                    </td>
                    <td data-label={t('tx.actions')}>
                      {!a.cancelledAt && (
                        <button className="icon-btn" onClick={() => setEditing(a)} aria-label={t('at.edit')} title={t('at.edit')}>
                          <Pencil size={16} aria-hidden />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing === 'new' ? t('at.add') : t('at.edit')}>
        {editing && <AbsenceForm absence={editing === 'new' ? undefined : editing} defaultEmployee={employee} onDone={() => setEditing(null)} />}
      </Modal>
    </div>
  )
}

function AbsenceForm({ absence, defaultEmployee, onDone }: { absence?: Absence; defaultEmployee: string; onDone: () => void }) {
  const { state, dispatch, toast, i18n } = useStore()
  const { t } = i18n
  const staff = state.employees.filter((e) => e.role !== 'owner' && (e.active || e.id === absence?.employeeId))
  const [f, setF] = useState({ employeeId: absence?.employeeId ?? defaultEmployee, day: absence?.day ?? dayKey(new Date()), reason: absence?.reason ?? '' })
  const [errors, setErrors] = useState<{ employeeId?: string; day?: string }>({})
  const [confirmCancel, setConfirmCancel] = useState(false)
  const emp = state.employees.find((e) => e.id === f.employeeId)
  const notWorkingDay = !!f.day && (state.holidays.some((h) => h.day === f.day) || !!emp?.daysOff.includes(parseDay(f.day).getDay()))

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const errs: typeof errors = {}
    if (!f.employeeId) errs.employeeId = t('err.employee')
    if (!f.day) errs.day = t('err.date')
    else if (state.absences.some((a) => !a.cancelledAt && a.id !== absence?.id && a.employeeId === f.employeeId && a.day === f.day)) errs.day = t('err.duplicateAbsence')
    setErrors(errs)
    if (Object.keys(errs).length) return
    dispatch({ type: 'saveAbsence', id: absence?.id, ...f, now: new Date().toISOString() })
    toast(t('at.saved'))
    onDone()
  }
  const cancel = () => {
    if (!absence) return
    dispatch({ type: 'cancelAbsence', id: absence.id, now: new Date().toISOString() })
    toast(t('at.cancelledOk'))
    onDone()
  }

  return (
    <form onSubmit={submit} noValidate className="form">
      <Field label={t('tx.employee')} error={errors.employeeId}>
        <select value={f.employeeId} onChange={(e) => setF({ ...f, employeeId: e.target.value })}>
          <option value="">—</option>
          {staff.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name} · {t(`role.${e.role}`)}
            </option>
          ))}
        </select>
      </Field>
      <Field label={t('at.day')} error={errors.day} hint={notWorkingDay ? t('at.dayOff') : undefined}>
        <input type="date" value={f.day} onChange={(e) => setF({ ...f, day: e.target.value })} />
      </Field>
      <Field label={t('at.reason')} optional>
        <textarea rows={2} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} />
      </Field>
      {confirmCancel ? (
        <div className="confirm" role="alert">
          <p>{t('at.cancelHint')}</p>
          <div className="actions">
            <button type="button" className="btn danger" onClick={cancel}>
              {t('at.cancelConfirm')}
            </button>
            <button type="button" className="btn" onClick={() => setConfirmCancel(false)}>
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
          {absence && (
            <button type="button" className="btn danger" onClick={() => setConfirmCancel(true)}>
              <XCircle size={15} aria-hidden /> {t('at.cancel')}
            </button>
          )}
        </div>
      )}
    </form>
  )
}
