// Data layer: loads the shop from Supabase, sends each reducer action to its server function, and handles sign-in.
import { supabase } from './supabase'
import { normEmail } from './auth'
import type { Action } from './reducer'
import type { Key } from '../i18n'
import type { Absence, Customer, Data, DateRange, Deduction, Employee, Expense, Holiday, PayrollRow, Seat, Service, Settings, State, Visit, WageRate } from '../types'

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>

const seat = (r: Row): Seat => ({ id: r.id, kind: r.kind, number: r.number, status: r.status, label: r.label, visitId: r.visit_id ?? undefined, since: r.since ?? undefined })
const employee = (r: Row): Employee => ({ id: r.id, name: r.name, role: r.role, phone: r.phone, active: r.active, joinedAt: r.joined_at, email: r.email, daysOff: r.days_off ?? [] })
const expense = (r: Row): Expense => ({ id: r.id, employeeId: r.employee_id, kind: r.kind, amount: Number(r.amount), description: r.description, spentAt: r.spent_at, createdAt: r.created_at, updatedAt: r.updated_at ?? undefined })
const absence = (r: Row): Absence => ({ id: r.id, employeeId: r.employee_id, day: r.day, reason: r.reason, createdAt: r.created_at, cancelledAt: r.cancelled_at ?? undefined })
const holiday = (r: Row): Holiday => ({ day: r.day, name: r.name })
const wage = (r: Row): WageRate => ({ employeeId: r.employee_id, dailyWage: Number(r.daily_wage), effectiveFrom: r.effective_from })
const deduction = (r: Row): Deduction => ({ id: r.id, employeeId: r.employee_id, month: r.month, amount: Number(r.amount), reason: r.reason, createdAt: r.created_at, cancelledAt: r.cancelled_at ?? undefined })
const customer = (r: Row): Customer => ({ id: r.id, name: r.name, phone: r.phone, createdAt: r.created_at })
const service = (r: Row): Service => ({ id: r.id, nameAr: r.name_ar, nameEn: r.name_en, price: Number(r.price), active: r.active })
const visit = (r: Row): Visit => ({
  id: r.id,
  customerId: r.customer_id,
  employeeId: r.employee_id,
  seatId: r.seat_id,
  serviceId: r.service_id ?? '',
  // Filled from visit_services by loadData; a visit always has at least one.
  serviceIds: r.serviceIds ?? (r.service_id ? [r.service_id] : []),
  amount: Number(r.amount),
  method: r.method,
  status: r.status,
  startedAt: r.started_at,
  endedAt: r.ended_at ?? undefined,
  expectNext: r.expect_next,
})

/** Supabase returns at most 1000 rows per request, so page through bigger tables. */
async function all(table: string, build: (q: any) => any = (q) => q): Promise<Row[]> {
  const rows: Row[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(supabase.from(table).select('*')).range(from, from + 999)
    if (error) throw error
    rows.push(...data)
    if (data.length < 1000) return rows
  }
}

export async function loadData(): Promise<{ data: Data; shop: Pick<Settings, 'shopName' | 'currency'> }> {
  // shortcut: the browser loads ~13 months of visits for the dashboard; move reports to server-side aggregates once history is much larger.
  const since = new Date(Date.now() - 400 * 864e5).toISOString()
  // Row-level security decides what comes back: the owner gets everything, an employee only their own records.
  const [settings, seats, services, staff, customers, visits, expenses, absences, holidays, wages, deductions, visitServices, waiting] = await Promise.all([
    supabase.from('settings').select('*').single(),
    all('seats', (q) => q.order('kind', { ascending: false }).order('number')),
    all('services', (q) => q.order('created_at')),
    all('staff', (q) => q.order('joined_at')),
    all('customers'),
    all('visits', (q) => q.or(`started_at.gte.${since},status.eq.in_progress`).order('started_at')),
    all('expenses', (q) => q.gte('spent_at', since).order('spent_at', { ascending: false })),
    all('absences', (q) => q.order('day', { ascending: false })),
    all('holidays', (q) => q.order('day')),
    all('wage_rates', (q) => q.order('effective_from')),
    all('salary_deductions', (q) => q.order('created_at', { ascending: false })),
    all('visit_services'),
    supabase.rpc('waiting_count'),
  ])
  // Group the join rows once, so each visit carries every service that was done.
  const byVisit = new Map<string, string[]>()
  for (const r of visitServices) {
    const list = byVisit.get(r.visit_id)
    if (list) list.push(r.service_id)
    else byVisit.set(r.visit_id, [r.service_id])
  }
  const wageRows = wages.map(wage)
  // Rates are ordered oldest first and never start in the future, so the last one is the current wage.
  const current = new Map(wageRows.map((w) => [w.employeeId, w.dailyWage]))
  if (settings.error) throw settings.error
  return {
    data: {
      seats: seats.map(seat),
      services: services.map(service),
      employees: staff.map((r) => ({ ...employee(r), dailyWage: current.get(r.id) })),
      customers: customers.map(customer),
      visits: visits.map((r) => visit({ ...r, serviceIds: byVisit.get(r.id) })),
      expenses: expenses.map(expense),
      absences: absences.map(absence),
      holidays: holidays.map(holiday),
      wages: wageRows,
      deductions: deductions.map(deduction),
      waiting: Number(waiting.data ?? 0),
    },
    shop: { shopName: settings.data.shop_name, currency: settings.data.currency },
  }
}

