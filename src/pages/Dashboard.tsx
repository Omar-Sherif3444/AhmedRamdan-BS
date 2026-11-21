import { useEffect, useMemo, useState } from 'react'
import { Armchair, Banknote, CalendarClock, CircleCheck, Receipt, TrendingUp, UserCheck, Users, Wallet } from 'lucide-react'
import { useStore } from '../store'
import { byEmployee, byHour, daily, inRange, parseDay, presetRange, revenue, summary, type Preset } from '../lib/calc'
import { revenueTotals } from '../lib/api'
import { Bars3D, Floor3D } from '../components/Three3D'
import { Card, Kpi, RangePicker, useRange } from '../components/ui'
import { TxTable } from './Transactions'

export default function Dashboard() {
  const { state, i18n } = useStore()
  const { t } = i18n
  const [range, setRange] = useRange('30d')
  const { visits, seats } = state

  const k = useMemo(() => {
    const today = summary(inRange(visits, presetRange('today')))
    const month = summary(inRange(visits, presetRange('month')))
    return { today, week: revenue(inRange(visits, presetRange('week'))), month }
  }, [visits])

  const ranged = useMemo(() => inRange(visits, range), [visits, range])
  const days = useMemo(() => daily(ranged, range), [ranged, range])
  const emp = useMemo(() => byEmployee(ranged, state.employees), [ranged, state.employees])
  const hours = useMemo(() => byHour(ranged), [ranged])
  const recent = useMemo(() => [...visits].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, 8), [visits])

  const occupied = seats.filter((s) => s.status === 'occupied').length
  const available = seats.filter((s) => s.status === 'available').length
  // Chart data is memoized so the 3D scenes rebuild only when the numbers change.
  const charts = useMemo(() => {
    const day = (d: string) => i18n.shortDay(parseDay(d))
    const first = Math.max(0, hours.findIndex((h) => h > 0))
    const last = Math.max(first, 23 - [...hours].reverse().findIndex((h) => h > 0))
    return {
      revenue: days.map((d) => ({ label: day(d.day), value: d.revenue })),
      visits: days.map((d) => ({ label: day(d.day), value: d.visits })),
      hours: hours.slice(first, last + 1).map((v, i) => ({ label: i18n.hour(first + i), value: v })),
      empRevenue: emp.map((e) => ({ label: e.employee.name, value: e.revenue })),
      empVisits: [...emp].sort((a, b) => b.visits - a.visits).map((e) => ({ label: e.employee.name, value: e.visits })),
    }
  }, [days, hours, emp, i18n])

  return (
    <div className="stack">
      <div className="kpis">
        <Kpi icon={Banknote} label={t('d.revenueToday')} value={i18n.money(k.today.revenue)} />
        <Kpi icon={Wallet} label={t('d.revenueWeek')} value={i18n.money(k.week)} />
        <Kpi icon={TrendingUp} label={t('d.revenueMonth')} value={i18n.money(k.month.revenue)} />
        <Kpi icon={Users} label={t('d.visitsToday')} value={i18n.num(k.today.visits)} />
        <Kpi icon={Receipt} label={t('d.avg')} value={i18n.money(Math.round(k.month.avg))} sub={t('r.month')} />
        <Kpi icon={Armchair} label={t('d.occupied')} value={i18n.num(occupied)} sub={t('d.ofSeats', { n: seats.length })} />
        <Kpi icon={CircleCheck} label={t('d.available')} value={i18n.num(available)} sub={t('d.ofSeats', { n: seats.length })} />
        <Kpi icon={UserCheck} label={t('d.activeEmployees')} value={i18n.num(state.employees.filter((e) => e.active).length)} />
      </div>

      <MethodTotals />

      <Card title={t('d.floor3d')} sub={t('d.floor3dHint')}>
        <Floor3D onSelect={() => (location.hash = '#/op')} />
      </Card>

      <div className="toolbar">
        <span className="muted">
          <CalendarClock size={16} aria-hidden /> {t('d.chartsFor')}
        </span>
        <RangePicker value={range} onChange={setRange} />
      </div>

      {ranged.length === 0 ? (
        <Card>
          <p className="muted">{t('d.noData')}</p>
        </Card>
      ) : (
        <div className="grid-charts">
          <Card title={t('d.revenueOverTime')} sub={t('d.drag')} className="span-2">
            <Bars3D label={t('d.revenueOverTime')} data={charts.revenue} format={i18n.money} height={300} />
          </Card>
          <Card title={t('d.visitsOverTime')}>
            <Bars3D label={t('d.visitsOverTime')} data={charts.visits} format={i18n.num} />
          </Card>
          <Card title={t('d.busyHours')} sub={t('d.busyHoursHint')}>
            <Bars3D label={t('d.busyHours')} data={charts.hours} format={i18n.num} />
          </Card>
          <Card title={t('d.revenueByEmployee')}>
            <Bars3D label={t('d.revenueByEmployee')} data={charts.empRevenue} format={i18n.money} />
          </Card>
          <Card title={t('d.visitsByEmployee')}>
            <Bars3D label={t('d.visitsByEmployee')} data={charts.empVisits} format={i18n.num} />
          </Card>
        </div>
      )}

      <Card
        title={t('d.recent')}
        actions={
          <a className="btn ghost" href="#/transactions">
            {t('d.viewAll')}
          </a>
        }
      >
        <TxTable rows={recent} />
      </Card>
    </div>
  )
}

const PERIODS: Preset[] = ['today', 'week', 'month']

/** Cash, wallet and total revenue for a day, week or month, summed on the server from the saved transactions. */
function MethodTotals() {
  const { state, i18n } = useStore()
  const { t } = i18n
  const [period, setPeriod] = useState<Preset>('today')
  const [totals, setTotals] = useState<Awaited<ReturnType<typeof revenueTotals>> | null>(null)
  useEffect(() => {
    let live = true
    revenueTotals(presetRange(period))
      .then((r) => live && setTotals(r))
      .catch(() => live && setTotals(null))
    return () => {
      live = false
    }
    // Refetch after any change to transactions (each save or live update reloads the visit list).
  }, [period, state.visits])
  const show = (n?: number) => (totals ? i18n.money(n ?? 0) : '…')
  return (
    <Card
      title={t('d.byMethod')}
      sub={t('d.fromServer')}
      actions={
        <div className="segmented" role="group" aria-label={t('c.range')}>
          {PERIODS.map((p) => (
            <button key={p} className={period === p ? 'on' : ''} aria-pressed={period === p} onClick={() => setPeriod(p)}>
              {t(`r.${p}`)}
            </button>
          ))}
        </div>
      }
    >
      <div className="kpis cols-3">
        <Kpi icon={Banknote} label={t('d.cash')} value={show(totals?.cash)} />
        <Kpi icon={Wallet} label={t('d.wallet')} value={show(totals?.wallet)} />
        <Kpi icon={TrendingUp} label={t('d.total')} value={show(totals?.total)} sub={totals?.other ? t('d.other', { amount: i18n.money(totals.other) }) : undefined} />
      </div>
    </Card>
  )
}
