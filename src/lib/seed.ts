// Deterministic sample data for the logic tests (the live app loads from Supabase).
import type { Customer, Data, Employee, PaymentMethod, Seat, Service, Visit } from '../types'
import { addDays } from './calc.ts'

function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const FIRST = ['محمد', 'أحمد', 'مصطفى', 'خالد', 'طارق', 'إسلام', 'زياد', 'مروان', 'علي', 'حازم', 'شريف', 'باسم', 'عمرو', 'وليد', 'هشام', 'رامي', 'تامر', 'سيف', 'آدم', 'ياسين']
const LAST = ['عبد الله', 'إبراهيم', 'سليمان', 'فاروق', 'الشافعي', 'رشدي', 'جمال', 'عز الدين', 'نصار', 'حمدي', 'البنا', 'زكي']

export function seed(now = new Date()): Data {
  const r = rng(20261025)
  const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)]
  const iso = (d: Date) => d.toISOString()

  const employees: Employee[] = [
    { id: 'e1', name: 'كريم منصور', role: 'admin', phone: '01001234567', active: true, joinedAt: '2021-03-01', email: 'owner@example.com', daysOff: [5], dailyWage: 200 },
    { id: 'e2', name: 'محمود السيد', role: 'barber', phone: '01112345678', active: true, joinedAt: '2022-01-15', email: 'mahmoud@example.com', daysOff: [5], dailyWage: 200 },
    { id: 'e3', name: 'يوسف عادل', role: 'barber', phone: '01223456789', active: true, joinedAt: '2023-06-10', email: 'youssef@example.com', daysOff: [5], dailyWage: 200 },
    { id: 'e4', name: 'عمر حسن', role: 'barber', phone: '01534567890', active: true, joinedAt: '2024-02-01', email: 'omar@example.com', daysOff: [5], dailyWage: 200 },
    { id: 'e5', name: 'سارة فتحي', role: 'operator', phone: '01045678901', active: true, joinedAt: '2024-09-20', email: 'sara@example.com', daysOff: [5], dailyWage: 200 },
    { id: 'e6', name: 'حسام نبيل', role: 'barber', phone: '01156789012', active: false, joinedAt: '2022-05-05', email: 'hossam@example.com', daysOff: [5], dailyWage: 200 },
  ]
  const services: Service[] = [
    { id: 'sv1', nameAr: 'قص شعر', nameEn: 'Haircut', price: 120, active: true },
    { id: 'sv2', nameAr: 'تهذيب لحية', nameEn: 'Beard trim', price: 70, active: true },
    { id: 'sv3', nameAr: 'قص شعر ولحية', nameEn: 'Haircut & beard', price: 170, active: true },
    { id: 'sv4', nameAr: 'حلاقة أطفال', nameEn: 'Kids cut', price: 90, active: true },
    { id: 'sv5', nameAr: 'حلاقة ذقن بالموس', nameEn: 'Hot towel shave', price: 80, active: true },
    { id: 'sv6', nameAr: 'صبغة شعر', nameEn: 'Hair coloring', price: 250, active: true },
    { id: 'sv7', nameAr: 'تنظيف بشرة', nameEn: 'Facial', price: 150, active: true },
  ]
  const seats: Seat[] = [
    ...[1, 2, 3].map((n) => ({ id: `s${n}`, kind: 'sofa' as const, number: n, status: 'available' as const, label: '' })),
    ...[1, 2, 3, 4].map((n) => ({ id: `c${n}`, kind: 'chair' as const, number: n, status: 'available' as const, label: '' })),
  ]

  const customers: Customer[] = Array.from({ length: 64 }, (_, i) => ({
    id: `cu${i + 1}`,
    name: `${pick(FIRST)} ${pick(LAST)}`,
    phone: r() < 0.85 ? `01${pick(['0', '1', '2', '5'])}${String(Math.floor(r() * 1e8)).padStart(8, '0')}` : '',
    createdAt: iso(addDays(now, -90)),
  }))

  const staff = employees.filter((e) => e.role === 'barber' && e.active)
  const formerStaff = employees.find((e) => !e.active)!
  const hourWeights = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 3, 3, 4, 4, 5, 6, 8, 9, 9, 7, 5, 3]
  const pickHour = () => {
    let x = r() * hourWeights.reduce((a, b) => a + b)
    return hourWeights.findIndex((w) => (x -= w) < 0)
  }
  const method = (): PaymentMethod => (r() < 0.65 ? 'cash' : r() < 0.6 ? 'wallet' : 'card')
  const cutoff = now.getTime() - 60 * 60 * 1000

  const visits: Visit[] = []
  for (let back = 75; back >= 0; back--) {
    const day = addDays(now, -back)
    const weekend = day.getDay() === 4 || day.getDay() === 5 // Thu, Fri
    const count = Math.round((weekend ? 22 : 14) + r() * 8)
    for (let i = 0; i < count; i++) {
      const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), pickHour(), Math.floor(r() * 60))
      if (start.getTime() > cutoff) continue
      const service = pick(services)
      // The inactive barber only appears in older history.
      const employee = back > 40 && r() < 0.15 ? formerStaff : pick(staff)
      const cancelled = r() < 0.03
      visits.push({
        id: `v${visits.length + 1}`,
        customerId: pick(customers).id,
        employeeId: employee.id,
        seatId: r() < 0.85 ? `c${1 + Math.floor(r() * 4)}` : `s${1 + Math.floor(r() * 3)}`,
        serviceId: service.id,
        serviceIds: [service.id],
        amount: service.price + (r() < 0.2 ? 10 * Math.ceil(r() * 3) : 0),
        method: method(),
        status: cancelled ? 'cancelled' : 'completed',
        startedAt: iso(start),
        endedAt: iso(new Date(start.getTime() + (20 + Math.floor(r() * 40)) * 60000)),
        expectNext: false,
      })
    }
  }

  // Live floor: two chairs and one sofa seat busy, one seat reserved, one chair out of service.
  const live: [string, number][] = [['c1', 25], ['c2', 10], ['s1', 5]]
  for (const [seatId, minsAgo] of live) {
    const service = pick(services)
    const v: Visit = {
      id: `v${visits.length + 1}`,
      customerId: pick(customers).id,
      employeeId: pick(staff).id,
      seatId,
      serviceId: service.id,
      serviceIds: [service.id],
      amount: service.price,
      method: 'cash',
      status: 'in_progress',
      startedAt: iso(new Date(now.getTime() - minsAgo * 60000)),
      expectNext: seatId === 'c2',
    }
    visits.push(v)
    Object.assign(seats.find((s) => s.id === seatId)!, { status: 'occupied', visitId: v.id })
  }
  seats.find((s) => s.id === 's3')!.status = 'reserved'
  seats.find((s) => s.id === 'c4')!.status = 'out_of_service'

  return { seats, employees, customers, services, visits, expenses: [], absences: [], holidays: [], wages: [], deductions: [], waiting: 0 }
}
