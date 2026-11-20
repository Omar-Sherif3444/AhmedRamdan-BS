// Pure state transitions, applied immediately for a responsive UI. The store also sends each action to
// Supabase (lib/api.ts) and then reloads, so the server stays the source of truth.
import type { Data, Employee, ExpenseKind, Notice, PaymentMethod, Seat, Service, Settings, State, Visit } from '../types'

export type Action =
  | {
      type: 'register'
      seatId: string
      /** Optional: an empty name becomes "عميل N" on the server. */
      name: string
      phone?: string
      employeeId: string
      /** Everything being done for this customer. The server prices it. */
      serviceIds: string[]
      /** Only set when correcting a price; otherwise the service prices decide. */
      amount?: number
      method: PaymentMethod
      expectNext?: boolean
      now: string
    }
  | { type: 'complete' | 'release'; seatId: string; now: string }
  /** Undo of a Done: the completed visit goes back in progress on its seat. */
  | { type: 'reopen'; visitId: string }
  | { type: 'setExpectNext'; seatId: string; value: boolean }
  | { type: 'reserve' | 'cancelReservation' | 'outOfService' | 'restore'; seatId: string }
  | { type: 'waitingBump'; delta: 1 | -1 }
  | { type: 'undoLast' }
  | { type: 'updatePayment'; visitId: string; amount: number; method: PaymentMethod }
  | { type: 'updateVisit'; visitId: string; employeeId: string; serviceId: string; amount: number; method: PaymentMethod }
  | { type: 'deleteVisit'; visitId: string }
  | { type: 'seatLabel'; seatId: string; label: string }
  | { type: 'saveEmployee'; employee: Employee }
  | { type: 'toggleEmployee'; id: string }
  | { type: 'saveService'; service: Service }
  | { type: 'settings'; patch: Partial<Settings> }
  | { type: 'session'; staffId: string | null }
  | { type: 'data'; data: Data; shop: Pick<Settings, 'shopName' | 'currency'> }
  | { type: 'readNotices' }
  | { type: 'addExpense'; amount: number; kind: ExpenseKind; description: string; spentAt?: string; employeeId: string; now: string }
  | { type: 'updateExpense'; id: string; amount: number; kind: ExpenseKind; description: string; spentAt: string }
  | { type: 'deleteExpense'; id: string }
  | { type: 'saveAbsence'; id?: string; employeeId: string; day: string; reason: string; now: string }
  | { type: 'cancelAbsence'; id: string; now: string }
  | { type: 'saveHoliday'; day: string; name: string }
  | { type: 'deleteHoliday'; day: string }
  | { type: 'addDeduction'; employeeId: string; month: string; amount: number; reason: string; now: string }
  | { type: 'cancelDeduction'; id: string; now: string }
  | { type: 'paySalary'; employeeId: string; month: string }

const id = () => crypto.randomUUID().slice(0, 8)

function notice(s: State, key: string, params: Record<string, string> = {}): State {
  const n: Notice = { id: id(), key, params, at: new Date().toISOString(), read: false }
  return { ...s, notices: [n, ...s.notices].slice(0, 20) }
}

const setSeat = (s: State, seatId: string, patch: Partial<Seat>): State => ({
  ...s,
  seats: s.seats.map((x) => (x.id === seatId ? { ...x, ...patch } : x)),
})
const setVisit = (s: State, visitId: string | undefined, patch: Partial<Visit>): State => ({
  ...s,
  visits: s.visits.map((v) => (v.id === visitId ? { ...v, ...patch } : v)),
})
const upsert = <T extends { id: string }>(list: T[], item: T) =>
  list.some((x) => x.id === item.id) ? list.map((x) => (x.id === item.id ? item : x)) : [...list, item]

