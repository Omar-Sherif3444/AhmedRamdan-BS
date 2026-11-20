export type Lang = 'ar' | 'en'
export type Currency = 'EGP' | 'SAR' | 'AED' | 'USD' | 'EUR'

export type SeatStatus = 'available' | 'occupied' | 'reserved' | 'out_of_service'
export type SeatKind = 'sofa' | 'chair'

export interface Seat {
  id: string
  kind: SeatKind
  number: number
  status: SeatStatus
  /** Custom label from Settings; empty means the default "Seat n" / "Chair n". */
  label: string
  /** The in-progress visit while occupied. */
  visitId?: string
  /** When the current customer sat down. */
  since?: string
}

/**
 * Two account levels, plus barbers. A barber is a staff row with no login at all:
 * no `auth.users` entry, no email, no PIN. The operator records what they did.
 */
export type Role = 'admin' | 'operator' | 'barber'
/** The roles that can actually sign in. */
export const ACCOUNT_ROLES = ['admin', 'operator'] as const

export interface Employee {
  id: string
  name: string
  role: Role
  phone: string
  active: boolean
  joinedAt: string
  /** Sign-in email (Supabase Auth). */
  email: string
  /** Weekly days off, 0 (Sunday) .. 6 (Saturday). */
  daysOff: number[]
  /** Current daily wage in EGP (owner, or the employee themself; undefined for others). */
  dailyWage?: number
  /** Only set when saving a new or changed password; never loaded from the server. */
  password?: string
}

export interface Customer {
  id: string
  name: string
  phone: string
  createdAt: string
}

export interface Service {
  id: string
  nameAr: string
  nameEn: string
  price: number
  active: boolean
}

/** 'card' exists only on historical transactions; new payments are cash or wallet. */
export type PaymentMethod = 'cash' | 'card' | 'wallet'
export const PAY_METHODS = ['cash', 'wallet'] as const
export type VisitStatus = 'in_progress' | 'completed' | 'cancelled'

/** One visit = one transaction: payment is taken at registration. */
export interface Visit {
  id: string
  customerId: string
  /** The barber who did the work. */
  employeeId: string
  seatId: string
  /** Deprecated: the first of `serviceIds`. Kept while older pages still read it. */
  serviceId: string
  /** Everything done for this customer. The amount is the sum of their prices. */
  serviceIds: string[]
  amount: number
  method: PaymentMethod
  status: VisitStatus
  startedAt: string
  endedAt?: string
  /** Another customer is expected for this seat after this one. */
  expectNext: boolean
}

export interface Settings {
  shopName: string
  currency: Currency
  lang: Lang
}

export interface Notice {
  id: string
  key: string
  params: Record<string, string>
  at: string
  read: boolean
}

export interface Data {
  seats: Seat[]
  employees: Employee[]
  customers: Customer[]
  services: Service[]
  visits: Visit[]
  expenses: Expense[]
  absences: Absence[]
  holidays: Holiday[]
  wages: WageRate[]
  deductions: Deduction[]
  /**
   * People waiting right now, as the operator counts them with + / −.
   * Server-derived from today's `waiting_events`; never written directly.
   */
  waiting: number
}

export type ExpenseKind = 'shop' | 'personal'

export interface Expense {
  id: string
  /** Who recorded it (employee or owner). */
  employeeId: string
  kind: ExpenseKind
  amount: number
  description: string
  spentAt: string
  createdAt: string
  updatedAt?: string
}

export interface Absence {
  id: string
  employeeId: string
  day: string // yyyy-mm-dd
  reason: string
  createdAt: string
  cancelledAt?: string
}

export interface Holiday {
  day: string // yyyy-mm-dd
  name: string
}

export interface WageRate {
  employeeId: string
  dailyWage: number
  effectiveFrom: string // yyyy-mm-dd
}

export interface Deduction {
  id: string
  employeeId: string
  month: string // yyyy-mm-01
  amount: number
  reason: string
  createdAt: string
  cancelledAt?: string
}

export interface PayrollRow {
  employeeId: string
  name: string
  dailyWage: number
  eligibleDays: number
  absenceDays: number
  payableDays: number
  gross: number
  deductions: number
  net: number
  status: 'pending' | 'paid'
  paidAt?: string
}

export interface State extends Data {
  settings: Settings
  currentUserId: string
  /** Staff session (admin or operator). */
  signedIn: boolean
  notices: Notice[]
}

export interface DateRange {
  from: string // yyyy-mm-dd, inclusive
  to: string // yyyy-mm-dd, inclusive
}
