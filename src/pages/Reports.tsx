import { useMemo } from 'react'
import { Banknote, Ban, Download, Receipt, Store, TrendingUp, Users, UserCheck } from 'lucide-react'
import { useStore } from '../store'
import { byEmployee, daily, downloadCSV, expenseTotals, expensesInRange, inRange, parseDay, summary } from '../lib/calc'
import { AreaChart, Columns } from '../components/Charts'
import { Card, Kpi, RangePicker, useRange } from '../components/ui'

export default function Reports() {
  const { state, i18n } = useStore()
  const { t } = i18n
  const [range, setRange] = useRange('30d')
  const ranged = useMemo(() => inRange(state.visits, range), [state.visits, range])
  const s = useMemo(() => summary(ranged), [ranged])
  const days = useMemo(() => daily(ranged, range), [ranged, range])
  const emp = useMemo(() => byEmployee(ranged, state.employees), [ranged, state.employees])
  // Only shop expenses are operating costs; personal expenses never enter these figures.
  const shopExpenses = useMemo(() => expenseTotals(expensesInRange(state.expenses, range)).shop, [state.expenses, range])
  const file = (name: string) => `${name}_${range.from}_${range.to}`

  return (
    <div className="stack">
      <div className="toolbar">
        <RangePicker value={range} onChange={setRange} />
        <div className="actions">
          <button
            className="btn"
            onClick={() =>
              downloadCSV(file('daily'), [[t('rp.day'), t('rp.visits'), t('rp.revenue')], ...days.map((d) => [d.day, d.visits, d.revenue])])
            }
          >
            <Download size={16} aria-hidden /> {t('rp.exportDaily')}
          </button>
          <button
            className="btn"
            onClick={() =>
              downloadCSV(file('employees'), [
                [t('c.name'), t('em.role'), t('rp.visits'), t('rp.revenue'), t('rp.avg'), t('rp.share')],
                ...emp.map((e) => [e.employee.name, t(`role.${e.employee.role}`), e.visits, e.revenue, Math.round(e.avg), `${Math.round(e.share * 100)}%`]),
              ])
            }
          >
            <Download size={16} aria-hidden /> {t('rp.exportEmployees')}
          </button>
        </div>
      </div>

      <div className="kpis five">
        <Kpi icon={Banknote} label={t('rp.revenue')} value={i18n.money(s.revenue)} />
        <Kpi icon={Receipt} label={t('rp.visits')} value={i18n.num(s.visits)} />
        <Kpi icon={UserCheck} label={t('rp.avg')} value={i18n.money(Math.round(s.avg))} />
        <Kpi icon={Users} label={t('rp.customers')} value={i18n.num(s.customers)} />
        <Kpi icon={Ban} label={t('rp.cancelled')} value={i18n.num(s.cancelled)} />
      </div>
      <div className="kpis cols-3">
        <Kpi icon={Banknote} label={t('rp.revenue')} value={i18n.money(s.revenue)} />
        <Kpi icon={Store} label={t('rp.shopExpenses')} value={i18n.money(shopExpenses)} />
        <Kpi icon={TrendingUp} label={t('rp.net')} value={i18n.money(s.revenue - shopExpenses)} />
      </div>

      <div className="grid-charts">
        <Card title={t('rp.trend')} className="span-2">
          <AreaChart label={t('rp.trend')} data={days.map((d) => ({ label: i18n.shortDay(parseDay(d.day)), value: d.revenue }))} format={i18n.money} />
        </Card>
        <Card title={t('rp.visitTrend')} className="span-2">
          <Columns label={t('rp.visitTrend')} data={days.map((d) => ({ label: i18n.shortDay(parseDay(d.day)), value: d.visits }))} format={i18n.num} height={160} />
        </Card>
      </div>

      <Card title={t('rp.perf')}>
        <div className="table-wrap">
          <table className="rtable">
            <thead>
              <tr>
                <th scope="col">{t('c.name')}</th>
                <th scope="col">{t('em.role')}</th>
                <th scope="col" className="num">
                  {t('rp.visits')}
                </th>
                <th scope="col" className="num">
                  {t('rp.revenue')}
                </th>
                <th scope="col" className="num">
                  {t('rp.avg')}
                </th>
                <th scope="col">{t('rp.share')}</th>
              </tr>
            </thead>
            <tbody>
              {emp.map((e) => (
                <tr key={e.employee.id}>
                  <td data-label={t('c.name')}>
                    <strong>{e.employee.name}</strong>
                  </td>
                  <td data-label={t('em.role')}>{t(`role.${e.employee.role}`)}</td>
                  <td data-label={t('rp.visits')} className="num">
                    {i18n.num(e.visits)}
                  </td>
                  <td data-label={t('rp.revenue')} className="num">
                    {i18n.money(e.revenue)}
                  </td>
                  <td data-label={t('rp.avg')} className="num">
                    {i18n.money(Math.round(e.avg))}
                  </td>
                  <td data-label={t('rp.share')}>
                    <span className="share">
                      <span className="hbar-track" aria-hidden>
                        <span className="hbar" style={{ width: `${e.share * 100}%` }} />
                      </span>
                      {i18n.pct(e.share)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
