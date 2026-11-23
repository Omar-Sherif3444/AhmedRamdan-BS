import { useEffect, useState } from 'react'
import { useStore } from '../store'
import { dailyTotals, type DayTotal } from '../lib/api'

/** Day-by-day income − expenses for the front desk. Server-summed: no visit or customer detail. */
export default function DailyTotals() {
  const { state, i18n } = useStore()
  const { t } = i18n
  const [rows, setRows] = useState<DayTotal[] | null>(null)
  const [failed, setFailed] = useState(false)

  // Refetch whenever a visit or expense changes (each save and each live update reloads these lists).
  useEffect(() => {
    let live = true
    dailyTotals(30)
      .then((r) => {
        if (!live) return
        setRows(r)
        setFailed(false)
      })
      .catch(() => live && setFailed(true))
    return () => {
      live = false
    }
  }, [state.visits, state.expenses])

  if (failed && !rows) return <p className="muted">{t('err.server')}</p>
  if (!rows) return <p className="muted">{t('c.loading')}</p>

  const today = rows[0]
  return (
    <div className="stack">
      {today && (
        <div className="kpis cols-3">
          <div className="kpi">
            <div>
              <p className="kpi-label">{t('dt.income')}</p>
              <p className="kpi-value">{i18n.money(today.income)}</p>
            </div>
          </div>
          <div className="kpi">
            <div>
              <p className="kpi-label">{t('dt.expenses')}</p>
              <p className="kpi-value">{i18n.money(today.expenses)}</p>
            </div>
          </div>
          <div className="kpi">
            <div>
              <p className="kpi-label">{t('dt.netToday')}</p>
              <p className={today.net < 0 ? 'kpi-value danger-text' : 'kpi-value'}>{i18n.money(today.net)}</p>
            </div>
          </div>
        </div>
      )}
      <p className="muted small">{t('dt.note')}</p>
      <div className="table-wrap">
        <table className="rtable">
          <thead>
            <tr>
              <th scope="col">{t('dt.day')}</th>
              <th scope="col" className="num">
                {t('dt.income')}
              </th>
              <th scope="col" className="num">
                {t('dt.expenses')}
              </th>
              <th scope="col" className="num">
                {t('dt.net')}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.day}>
                <td data-label={t('dt.day')}>
                  <strong className="block">{i18n.weekday(new Date(`${r.day}T12:00:00`).getDay())}</strong>
                  <span className="muted small">{i18n.day(r.day)}</span>
                </td>
                <td data-label={t('dt.income')} className="num">
                  {i18n.money(r.income)}
                  {r.income > 0 && (
                    <span className="muted small block">
                      {t('pm.cash')} {i18n.money(r.cash)} · {t('pm.wallet')} {i18n.money(r.wallet)}
                    </span>
                  )}
                </td>
                <td data-label={t('dt.expenses')} className="num">
                  {i18n.money(r.expenses)}
                </td>
                <td data-label={t('dt.net')} className={r.net < 0 ? 'num danger-text' : 'num'}>
                  <strong>{i18n.money(r.net)}</strong>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