export function reducer(s: State, a: Action): State {
  const seat = 'seatId' in a ? s.seats.find((x) => x.id === a.seatId) : undefined
  const seatParam: Record<string, string> = seat ? { seat: seat.id } : {}

  switch (a.type) {
    case 'register': {
      if (!seat || (seat.status !== 'available' && seat.status !== 'reserved')) return s
      const name = a.name.trim()
      const phone = (a.phone ?? '').trim()
      // Same matching as the register_visit function: by phone, else by exact name.
      let customer =
        (phone && s.customers.find((c) => c.phone === phone)) ||
        s.customers.find((c) => c.name.trim().toLowerCase() === name.toLowerCase() && (!phone || !c.phone))
      let customers = s.customers
      if (!customer) {
        customer = { id: id(), name, phone, createdAt: a.now }
        customers = [...customers, customer]
      } else if (phone && !customer.phone) {
        customer = { ...customer, phone }
        customers = upsert(customers, customer)
      }
      const visit: Visit = {
        id: id(),
        customerId: customer.id,
        employeeId: a.employeeId,
        seatId: seat.id,
        serviceId: a.serviceIds[0] ?? '',
        serviceIds: a.serviceIds,
        // Optimistic only: the server recomputes this from the catalogue prices.
        amount: a.amount ?? a.serviceIds.reduce((t, sid) => t + (s.services.find((x) => x.id === sid)?.price ?? 0), 0),
        method: a.method,
        status: 'in_progress',
        startedAt: a.now,
        expectNext: a.expectNext ?? false,
      }
      const next = setSeat({ ...s, customers, visits: [...s.visits, visit] }, seat.id, {
        status: 'occupied',
        visitId: visit.id,
        since: a.now,
      })
      return notice(next, 'n.registered', { ...seatParam, customer: name })
    }
    case 'complete':
    case 'release': {
      if (!seat || seat.status !== 'occupied') return s
      const visit = s.visits.find((v) => v.id === seat.visitId)
      const done = a.type === 'complete'
      const next = setVisit(s, seat.visitId, { status: done ? 'completed' : 'cancelled', endedAt: a.now })
      // Completing keeps the seat held when another customer is expected; releasing always frees it.
      const status = done && visit?.expectNext ? 'reserved' : 'available'
      return notice(setSeat(next, seat.id, { status, visitId: undefined, since: undefined }), done ? 'n.completed' : 'n.released', seatParam)
    }
    case 'reopen': {
      const v = s.visits.find((x) => x.id === a.visitId)
      const at = v && s.seats.find((x) => x.id === v.seatId)
      if (!v || v.status !== 'completed' || !at || (at.status !== 'available' && at.status !== 'reserved')) return s
      return setSeat(setVisit(s, v.id, { status: 'in_progress', endedAt: undefined }), at.id, { status: 'occupied', visitId: v.id, since: v.startedAt })
    }
    case 'setExpectNext':
      return seat?.status === 'occupied' ? setVisit(s, seat.visitId, { expectNext: a.value }) : s
    case 'reserve':
      return seat?.status === 'available' ? setSeat(s, seat.id, { status: 'reserved' }) : s
    case 'cancelReservation':
      return seat?.status === 'reserved' ? setSeat(s, seat.id, { status: 'available' }) : s
    // The waiting count is a server-side sum of today's events; these are optimistic only.
    case 'waitingBump':
      return { ...s, waiting: Math.max(0, s.waiting + a.delta) }
    case 'undoLast':
      return s
    case 'outOfService':
      if (!seat || seat.status === 'occupied') return s
      return notice(setSeat(s, seat.id, { status: 'out_of_service' }), 'n.outOfService', seatParam)
    case 'restore':
      return seat?.status === 'out_of_service' ? setSeat(s, seat.id, { status: 'available' }) : s
    case 'updatePayment':
      return setVisit(s, a.visitId, { amount: a.amount, method: a.method })
    case 'updateVisit':
      return setVisit(s, a.visitId, { employeeId: a.employeeId, serviceId: a.serviceId, amount: a.amount, method: a.method })
    case 'deleteVisit':
      // Same as delete_visit: a seat held by the visit becomes available.
      return {
        ...s,
        visits: s.visits.filter((v) => v.id !== a.visitId),
        seats: s.seats.map((x) => (x.visitId === a.visitId ? { ...x, status: 'available', visitId: undefined, since: undefined } : x)),
      }
    case 'seatLabel':
      return setSeat(s, a.seatId, { label: a.label.trim() })
    case 'saveEmployee':
      return { ...s, employees: upsert(s.employees, a.employee) }
    case 'toggleEmployee': {
      const e = s.employees.find((x) => x.id === a.id)
      // The admin and the signed-in user stay active so the shop always has someone in charge.
      if (!e || e.role === 'admin' || e.id === s.currentUserId) return s
      return { ...s, employees: upsert(s.employees, { ...e, active: !e.active }) }
    }
    case 'saveService':
      return { ...s, services: upsert(s.services, a.service) }
    case 'settings':
      return { ...s, settings: { ...s.settings, ...a.patch } }
    case 'session':
      return { ...s, signedIn: !!a.staffId, currentUserId: a.staffId ?? '' }
    case 'data':
      return { ...s, ...a.data, settings: { ...s.settings, ...a.shop } }
    case 'readNotices':
      return { ...s, notices: s.notices.map((n) => ({ ...n, read: true })) }
    // Expenses, attendance and payroll: the server validates and the reload brings the final rows.
    case 'addExpense':
      return {
        ...s,
        expenses: [
          { id: id(), employeeId: a.employeeId, kind: a.kind, amount: a.amount, description: a.description.trim(), spentAt: a.spentAt ?? a.now, createdAt: a.now },
          ...s.expenses,
        ],
      }
    case 'updateExpense':
      return { ...s, expenses: s.expenses.map((x) => (x.id === a.id ? { ...x, amount: a.amount, kind: a.kind, description: a.description.trim(), spentAt: a.spentAt } : x)) }
    case 'deleteExpense':
      return { ...s, expenses: s.expenses.filter((x) => x.id !== a.id) }
    case 'saveAbsence': {
      // One active absence per employee and day.
      if (s.absences.some((x) => !x.cancelledAt && x.id !== a.id && x.employeeId === a.employeeId && x.day === a.day)) return s
      const row = { id: a.id ?? id(), employeeId: a.employeeId, day: a.day, reason: a.reason.trim(), createdAt: a.now }
      return { ...s, absences: a.id ? s.absences.map((x) => (x.id === a.id ? { ...x, ...row, createdAt: x.createdAt } : x)) : [row, ...s.absences] }
    }
    case 'cancelAbsence':
      return { ...s, absences: s.absences.map((x) => (x.id === a.id ? { ...x, cancelledAt: a.now } : x)) }
    case 'saveHoliday':
      return { ...s, holidays: [...s.holidays.filter((h) => h.day !== a.day), { day: a.day, name: a.name.trim() }].sort((x, y) => x.day.localeCompare(y.day)) }
    case 'deleteHoliday':
      return { ...s, holidays: s.holidays.filter((h) => h.day !== a.day) }
    case 'addDeduction':
      return { ...s, deductions: [{ id: id(), employeeId: a.employeeId, month: a.month, amount: a.amount, reason: a.reason.trim(), createdAt: a.now }, ...s.deductions] }
    case 'cancelDeduction':
      return { ...s, deductions: s.deductions.map((x) => (x.id === a.id ? { ...x, cancelledAt: a.now } : x)) }
    case 'paySalary':
      return s
  }
}

export const newId = id
