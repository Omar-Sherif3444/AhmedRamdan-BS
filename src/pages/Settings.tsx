import { useState, type FormEvent } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useStore } from '../store'
import { newId } from '../lib/reducer'
import { dayKey } from '../lib/calc'
import { Card, Field, Modal } from '../components/ui'
import type { Currency, Lang, Service } from '../types'

const CURRENCIES: Currency[] = ['EGP', 'SAR', 'AED', 'USD', 'EUR']

export default function Settings() {
  const { state, dispatch, toast, i18n } = useStore()
  const { t } = i18n
  const { settings } = state
  const [shopName, setShopName] = useState(settings.shopName)
  const [editing, setEditing] = useState<Service | 'new' | null>(null)

  return (
    <div className="stack settings">
      <Card title={t('st.shop')}>
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault()
            if (!shopName.trim()) return
            dispatch({ type: 'settings', patch: { shopName: shopName.trim() } })
            toast(t('st.saved'))
          }}
        >
          <Field label={t('st.shopName')} error={shopName.trim() ? undefined : t('err.required')}>
            <input value={shopName} onChange={(e) => setShopName(e.target.value)} />
          </Field>
          <div className="actions">
            <button className="btn primary" disabled={!shopName.trim() || shopName.trim() === settings.shopName}>
              {t('c.save')}
            </button>
          </div>
        </form>
        <div className="grid-3">
          <Field label={t('st.currency')} hint={t('st.currencyHint')}>
            <select value={settings.currency} onChange={(e) => dispatch({ type: 'settings', patch: { currency: e.target.value as Currency } })}>
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c} · {new Intl.DisplayNames(i18n.lang, { type: 'currency' }).of(c)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('st.language')}>
            <select value={settings.lang} onChange={(e) => dispatch({ type: 'settings', patch: { lang: e.target.value as Lang } })}>
              <option value="ar">العربية</option>
              <option value="en">English</option>
            </select>
          </Field>
        </div>
      </Card>

      <Card title={t('st.floor')} sub={t('st.floorHint')}>
        <div className="grid-3">
          {state.seats.map((s) => (
            <Field key={s.id + s.label} label={t(s.kind === 'sofa' ? 'seat.sofaN' : 'seat.chairN', { n: s.number })}>
              <input
                defaultValue={s.label}
                placeholder={t(s.kind === 'sofa' ? 'seat.sofaN' : 'seat.chairN', { n: s.number })}
                onBlur={(e) => e.target.value.trim() !== s.label && dispatch({ type: 'seatLabel', seatId: s.id, label: e.target.value })}
              />
            </Field>
          ))}
        </div>
      </Card>

      <Card
        title={t('st.services')}
        actions={
          <button className="btn" onClick={() => setEditing('new')}>
            <Plus size={16} aria-hidden /> {t('st.addService')}
          </button>
        }
      >
        <div className="table-wrap">
          <table className="rtable">
            <thead>
              <tr>
                <th scope="col">{t('st.nameAr')}</th>
                <th scope="col">{t('st.nameEn')}</th>
                <th scope="col" className="num">
                  {t('st.price')}
                </th>
                <th scope="col">{t('c.status')}</th>
                <th scope="col">
                  <span className="sr-only">{t('c.edit')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {state.services.map((s) => (
                <tr key={s.id} className={s.active ? '' : 'inactive'}>
                  <td data-label={t('st.nameAr')} dir="rtl">
                    {s.nameAr}
                  </td>
                  <td data-label={t('st.nameEn')} dir="ltr">
                    {s.nameEn}
                  </td>
                  <td data-label={t('st.price')} className="num">
                    {i18n.money(s.price)}
                  </td>
                  <td data-label={t('c.status')}>
                    <label className="switch">
                      <input type="checkbox" checked={s.active} onChange={() => dispatch({ type: 'saveService', service: { ...s, active: !s.active } })} />
                      <span>{s.active ? t('c.active') : t('c.inactive')}</span>
                    </label>
                  </td>
                  <td>
                    <button className="btn ghost" onClick={() => setEditing(s)}>
                      <Pencil size={15} aria-hidden /> {t('c.edit')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Holidays />

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing === 'new' ? t('st.addService') : t('st.editService')}>
        {editing && <ServiceForm service={editing === 'new' ? undefined : editing} onDone={() => setEditing(null)} />}
      </Modal>
    </div>
  )
}

function ServiceForm({ service, onDone }: { service?: Service; onDone: () => void }) {
  const { dispatch, toast, i18n } = useStore()
  const { t } = i18n
  const [f, setF] = useState({ nameAr: service?.nameAr ?? '', nameEn: service?.nameEn ?? '', price: String(service?.price ?? '') })
  const [errors, setErrors] = useState<Partial<Record<keyof typeof f, string>>>({})

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const price = Number(f.price)
    const errs: typeof errors = {}
    if (!f.nameAr.trim()) errs.nameAr = t('err.required')
    if (!f.nameEn.trim()) errs.nameEn = t('err.required')
    if (!f.price.trim() || !(price >= 0)) errs.price = t('err.price')
    setErrors(errs)
    if (Object.keys(errs).length) return
    dispatch({ type: 'saveService', service: { id: service?.id ?? newId(), active: service?.active ?? true, nameAr: f.nameAr.trim(), nameEn: f.nameEn.trim(), price } })
    toast(t('st.saved'))
    onDone()
  }

  return (
    <form onSubmit={submit} noValidate className="form">
      <Field label={t('st.nameAr')} error={errors.nameAr}>
        <input dir="rtl" value={f.nameAr} autoFocus onChange={(e) => setF({ ...f, nameAr: e.target.value })} />
      </Field>
      <Field label={t('st.nameEn')} error={errors.nameEn}>
        <input dir="ltr" value={f.nameEn} onChange={(e) => setF({ ...f, nameEn: e.target.value })} />
      </Field>
      <Field label={t('st.price')} error={errors.price}>
        <input inputMode="decimal" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value.replace(/[^\d.]/g, '') })} />
      </Field>
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

