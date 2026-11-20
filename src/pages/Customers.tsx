import { useMemo, useState } from 'react'
import { Search, Users } from 'lucide-react'
import { useStore } from '../store'
import { customerStats, summary } from '../lib/calc'
import { Card, Empty, Modal, VisitBadge } from '../components/ui'
import { useTxRows } from './Transactions'
import type { Customer } from '../types'

const STEP = 25

export default function Customers() {
  const { state, i18n } = useStore()
  const { t } = i18n
  const [q, setQ] = useState('')
  const [limit, setLimit] = useState(STEP)
  const [open, setOpen] = useState<Customer | null>(null)

  const stats = useMemo(() => customerStats(state.customers, state.visits), [state.customers, state.visits])
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const digits = needle.replace(/\D/g, '')
    return state.customers
      .filter((c) => !needle || c.name.toLowerCase().includes(needle) || (digits && c.phone.includes(digits)))
      .map((c) => ({ c, s: stats.get(c.id)! }))
      .sort((a, b) => b.s.last.localeCompare(a.s.last))
  }, [state.customers, stats, q])

  if (state.customers.length === 0) return <Empty icon={Users} title={t('cu.empty')} hint={t('cu.emptyHint')} />

  return (
    <div className="stack">
      <div className="filters">
        <label className="search">
          <Search size={16} aria-hidden />
          <span className="sr-only">{t('c.search')}</span>
          <input
            type="search"
            placeholder={t('cu.searchPh')}
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              setLimit(STEP)
            }}
          />
        </label>
        <span className="muted">{i18n.num(rows.length)}</span>
      </div>
      <Card>
        {rows.length === 0 ? (
          <Empty icon={Search} title={t('c.noResults')} hint={t('c.noResultsHint')} />
        ) : (
          <>
            <div className="table-wrap">
              <table className="rtable">
                <thead>
                  <tr>
                    <th scope="col">{t('c.name')}</th>
                    <th scope="col">{t('c.phone')}</th>
                    <th scope="col" className="num">
                      {t('cu.visits')}
                    </th>
                    <th scope="col">{t('cu.lastVisit')}</th>
                    <th scope="col" className="num">
                      {t('cu.spent')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, limit).map(({ c, s }) => (
                    <tr key={c.id}>
                      <td data-label={t('c.name')}>
                        <button className="link" onClick={() => setOpen(c)}>
                          {c.name}
                        </button>
                      </td>
                      <td data-label={t('c.phone')} dir="ltr" className="phone">
                        {c.phone || t('c.none')}
                      </td>
                      <td data-label={t('cu.visits')} className="num">
                        {i18n.num(s.visits)}
                      </td>
                      <td data-label={t('cu.lastVisit')}>{s.last ? i18n.date(s.last) : t('c.none')}</td>
                      <td data-label={t('cu.spent')} className="num">
                        {i18n.money(s.spent)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rows.length > limit && (
              <div className="table-foot">
                <span className="muted">{t('c.showing', { a: 1, b: limit, n: rows.length })}</span>
                <button className="btn" onClick={() => setLimit(limit + STEP)}>
                  {t('c.more')}
                </button>
              </div>
            )}
          </>
        )}
      </Card>
      <Modal open={!!open} onClose={() => setOpen(null)} title={open?.name ?? ''} wide>
        {open && <CustomerDetails customer={open} />}
      </Modal>
    </div>
  )
}

function CustomerDetails({ customer }: { customer: Customer }) {
  const { state, i18n } = useStore()
  const { t } = i18n
  const visits = useMemo(
    () => state.visits.filter((v) => v.customerId === customer.id).sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
    [state.visits, customer.id],
  )
  const rows = useTxRows(visits)
  const s = summary(visits)
  return (
    <div className="stack">
      <dl className="details">
        <div>
          <dt>{t('c.phone')}</dt>
          <dd dir="ltr">{customer.phone || t('c.none')}</dd>
        </div>
        <div>
          <dt>{t('cu.since')}</dt>
          <dd>{i18n.date(customer.createdAt)}</dd>
        </div>
        <div>
          <dt>{t('cu.visits')}</dt>
          <dd>{i18n.num(s.visits)}</dd>
        </div>
        <div>
          <dt>{t('cu.spent')}</dt>
          <dd>{i18n.money(s.revenue)}</dd>
        </div>
      </dl>
      <h3>{t('cu.history')}</h3>
      {rows.length === 0 ? (
        <p className="muted">{t('cu.noVisits')}</p>
      ) : (
        <ul className="history">
          {rows.map((r) => (
            <li key={r.v.id}>
              <div>
                <strong>{r.service}</strong>
                <span className="muted small block">
                  {i18n.dateTime(r.v.startedAt)} · {r.employee} · {r.seat}
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
