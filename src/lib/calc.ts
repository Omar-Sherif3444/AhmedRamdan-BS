// All money and date math lives here so pages never re-derive it differently.
import type { Customer, DateRange, Employee, Expense, Visit } from '../types'

const pad = (n: number) => String(n).padStart(2, '0')
export const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const parseDay = (k: string) => {
  const [y, m, d] = k.split('-').map(Number)
  return new Date(y, m - 1, d)
}
export const addDays = (d: Date, n: number) => {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

/** Cancelled visits were refunded, so they never count as revenue. */
export const isPaid = (v: Visit) => v.status !== 'cancelled'
export const revenue = (vs: Visit[]) => vs.reduce((s, v) => (isPaid(v) ? s + v.amount : s), 0)

export const inRange = (vs: Visit[], r: DateRange) =>
  vs.filter((v) => {
    const k = dayKey(new Date(v.startedAt))
    return k >= r.from && k <= r.to
  })

export type Preset = 'today' | 'week' | 'month' | '7d' | '30d' | '90d'

/** Weeks start on Saturday, as in Egypt. */
export function presetRange(p: Preset, now = new Date()): DateRange {
  const to = dayKey(now)
  if (p === 'today') return { from: to, to }
  if (p === 'week') return { from: dayKey(addDays(now, -((now.getDay() + 1) % 7))), to }
  if (p === 'month') return { from: dayKey(new Date(now.getFullYear(), now.getMonth(), 1)), to }
  return { from: dayKey(addDays(now, -(parseInt(p) - 1))), to }
}

export function summary(vs: Visit[]) {
  const paid = vs.filter(isPaid)
  const rev = revenue(paid)
  return {
    revenue: rev,
    visits: paid.length,
    avg: paid.length ? rev / paid.length : 0,
    cancelled: vs.length - paid.length,
    customers: new Set(paid.map((v) => v.customerId)).size,
  }
}

export function daily(vs: Visit[], r: DateRange) {
  const rows = new Map<string, { day: string; revenue: number; visits: number }>()
  for (let d = parseDay(r.from); dayKey(d) <= r.to; d = addDays(d, 1)) {
    const k = dayKey(d)
    rows.set(k, { day: k, revenue: 0, visits: 0 })
  }
  for (const v of vs) {
    const row = rows.get(dayKey(new Date(v.startedAt)))
    if (row && isPaid(v)) {
      row.revenue += v.amount
      row.visits++
    }
  }
  return [...rows.values()]
}

export function byHour(vs: Visit[]) {
  const hours = Array<number>(24).fill(0)
  for (const v of vs) if (isPaid(v)) hours[new Date(v.startedAt).getHours()]++
  return hours
}

export function byEmployee(vs: Visit[], employees: Employee[]) {
  const total = revenue(vs)
  return employees
    .map((e) => {
      const mine = vs.filter((v) => v.employeeId === e.id)
      const s = summary(mine)
      return { employee: e, ...s, share: total ? s.revenue / total : 0 }
    })
    .filter((r) => r.employee.active || r.visits > 0)
    .sort((a, b) => b.revenue - a.revenue)
}

export function customerStats(customers: Customer[], vs: Visit[]) {
  const stats = new Map(customers.map((c) => [c.id, { visits: 0, spent: 0, last: '' }]))
  for (const v of vs) {
    const s = stats.get(v.customerId)
    if (!s || !isPaid(v)) continue
    s.visits++
    s.spent += v.amount
    if (v.startedAt > s.last) s.last = v.startedAt
  }
  return stats
}

export function toCSV(rows: (string | number)[][]) {
  return rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n')
}

export function downloadCSV(name: string, rows: (string | number)[][]) {
  // BOM so Excel opens Arabic text as UTF-8.
  const blob = new Blob(['﻿' + toCSV(rows)], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${name}.csv`
  a.click()
  URL.revokeObjectURL(a.href)
}

/** First day of the month as yyyy-mm-01. */
export const monthStart = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`

export const expensesInRange = (es: Expense[], r: DateRange) =>
  es.filter((e) => {
    const k = dayKey(new Date(e.spentAt))
    return k >= r.from && k <= r.to
  })

/** Shop expenses are operating costs; personal expenses are reported apart and never added to them. */
export function expenseTotals(es: Expense[]) {
  let shop = 0
  let personal = 0
  for (const e of es) {
    if (e.kind === 'shop') shop += e.amount
    else personal += e.amount
  }
  return { shop, personal }
}
