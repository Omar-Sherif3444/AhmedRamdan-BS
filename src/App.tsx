import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Armchair, Bell, Calculator, ReceiptText, CalendarX, ChartColumn, HandCoins, LayoutDashboard, Lock, LogOut, Menu, Receipt, Settings as SettingsIcon, UserCog, Users, Wallet, X } from 'lucide-react'
import { useStore } from './store'
import { Modal, initials } from './components/ui'
import SignIn from './pages/SignIn'
import { signOut } from './lib/api'
import type { Key } from './i18n'
// Lazy: three.js loads only when the owner opens the dashboard.
const Dashboard = lazy(() => import('./pages/Dashboard'))
import Operator from './pages/Operator'
import { ExpenseForm } from './pages/Expenses'
import DailyTotals from './components/DailyTotals'
import Customers from './pages/Customers'
import Transactions from './pages/Transactions'
import Employees from './pages/Employees'
import Reports from './pages/Reports'
import Settings from './pages/Settings'
import Expenses from './pages/Expenses'
import Payroll from './pages/Payroll'
import Attendance from './pages/Attendance'

// Admin app routes. An operator never reaches this table: the front desk gets the one Operator screen
// (see App below). Owner routes sit in the admin's own section of the nav.
const ROUTES = [
  { id: 'op', icon: Armchair, Page: Operator, owner: false },
  { id: 'customers', icon: Users, Page: Customers, owner: false },
  { id: 'transactions', icon: Receipt, Page: Transactions, owner: false },
  { id: 'expenses', icon: Wallet, Page: Expenses, owner: false },
  { id: 'payroll', icon: HandCoins, Page: Payroll, owner: true },
  { id: 'dashboard', icon: LayoutDashboard, Page: Dashboard, owner: true },
  { id: 'reports', icon: ChartColumn, Page: Reports, owner: true },
  { id: 'employees', icon: UserCog, Page: Employees, owner: true },
  { id: 'attendance', icon: CalendarX, Page: Attendance, owner: true },
  { id: 'settings', icon: SettingsIcon, Page: Settings, owner: true },
] as const