const isUuid = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)

async function rpc(fn: string, args: Row) {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw error
  return data
}

/** Revenue by payment method, summed on the server from stored transactions (the owner gets the shop, others their own). */
export async function revenueTotals(r: DateRange) {
  const rows = (await rpc('revenue_totals', { p_from: r.from, p_to: r.to })) as Row[]
  const x = rows[0] ?? {}
  return { cash: Number(x.cash ?? 0), wallet: Number(x.wallet ?? 0), other: Number(x.other ?? 0), total: Number(x.total ?? 0), visits: Number(x.visits ?? 0) }
}

/** Monthly payroll calculated on the server. month: yyyy-mm-01. */
export async function fetchPayroll(month: string): Promise<PayrollRow[]> {
  const rows = (await rpc('payroll', { p_month: month })) as Row[]
  return rows.map((r) => ({
    employeeId: r.employee_id,
    name: r.name,
    dailyWage: Number(r.daily_wage),
    eligibleDays: r.eligible_days,
    absenceDays: r.absence_days,
    payableDays: r.payable_days,
    gross: Number(r.gross),
    deductions: Number(r.deductions),
    net: Number(r.net),
    status: r.status,
    paidAt: r.paid_at ?? undefined,
  }))
}

const staffPay = (id: string, e: Employee) =>
  rpc('set_staff_pay', { p_id: id, p_daily_wage: e.dailyWage ?? null, p_joined_at: e.joinedAt, p_days_off: e.daysOff })

async function adminUsers(body: Row) {
  const { data, error } = await supabase.functions.invoke('admin-users', { body })
  if (!error) return data
  // The function's own error code (e.g. email_taken) is in the response body.
  const detail = await (error as { context?: Response }).context?.json?.().catch(() => null)
  throw new Error(detail?.error ?? error.message)
}

const SEAT_STATUS = { reserve: 'reserved', cancelReservation: 'available', outOfService: 'out_of_service', restore: 'available' } as const

