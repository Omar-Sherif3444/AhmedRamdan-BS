import { useMemo, useState, type FormEvent } from 'react'
import { Info, Pencil, Plus, Power } from 'lucide-react'
import { useStore } from '../store'
import { dayKey, summary } from '../lib/calc'
import { newId } from '../lib/reducer'
import { EMAIL, normEmail } from '../lib/auth'
import { Field, Modal, VisitBadge, initials } from '../components/ui'
import { useTxRows } from './Transactions'
import type { Employee, Role } from '../types'

const ROLES: Role[] = ['owner', 'barber', 'receptionist']
const PHONE = /^\+?[\d\s-]{7,15}$/

export default function Employees() {
  const { state, dispatch, i18n } = useStore()
  const { t } = i18n
  const [profile, setProfile] = useState<string | null>(null)
  const [editing, setEditing] = useState<Employee | 'new' | null>(null)

  const stats = useMemo(() => new Map(state.employees.map((e) => [e.id, summary(state.visits.filter((v) => v.employeeId === e.id))])), [state.employees, state.visits])
  const shown = state.employees.find((e) => e.id === profile)

  return (
    <div className="stack">
      <div className="toolbar">
        <p className="muted small">
          <Info size={14} aria-hidden /> {t('em.note')}
        </p>
        <button className="btn primary" onClick={() => setEditing('new')}>
          <Plus size={16} aria-hidden /> {t('em.add')}
        </button>
      </div>
      <div className="emp-grid">
        {state.employees.map((e) => {
          const s = stats.get(e.id)!
          const locked = e.role === 'owner' || e.id === state.currentUserId
          return (
            <article key={e.id} className={e.active ? 'emp card' : 'emp card inactive'}>
              <button className="emp-head" onClick={() => setProfile(e.id)}>
                <span className="avatar lg" aria-hidden>
                  {initials(e.name)}
                </span>
                <span>
                  <strong className="block">{e.name}</strong>
                  <span className="muted small">{t(`role.${e.role}`)}</span>
                </span>
              </button>
              <span className={e.active ? 'badge v-completed' : 'badge v-cancelled'}>{e.active ? t('c.active') : t('c.inactive')}</span>
              <dl className="emp-stats">
                <div>
                  <dt>{t('em.visits')}</dt>
                  <dd>{i18n.num(s.visits)}</dd>
                </div>
                <div>
                  <dt>{t('em.revenue')}</dt>
                  <dd>{i18n.money(s.revenue)}</dd>
                </div>
                {e.role !== 'owner' && (
                  <div>
                    <dt>{t('py.dailyWage')}</dt>
                    <dd>{e.dailyWage !== undefined ? i18n.money(e.dailyWage) : t('em.noWage')}</dd>
                  </div>
                )}
              </dl>
              <div className="actions">
                <button className="btn ghost" onClick={() => setEditing(e)}>
                  <Pencil size={15} aria-hidden /> {t('c.edit')}
                </button>
                <button
                  className="btn ghost"
                  onClick={() => dispatch({ type: 'toggleEmployee', id: e.id })}
                  disabled={locked}
                  title={locked ? t('em.locked') : undefined}
                >
                  <Power size={15} aria-hidden /> {e.active ? t('em.deactivate') : t('em.activate')}
                </button>
              </div>
            </article>
          )
        })}
      </div>

      <Modal open={!!shown} onClose={() => setProfile(null)} title={shown?.name ?? ''} wide>
        {shown && <Profile employee={shown} />}
      </Modal>
      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing === 'new' ? t('em.add') : t('em.edit')}>
        {editing && <EmployeeForm employee={editing === 'new' ? undefined : editing} onDone={() => setEditing(null)} />}
      </Modal>
    </div>
  )
}

