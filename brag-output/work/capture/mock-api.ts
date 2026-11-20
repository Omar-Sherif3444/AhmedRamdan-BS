// Offline data layer: the project's deterministic seed, signed in as ?as=owner|staff|none.
import { seed } from '/src/lib/seed.ts'
const q = new URLSearchParams(location.search)
const as = q.get('as') ?? 'owner'
const data = seed(new Date())
// ?busy=c3 puts a walk-in on that seat (the "after" state of the check-in).
const busy = q.get('busy')
if (busy) {
  const v = { ...data.visits.find((x) => x.status === 'in_progress')!, id: 'vbusy', seatId: busy, startedAt: new Date(Date.now() - 60000).toISOString(), expectNext: false }
  data.visits.push(v)
  Object.assign(data.seats.find((s) => s.id === busy)!, { status: 'occupied', visitId: v.id })
}
export async function loadData() {
  return { data, shop: { shopName: 'Ahmed Ramdan Barber Shop', currency: 'EGP' } }
}
export const run = () => null
export const errorKey = () => 'err.server'
export async function resolveSession() {
  if (as === 'none') return null
  if (as === 'customer') return { staffId: null, customerId: data.customers[0].id, owner: false }
  return { staffId: as === 'owner' ? 'e1' : 'e2', customerId: null, owner: as === 'owner' }
}
export const signIn = async () => ({ error: 'auth.wrong' })
export const signUpCustomer = async () => ({ error: 'auth.network' })
export const signOut = async () => {}