function useRoute() {
  const read = () => {
    const id = location.hash.replace(/^#\/?/, '')
    return ROUTES.find((r) => r.id === id) ?? ROUTES[0]
  }
  const [route, setRoute] = useState(read)
  useEffect(() => {
    const on = () => setRoute(read())
    addEventListener('hashchange', on)
    return () => removeEventListener('hashchange', on)
  }, [])
  return route
}

export default function App() {
  const { state, status, reload, i18n } = useStore()
  if (status !== 'ready')
    return (
      <div className="boot" role="status">
        {status === 'loading' ? (
          <p className="muted">{i18n.t('c.loading')}</p>
        ) : (
          <>
            <p>{i18n.t('c.loadError')}</p>
            <button className="btn" onClick={reload}>
              {i18n.t('c.retry')}
            </button>
          </>
        )}
      </div>
    )
  // The public wait board (#/) never gets here: main.tsx serves it without the store. Everything else is staff-only.
  if (!state.signedIn) return <SignIn />
  const me = state.employees.find((e) => e.id === state.currentUserId)
  // Wait for the staff row before choosing a shell, so an admin never flashes the operator screen.
  if (!me) return null
  if (me.role !== 'admin') return <OperatorApp />
  return <AdminApp />
}

/** The shop account: the front-desk screen only (no sidebar), a way out, and a button to log a shop expense. */
function OperatorApp() {
  const { i18n } = useStore()
  const { t } = i18n
  const [expense, setExpense] = useState(false)
  const [totals, setTotals] = useState(false)
  return (
    <div className="public">
      <header className="topbar">
        <Brand />
        <div className="topbar-actions">
          <LangToggle />
          <button
            className="btn ghost"
            onClick={() => {
              location.hash = '#/'
              signOut()
            }}
          >
            <LogOut size={16} aria-hidden /> <span className="hide-sm">{t('nav.signOut')}</span>
          </button>
        </div>
      </header>
      <main id="main" className="op-main">
        <Operator />
      </main>
      <div className="op-fabs">
        <button type="button" className="op-fab" onClick={() => setExpense(true)}>
          <ReceiptText size={20} aria-hidden /> {t('ex.add')}
        </button>
        <button type="button" className="op-fab alt" onClick={() => setTotals(true)}>
          <Calculator size={20} aria-hidden /> {t('dt.title')}
        </button>
      </div>
      <Modal open={expense} onClose={() => setExpense(false)} title={t('ex.add')}>
        {expense && <ExpenseForm isOwner={false} counter onDone={() => setExpense(false)} />}
      </Modal>
      <Modal open={totals} onClose={() => setTotals(false)} title={t('dt.title')} wide>
        {totals && <DailyTotals />}
      </Modal>
    </div>
  )
}

function Brand() {
  const { state } = useStore()
  return (
    <div className="brand">
      <img className="brand-logo" src="/logo.png" alt="" width={36} height={36} />
      <div className="brand-text">
        <strong>{state.settings.shopName}</strong>
      </div>
    </div>
  )
}

function LangToggle() {
  const { dispatch, i18n } = useStore()
  const { t } = i18n
  return (
    <button className="btn ghost" onClick={() => dispatch({ type: 'settings', patch: { lang: i18n.lang === 'ar' ? 'en' : 'ar' } })} aria-label={t('top.langLabel')}>
      {t('top.lang')}
    </button>
  )
}

function AdminApp() {
  const { state, i18n } = useStore()
  const { t } = i18n
  const route = useRoute()
  const isOwner = state.employees.find((e) => e.id === state.currentUserId)?.role === 'admin'
  const [drawer, setDrawer] = useState(false)
  const link = (r: (typeof ROUTES)[number]) => (
    <a key={r.id} href={`#/${r.id}`} className="nav-link" aria-current={r.id === route.id ? 'page' : undefined}>
      <r.icon size={18} aria-hidden />
      {t(`nav.${r.id}` as Key)}
    </a>
  )

  useEffect(() => {
    setDrawer(false)
    window.scrollTo(0, 0)
  }, [route])

  useEffect(() => {
    if (!drawer) return
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setDrawer(false)
    addEventListener('keydown', esc)
    return () => removeEventListener('keydown', esc)
  }, [drawer])

  const title = t(`nav.${route.id}` as Key)

  return (
    <div className="shell">
      <a className="skip" href="#main">
        {t('nav.skip')}
      </a>
      <aside className={drawer ? 'sidebar open' : 'sidebar'} aria-label={state.settings.shopName}>
        <div className="brand-row">
          <Brand />
          <button className="icon-btn only-drawer" onClick={() => setDrawer(false)} aria-label={t('nav.close')}>
            <X size={18} />
          </button>
        </div>
        <nav>
          {ROUTES.filter((r) => !r.owner).map(link)}
          {isOwner && (
            <>
              <p className="nav-section">{t('nav.ownerArea')}</p>
              {ROUTES.filter((r) => r.owner).map(link)}
            </>
          )}
        </nav>
        <button
          className="btn ghost nav-auth"
          onClick={() => {
            location.hash = '#/'
            signOut()
          }}
        >
          <LogOut size={18} aria-hidden /> {t('nav.signOut')}
        </button>
      </aside>
      {drawer && <div className="scrim" onClick={() => setDrawer(false)} aria-hidden />}

      <div className="main-col">
        <TopBar title={title} onMenu={() => setDrawer(true)} />
        <main id="main" tabIndex={-1}>
          {route.owner && !isOwner ? (
            <section className="card gate">
              <span className="kpi-icon" aria-hidden>
                <Lock size={20} />
              </span>
              <h2>{t('gate.title')}</h2>
              <p className="muted">{t('gate.text')}</p>
              <a className="btn" href="#/op">
                {t('nav.op')}
              </a>
            </section>
          ) : (
            <Suspense fallback={<p className="muted">{t('c.loading')}</p>}>
              <route.Page />
            </Suspense>
          )}
        </main>
      </div>
    </div>
  )
}

function TopBar({ title, onMenu }: { title: string; onMenu: () => void }) {
  const { state, dispatch, i18n } = useStore()
  const { t } = i18n
  const [open, setOpen] = useState(false)
  const popRef = useRef<HTMLDivElement>(null)
  const unread = state.notices.filter((n) => !n.read).length
  const me = state.employees.find((e) => e.id === state.currentUserId)

  useEffect(() => {
    if (!open) return
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !popRef.current?.contains(e.target as Node)) setOpen(false)
    }
    addEventListener('pointerdown', close)
    addEventListener('keydown', close)
    return () => {
      removeEventListener('pointerdown', close)
      removeEventListener('keydown', close)
    }
  }, [open])

  return (
    <header className="topbar">
      <button className="icon-btn only-drawer" onClick={onMenu} aria-label={t('nav.menu')}>
        <Menu size={20} />
      </button>
      <h1 className="page-title">{title}</h1>
      <div className="topbar-actions">
        <LangToggle />
        <div className="pop-wrap" ref={popRef}>
          <button
            className="icon-btn"
            aria-label={`${t('top.notifications')}${unread ? ` (${i18n.num(unread)})` : ''}`}
            aria-expanded={open}
            onClick={() => {
              setOpen(!open)
              if (!open) dispatch({ type: 'readNotices' })
            }}
          >
            <Bell size={18} />
            {unread > 0 && <span className="dot-badge">{i18n.num(unread)}</span>}
          </button>
          {open && (
            <div className="popover" role="region" aria-label={t('top.notifications')}>
              <p className="popover-title">{t('top.notifications')}</p>
              {state.notices.length === 0 ? (
                <p className="muted small">{t('top.noNotifications')}</p>
              ) : (
                <ul className="notices">
                  {state.notices.map((n) => {
                    const seat = state.seats.find((s) => s.id === n.params.seat)
                    return (
                      <li key={n.id}>
                        <span>{t(n.key as Key, { ...n.params, seat: seat ? i18n.seatName(seat) : '' })}</span>
                        <span className="muted small">{i18n.time(n.at)}</span>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          )}
        </div>
        <div className="user" title={t('top.actingAs')}>
          <span className="avatar" aria-hidden>
            {initials(me?.name ?? '?')}
          </span>
          <span className="user-name hide-sm">
            <strong className="block">{me?.name}</strong>
            <span className="muted small">{me && t(`role.${me.role}`)}</span>
          </span>
        </div>
      </div>
    </header>
  )
}