function Profile({ employee }: { employee: Employee }) {
  const { state, i18n } = useStore()
  const { t } = i18n
  const visits = useMemo(
    () => state.visits.filter((v) => v.employeeId === employee.id).sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
    [state.visits, employee.id],
  )
  const recent = useTxRows(useMemo(() => visits.slice(0, 8), [visits]))
  const s = summary(visits)
  const wages = state.wages.filter((w) => w.employeeId === employee.id).reverse()
  return (
    <div className="stack">
      <dl className="details">
        <div>
          <dt>{t('em.role')}</dt>
          <dd>{t(`role.${employee.role}`)}</dd>
        </div>
        <div>
          <dt>{t('c.status')}</dt>
          <dd>{employee.active ? t('c.active') : t('c.inactive')}</dd>
        </div>
        <div>
          <dt>{t('c.phone')}</dt>
          <dd dir="ltr">{employee.phone || t('c.none')}</dd>
        </div>
        <div>
          <dt>{t('em.email')}</dt>
          <dd dir="ltr">{employee.email}</dd>
        </div>
        <div>
          <dt>{t('em.startDate')}</dt>
          <dd>{i18n.day(employee.joinedAt)}</dd>
        </div>
        {employee.role !== 'owner' && (
          <>
            <div>
              <dt>{t('py.dailyWage')}</dt>
              <dd>{employee.dailyWage !== undefined ? i18n.money(employee.dailyWage) : t('em.noWage')}</dd>
            </div>
            <div>
              <dt>{t('em.daysOff')}</dt>
              <dd>{employee.daysOff.length ? employee.daysOff.map(i18n.weekday).join(i18n.lang === 'ar' ? '، ' : ', ') : t('em.none')}</dd>
            </div>
          </>
        )}
        <div>
          <dt>{t('em.visits')}</dt>
          <dd>{i18n.num(s.visits)}</dd>
        </div>
        <div>
          <dt>{t('em.revenue')}</dt>
          <dd>{i18n.money(s.revenue)}</dd>
        </div>
      </dl>
      {wages.length > 0 && (
        <>
          <h3>{t('em.wageHistory')}</h3>
          <ul className="history">
            {wages.map((w) => (
              <li key={w.effectiveFrom}>
                <strong>{i18n.money(w.dailyWage)}</strong>
                <span className="muted small">{t('em.fromDate', { date: i18n.day(w.effectiveFrom) })}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      <h3>{t('em.recent')}</h3>
      {recent.length === 0 ? (
        <p className="muted">{t('cu.noVisits')}</p>
      ) : (
        <ul className="history">
          {recent.map((r) => (
            <li key={r.v.id}>
              <div>
                <strong>{r.customer}</strong>
                <span className="muted small block">
                  {i18n.dateTime(r.v.startedAt)} · {r.service}
                </span>
              </div>
              <div className="history-end">
                <span className={r.v.status === 'cancelled' ? 'struck' : ''}>{i18n.money(r.v.amount)}</span>
                <VisitBadge status={r.v.status} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function EmployeeForm({ employee, onDone }: { employee?: Employee; onDone: () => void }) {
  const { state, dispatch, toast, i18n } = useStore()
  const { t } = i18n
  const [f, setF] = useState({
    name: employee?.name ?? '',
    phone: employee?.phone ?? '',
    role: employee?.role ?? ('barber' as Role),
    email: employee?.email ?? '',
    password: '',
    dailyWage: employee?.dailyWage !== undefined ? String(employee.dailyWage) : '',
    joinedAt: employee?.joinedAt ?? dayKey(new Date()),
    daysOff: employee?.daysOff ?? [],
  })
  const [errors, setErrors] = useState<{ name?: string; phone?: string; email?: string; password?: string; dailyWage?: string; joinedAt?: string }>({})
  const paid = f.role !== 'owner'

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const errs: typeof errors = {}
    if (f.name.trim().length < 2) errs.name = t('err.required')
    if (f.phone.trim() && !PHONE.test(f.phone.trim())) errs.phone = t('err.phone')
    if (!EMAIL.test(f.email.trim())) errs.email = t('auth.emailInvalid')
    else if (state.employees.some((x) => x.id !== employee?.id && normEmail(x.email) === normEmail(f.email))) errs.email = t('auth.emailTaken')
    // A new employee needs a password; when editing, empty keeps the current one.
    if ((!employee || f.password) && f.password.length < 6) errs.password = t('auth.passwordShort')
    // Every employee on payroll needs a daily wage; the owner is not on payroll.
    if (paid && !(Number(f.dailyWage) > 0)) errs.dailyWage = t('err.wage')
    if (!f.joinedAt) errs.joinedAt = t('err.date')
    setErrors(errs)
    if (Object.keys(errs).length) return
    dispatch({
      type: 'saveEmployee',
      employee: {
        id: employee?.id ?? newId(),
        active: employee?.active ?? true,
        name: f.name.trim(),
        phone: f.phone.trim(),
        role: f.role,
        email: f.email.trim(),
        password: f.password || undefined,
        joinedAt: f.joinedAt,
        daysOff: f.daysOff,
        dailyWage: paid ? Number(f.dailyWage) : employee?.dailyWage,
      },
    })
    toast(t('em.saved'))
    onDone()
  }

  return (
    <form onSubmit={submit} noValidate className="form">
      <Field label={t('c.name')} error={errors.name}>
        <input value={f.name} autoFocus onChange={(e) => setF({ ...f, name: e.target.value })} />
      </Field>
      <Field label={t('c.phone')} optional error={errors.phone}>
        <input type="tel" dir="ltr" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
      </Field>
      <Field label={t('em.email')} error={errors.email}>
        <input type="email" dir="ltr" autoComplete="off" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
      </Field>
      <Field label={t('auth.password')} error={errors.password} hint={employee ? t('em.passwordKeep') : undefined}>
        <input type="password" dir="ltr" autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
      </Field>
      <Field label={t('em.role')}>
        <select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as Role })} disabled={employee?.role === 'owner'}>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {t(`role.${r}`)}
            </option>
          ))}
        </select>
      </Field>
      <div className="grid-2">
        {paid && (
          <Field label={t('em.dailyWage')} error={errors.dailyWage} hint={employee ? t('em.wageHint') : undefined}>
            <input inputMode="decimal" dir="ltr" value={f.dailyWage} onChange={(e) => setF({ ...f, dailyWage: e.target.value.replace(/[^\d.]/g, '') })} />
          </Field>
        )}
        <Field label={t('em.startDate')} error={errors.joinedAt}>
          <input type="date" value={f.joinedAt} onChange={(e) => setF({ ...f, joinedAt: e.target.value })} />
        </Field>
      </div>
      {paid && (
        <fieldset className="days">
          <legend>{t('em.daysOff')}</legend>
          {[6, 0, 1, 2, 3, 4, 5].map((d) => (
            <label key={d} className="check">
              <input
                type="checkbox"
                checked={f.daysOff.includes(d)}
                onChange={(e) => setF({ ...f, daysOff: e.target.checked ? [...f.daysOff, d].sort() : f.daysOff.filter((x) => x !== d) })}
              />
              <span>{i18n.weekday(d)}</span>
            </label>
          ))}
        </fieldset>
      )}
      <div className="actions">
        <button type="submit" className="btn primary">
          {t('c.save')}
        </button>
        <button type="button" className="btn" onClick={onDone}>
          {t('c.cancel')}
        </button>
      </div>
    </form>
  )
}