/** Sends an action to the server. Returns null for local-only actions (notices, preferences, session). */
export function run(a: Action, before: State): Promise<unknown> | null {
  switch (a.type) {
    case 'register':
      // No amount is sent: the server sums the chosen services' catalogue prices.
      // The operator corrects a price afterwards with `updatePayment`.
      return rpc('register_visit', {
        p_seat: a.seatId,
        p_name: a.name,
        p_phone: a.phone ?? '',
        p_employee: a.employeeId,
        p_services: a.serviceIds,
        p_amount: a.amount ?? null,
        p_method: a.method,
        p_expect_next: a.expectNext ?? false,
      })
    case 'complete':
    case 'release':
      return rpc('end_visit', { p_seat: a.seatId, p_complete: a.type === 'complete' })
    case 'reopen':
      return rpc('reopen_visit', { p_visit: a.visitId })
    case 'setExpectNext':
      return rpc('set_expect_next', { p_seat: a.seatId, p_value: a.value })
    case 'reserve':
    case 'cancelReservation':
    case 'outOfService':
    case 'restore':
      return rpc('set_seat_status', { p_seat: a.seatId, p_status: SEAT_STATUS[a.type] })
    case 'waitingBump':
      return rpc('bump_waiting', { p_delta: a.delta })
    case 'undoLast':
      return rpc('undo_waiting', {})
    case 'updatePayment':
      return rpc('update_payment', { p_visit: a.visitId, p_amount: a.amount, p_method: a.method })
    case 'updateVisit':
      return rpc('update_visit', { p_visit: a.visitId, p_employee: a.employeeId, p_service: a.serviceId || null, p_amount: a.amount, p_method: a.method })
    case 'deleteVisit':
      return rpc('delete_visit', { p_visit: a.visitId })
    case 'seatLabel':
      return rpc('set_seat_label', { p_seat: a.seatId, p_label: a.label })
    case 'saveService': {
      const s = a.service
      return rpc('save_service', { p_id: isUuid(s.id) ? s.id : null, p_name_ar: s.nameAr, p_name_en: s.nameEn, p_price: s.price, p_active: s.active })
    }
    case 'settings':
      if (a.patch.shopName === undefined && a.patch.currency === undefined) return null
      return rpc('save_settings', { p_shop_name: a.patch.shopName ?? before.settings.shopName, p_currency: a.patch.currency ?? before.settings.currency })
    case 'toggleEmployee': {
      const e = before.employees.find((x) => x.id === a.id)
      if (!e) return null
      // Barbers have no login and are saved through their own function.
      if (e.role === 'barber') return rpc('save_barber', { p_id: e.id, p_name: e.name, p_phone: e.phone, p_active: !e.active })
      return rpc('update_staff', { p_id: e.id, p_name: e.name, p_phone: e.phone, p_role: e.role, p_active: !e.active })
    }
    case 'saveEmployee': {
      const e = a.employee
      const old = before.employees.find((x) => x.id === e.id)
      // A barber is a profile, never an auth user: no email, no password, no edge function.
      if (e.role === 'barber')
        return (async () => {
          const id = (await rpc('save_barber', { p_id: old ? e.id : null, p_name: e.name, p_phone: e.phone, p_active: e.active })) as string
          await staffPay(id, e)
        })()
      if (!old)
        return (async () => {
          const created = await adminUsers({ action: 'create', email: e.email, password: e.password, name: e.name, role: e.role, phone: e.phone })
          await staffPay(created.id, e)
        })()
      return (async () => {
        await rpc('update_staff', { p_id: e.id, p_name: e.name, p_phone: e.phone, p_role: e.role, p_active: e.active })
        await staffPay(e.id, e)
        const emailChanged = normEmail(e.email) !== normEmail(old.email)
        if (emailChanged || e.password) {
          await adminUsers({ action: 'update', id: e.id, ...(emailChanged ? { email: e.email } : {}), ...(e.password ? { password: e.password } : {}) })
        }
      })()
    }
    case 'addExpense':
      return rpc('add_expense', { p_amount: a.amount, p_kind: a.kind, p_description: a.description, p_spent_at: a.spentAt ?? null })
    case 'updateExpense':
      return rpc('update_expense', { p_id: a.id, p_amount: a.amount, p_kind: a.kind, p_description: a.description, p_spent_at: a.spentAt })
    case 'deleteExpense':
      return rpc('delete_expense', { p_id: a.id })
    case 'saveAbsence':
      return rpc('save_absence', { p_id: a.id && isUuid(a.id) ? a.id : null, p_employee: a.employeeId, p_day: a.day, p_reason: a.reason })
    case 'cancelAbsence':
      return rpc('cancel_absence', { p_id: a.id })
    case 'saveHoliday':
      return rpc('save_holiday', { p_day: a.day, p_name: a.name })
    case 'deleteHoliday':
      return rpc('delete_holiday', { p_day: a.day })
    case 'addDeduction':
      return rpc('add_deduction', { p_employee: a.employeeId, p_month: a.month, p_amount: a.amount, p_reason: a.reason })
    case 'cancelDeduction':
      return rpc('cancel_deduction', { p_id: a.id })
    case 'paySalary':
      return rpc('pay_salary', { p_employee: a.employeeId, p_month: a.month })
    default:
      return null
  }
}

/** Maps a server error to a translated message key. */
export function errorKey(e: unknown): Key {
  const m = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e)
  if (m.includes('email_taken')) return 'auth.emailTaken'
  if (m.includes('owner_locked')) return 'err.ownerLocked'
  if (m.includes('duplicate_absence')) return 'err.duplicateAbsence'
  if (m.includes('payroll_locked')) return 'err.payrollLocked'
  if (m.includes('already_paid')) return 'err.alreadyPaid'
  if (m.includes('invalid_method')) return 'err.method'
  if (m.includes('forbidden')) return 'err.forbidden'
  if (m.includes('seat_unavailable') || m.includes('seat_not_occupied') || m.includes('invalid_transition')) return 'err.seatChanged'
  return 'err.server'
}

// --- Authentication ----------------------------------------------------------------------

export interface Who {
  staffId: string | null
  /** True for an admin; false for an operator. */
  owner: boolean
}

/** Who the current session belongs to; null when signed out or the account is deactivated. */
export async function resolveSession(): Promise<Who | null> {
  const { data } = await supabase.auth.getSession()
  const uid = data.session?.user.id
  if (!uid) return null
  const { data: st } = await supabase.from('staff').select('id, role, active').eq('id', uid).maybeSingle()
  if (!st) return null
  return st.active ? { staffId: st.id, owner: st.role === 'admin' } : null
}

/** An admin signs in with an email; either account level may use its profile phone. */
export async function signIn(id: string, password: string): Promise<Who | { error: Key }> {
  let email = id.includes('@') ? normEmail(id) : ''
  if (!email) {
    const { data: staffEmail } = await supabase.rpc('staff_login_email', { p_phone: id })
    if (typeof staffEmail !== 'string' || !staffEmail) return { error: 'auth.wrong' }
    email = staffEmail
  }
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) return { error: error.status === 400 ? 'auth.wrong' : 'auth.network' }
  const who = await resolveSession()
  if (who) return who
  await supabase.auth.signOut()
  return { error: 'auth.inactive' }
}

export const signOut = () => supabase.auth.signOut()