/** Official holidays: not counted as working days in payroll. */
function Holidays() {
  const { state, dispatch, i18n } = useStore()
  const { t } = i18n
  const [f, setF] = useState({ day: '', name: '' })
  const [error, setError] = useState('')
  const thisYear = String(new Date().getFullYear())
  const [year, setYear] = useState(thisYear)
  const years = [...new Set([thisYear, ...state.holidays.map((h) => h.day.slice(0, 4))])].sort()
  const list = state.holidays.filter((h) => h.day.startsWith(year))

  const add = (e: FormEvent) => {
    e.preventDefault()
    if (!f.day) return setError(t('err.date'))
    setError('')
    dispatch({ type: 'saveHoliday', day: f.day, name: f.name })
    setF({ day: '', name: '' })
  }

  return (
    <Card
      title={t('st.holidays')}
      sub={t('st.holidaysHint')}
      actions={
        <select aria-label={t('c.date')} value={year} onChange={(e) => setYear(e.target.value)}>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      }
    >
      <form className="form holiday-form" onSubmit={add} noValidate>
        <div className="grid-3">
          <Field label={t('c.date')} error={error}>
            <input type="date" value={f.day} min={dayKey(new Date(2020, 0, 1))} onChange={(e) => setF({ ...f, day: e.target.value })} />
          </Field>
          <Field label={t('st.holidayName')} optional>
            <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          </Field>
          <div className="field field-end">
            <button type="submit" className="btn">
              <Plus size={16} aria-hidden /> {t('st.addHoliday')}
            </button>
          </div>
        </div>
      </form>
      {list.length === 0 ? (
        <p className="muted">{t('st.noHolidays')}</p>
      ) : (
        <ul className="history">
          {list.map((h) => (
            <li key={h.day}>
              <div>
                <strong>{i18n.day(h.day)}</strong>
                {h.name && <span className="muted small block">{h.name}</span>}
              </div>
              <button className="icon-btn" onClick={() => dispatch({ type: 'deleteHoliday', day: h.day })} aria-label={`${t('c.remove')} ${i18n.day(h.day)}`} title={t('c.remove')}>
                <Trash2 size={16} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
