import { test } from 'node:test'
import assert from 'node:assert/strict'
import { daily, expenseTotals, monthStart, presetRange, revenue, summary, toCSV } from './calc.ts'
import { reducer } from './reducer.ts'
import { seed } from './seed.ts'
import type { State } from '../types'

const state = (): State => ({
  ...seed(new Date(2026, 9, 25, 20, 0)),
  settings: { shopName: 'x', currency: 'EGP', lang: 'ar' },
  currentUserId: 'e1',
  signedIn: true,
  customerId: null,
  notices: [],
})

test('revenue ignores cancelled visits', () => {
  const s = state()
  const paid = s.visits.filter((v) => v.status !== 'cancelled')
  assert.equal(revenue(s.visits), paid.reduce((a, v) => a + v.amount, 0))
  assert.equal(summary(s.visits).visits, paid.length)
})

test('daily totals add up to the range revenue', () => {
  const s = state()
  const r = presetRange('30d', new Date(2026, 9, 25))
  const rows = daily(s.visits, r)
  assert.equal(rows.length, 30)
  const inside = s.visits.filter((v) => rows.some((d) => v.startedAt && new Date(v.startedAt).toDateString() === new Date(d.day + 'T00:00').toDateString()))
  assert.equal(rows.reduce((a, d) => a + d.revenue, 0), revenue(inside))
})

test('week starts on Saturday', () => {
  assert.equal(presetRange('week', new Date(2026, 9, 25)).from, '2026-10-24') // Sun 25 Oct -> Sat 24 Oct
})

test('register, complete with expected next keeps the seat reserved', () => {
  let s = state()
  const now = new Date().toISOString()
  s = reducer(s, { type: 'register', seatId: 'c3', name: 'Test', phone: '', employeeId: 'e2', serviceId: 'sv1', amount: 120, method: 'cash', expectNext: true, now })
  const seat = s.seats.find((x) => x.id === 'c3')!
  assert.equal(seat.status, 'occupied')
  const before = revenue(s.visits)
  s = reducer(s, { type: 'complete', seatId: 'c3', now })
  assert.equal(s.seats.find((x) => x.id === 'c3')!.status, 'reserved')
  assert.equal(revenue(s.visits), before)
  s = reducer(s, { type: 'cancelReservation', seatId: 'c3' })
  assert.equal(s.seats.find((x) => x.id === 'c3')!.status, 'available')
})

test('release cancels the visit and frees the seat', () => {
  let s = state()
  const visitId = s.seats.find((x) => x.id === 'c2')!.visitId!
  const before = revenue(s.visits)
  const amount = s.visits.find((v) => v.id === visitId)!.amount
  s = reducer(s, { type: 'release', seatId: 'c2', now: new Date().toISOString() })
  assert.equal(s.seats.find((x) => x.id === 'c2')!.status, 'available')
  assert.equal(revenue(s.visits), before - amount)
})

test('occupied seats cannot go out of service; returning customer matched by phone', () => {
  let s = state()
  assert.equal(reducer(s, { type: 'outOfService', seatId: 'c1' }), s)
  const c = s.customers.find((x) => x.phone)!
  const n = s.customers.length
  s = reducer(s, { type: 'register', seatId: 's2', name: 'other spelling', phone: c.phone, employeeId: 'e2', serviceId: 'sv1', amount: 1, method: 'cash', expectNext: false, now: new Date().toISOString() })
  assert.equal(s.customers.length, n)
})

test('csv escapes quotes', () => {
  assert.equal(toCSV([['a"b', 1]]), '"a""b","1"')
})

test('session and data actions keep local preferences', () => {
  let s = state()
  s = reducer(s, { type: 'session', staffId: 'e2', customerId: null })
  assert.equal(s.signedIn, true)
  assert.equal(s.currentUserId, 'e2')
  const { seats, employees, customers, services } = state()
  s = reducer(s, { type: 'data', data: { seats, employees, customers, services, visits: [], expenses: [], absences: [], holidays: [], wages: [], deductions: [] }, shop: { shopName: 'Live', currency: 'USD' } })
  assert.equal(s.visits.length, 0)
  assert.deepEqual([s.settings.shopName, s.settings.currency, s.settings.lang], ['Live', 'USD', 'ar'])
  s = reducer(s, { type: 'session', staffId: null, customerId: null })
  assert.equal(s.signedIn, false)
})

test('register sets and complete clears the public since time', () => {
  let s = state()
  const now = new Date().toISOString()
  s = reducer(s, { type: 'register', seatId: 'c3', name: 'Test', phone: '', employeeId: 'e2', serviceId: 'sv1', amount: 120, method: 'cash', expectNext: false, now })
  assert.equal(s.seats.find((x) => x.id === 'c3')!.since, now)
  s = reducer(s, { type: 'complete', seatId: 'c3', now })
  assert.equal(s.seats.find((x) => x.id === 'c3')!.since, undefined)
})

test('shop and personal expenses are totalled separately', () => {
  const e = (kind: 'shop' | 'personal', amount: number) => ({ id: kind + amount, employeeId: 'e2', kind, amount, description: 'x', spentAt: '2026-10-01T10:00:00Z', createdAt: '' })
  assert.deepEqual(expenseTotals([e('shop', 50), e('personal', 20), e('shop', 30)]), { shop: 80, personal: 20 })
})

test('monthStart', () => {
  assert.equal(monthStart(new Date(2026, 10, 6)), '2026-11-01')
})

test('absences: one active record per employee and day', () => {
  let s = state()
  const now = new Date().toISOString()
  s = reducer(s, { type: 'saveAbsence', employeeId: 'e2', day: '2026-10-07', reason: '', now })
  const again = reducer(s, { type: 'saveAbsence', employeeId: 'e2', day: '2026-10-07', reason: 'dup', now })
  assert.equal(again, s)
  s = reducer(s, { type: 'cancelAbsence', id: s.absences[0].id, now })
  s = reducer(s, { type: 'saveAbsence', employeeId: 'e2', day: '2026-10-07', reason: 'again', now })
  assert.equal(s.absences.filter((a) => !a.cancelledAt).length, 1)
})
