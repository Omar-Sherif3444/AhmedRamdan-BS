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
  /** When the current customer sat down (public, for the customer view's elapsed time). */
  since?: string
  /** The signed-in customer who reserved this sofa seat online. */
  reservedBy?: string
  /** When that online reservation expires (1 hour after booking). */
  reservedUntil?: string
  /** First name of the customer who reserved online (public). */
  reservedName?: string
}

export type Role = 'owner' | 'barber' | 'receptionist'

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
  employeeId: string
  seatId: string
  serviceId: string
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
  /** Staff session (owner, barbers, reception). */
  signedIn: boolean
  /** Signed-in customer, if any. */
  customerId: string | null
  notices: Notice[]
}

export interface DateRange {
  from: string // yyyy-mm-dd, inclusive
  to: string // yyyy-mm-dd, inclusive
}
