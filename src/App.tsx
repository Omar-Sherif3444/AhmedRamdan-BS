import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Armchair, Bell, CalendarX, ChartColumn, HandCoins, LayoutDashboard, Lock, LogIn, LogOut, MapPin, Menu, MessageCircle, Phone, Receipt, Settings as SettingsIcon, Star, UserCog, Users, Wallet, X } from 'lucide-react'
import { useStore } from './store'
import { Card, VisitBadge, initials } from './components/ui'
import { DEVELOPER, MAP_DIRECTIONS, MAP_EMBED, SALON } from './config'
import SignIn from './pages/SignIn'
import { signOut } from './lib/api'
import { useTxRows } from './pages/Transactions'
import type { Key } from './i18n'
// Lazy: three.js loads only when the owner opens the dashboard.
const Dashboard = lazy(() => import('./pages/Dashboard'))
import Floor from './pages/Floor'
import Customers from './pages/Customers'
import Transactions from './pages/Transactions'
import Employees from './pages/Employees'
import Reports from './pages/Reports'
import Settings from './pages/Settings'
import Expenses from './pages/Expenses'
import Payroll from './pages/Payroll'
import Attendance from './pages/Attendance'

// Management app routes (after staff sign-in). Shared routes show everyone (the owner included) the pages;
// what each page lists is limited by the server to the signed-in employee's own records. Owner routes are the owner's area.
const ROUTES = [
  { id: 'floor', icon: Armchair, Page: Floor, owner: false },
  { id: 'customers', icon: Users, Page: Customers, owner: false },
  { id: 'transactions', icon: Receipt, Page: Transactions, owner: false },
  { id: 'expenses', icon: Wallet, Page: Expenses, owner: false },
  { id: 'payroll', icon: HandCoins, Page: Payroll, owner: false },
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

function useHash() {
  const [hash, setHash] = useState(location.hash)
  useEffect(() => {
    const on = () => setHash(location.hash)
    addEventListener('hashchange', on)
    return () => removeEventListener('hashchange', on)
  }, [])
  return hash
}

export default function App() {
  const { state, status, reload, i18n } = useStore()
  const hash = useHash()
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
  // Staff sessions get the management app; everyone else gets the customer view, with sign-in at #/login.
  if (state.signedIn) return <AdminApp />
  if (hash === '#/login') return <SignIn />
  return <PublicFloor />
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

function PublicFloor() {
  const { state, i18n } = useStore()
  const { t } = i18n
  const me = state.customers.find((c) => c.id === state.customerId)
  return (
    <div className="public">
      <header className="topbar">
        <Brand />
        <div className="topbar-actions">
          <LangToggle />
          {me ? (
            <>
              <span className="hide-sm">{t('pub.hello', { name: me.name })}</span>
              <button className="btn ghost" onClick={signOut}>
                <LogOut size={16} aria-hidden /> <span className="hide-sm">{t('nav.signOut')}</span>
              </button>
            </>
          ) : (
            <a className="btn primary" href="#/login">
              <LogIn size={16} aria-hidden /> {t('auth.signIn')}
            </a>
          )}
        </div>
      </header>
      <main id="main" className="stack">
        <h1 className="public-title">{t('pub.title')}</h1>
        {me && <MyVisits customerId={me.id} />}
        <Floor readOnly />
      </main>
      <Footer />
    </div>
  )
}

function MyVisits({ customerId }: { customerId: string }) {
  const { state, i18n } = useStore()
  const { t } = i18n
  const visits = state.visits.filter((v) => v.customerId === customerId).sort((a, b) => b.startedAt.localeCompare(a.startedAt))
  const rows = useTxRows(visits.slice(0, 10))
  return (
    <Card title={t('pub.myVisits')}>
      {rows.length === 0 ? (
        <p className="muted">{t('cu.noVisits')}</p>
      ) : (
        <ul className="history">
          {rows.map((r) => (
            <li key={r.v.id}>
              <div>
                <strong>{r.service}</strong>
                <span className="muted small block">
                  {i18n.dateTime(r.v.startedAt)} · {r.employee}
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
    </Card>
  )
}

// lucide-react no longer ships brand logos, so these three are small inline marks.
const Brandmark = {
  facebook: <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />,
  instagram: (
    <>
      <rect x="2" y="2" width="20" height="20" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.6" />
    </>
  ),
  tiktok: <path d="M15 3v11.5a4 4 0 1 1-4-4M15 3c.6 2.6 2.4 4.3 5 4.6" />,
  snapchat: (
    <path d="M12 3c2.8 0 5 2.2 5 5v3l2-.5-1.5 2c.6 1.6 1.9 2.7 3.5 3.2-1.4.6-2.6.6-3 1.5-.3.7-1.4.4-2.5.6-.9.2-1.6 1.7-3.5 1.7s-2.6-1.5-3.5-1.7c-1.1-.2-2.2.1-2.5-.6-.4-.9-1.6-.9-3-1.5 1.6-.5 2.9-1.6 3.5-3.2L4.5 10.5 7 11V8c0-2.8 2.2-5 5-5z" />
  ),
}

function Footer() {
  const { state, i18n } = useStore()
  const { t } = i18n
  const social = [
    { key: 'facebook', href: SALON.facebook, label: 'Facebook' },
    { key: 'instagram', href: SALON.instagram, label: 'Instagram' },
    { key: 'tiktok', href: SALON.tiktok, label: 'TikTok' },
    { key: 'snapchat', href: SALON.snapchat, label: 'Snapchat' },
  ] as const
  return (
    <footer className="site-footer">
      <div className="footer-inner">
        <div className="footer-col">
          <Brand />
          <p className="muted small footer-tagline" dir="rtl">
            مش مجرد حلاقة.. دي أناقة وثقة وشياكة في كل تفصيلة 👑
          </p>
        </div>
        <div className="footer-col">
          <p className="footer-title">{t('foot.call')}</p>
          <a className="footer-link" href={`tel:${SALON.phoneIntl}`} dir="ltr">
            <Phone size={16} aria-hidden /> {SALON.phone}
          </a>
          <a className="footer-link" href={`https://wa.me/${SALON.whatsapp}`} target="_blank" rel="noreferrer">
            <MessageCircle size={16} aria-hidden /> WhatsApp
          </a>
          <a className="footer-link" href={SALON.reviews} target="_blank" rel="noreferrer">
            <Star size={16} aria-hidden /> {t('foot.reviews')}
          </a>
        </div>
        <div className="footer-col">
          <p className="footer-title">{t('foot.follow')}</p>
          <div className="socials">
            {social.map((x) => (
              <a key={x.key} className="icon-btn social" href={x.href} target="_blank" rel="noreferrer" aria-label={x.label}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  {Brandmark[x.key]}
                </svg>
              </a>
            ))}
          </div>
          <p className="footer-title">{t('foot.pay')}</p>
          <a className="footer-link" href={SALON.instapay} target="_blank" rel="noreferrer">
            <Wallet size={16} aria-hidden /> InstaPay
          </a>
          <a className="footer-link" href={SALON.vodafoneCash} target="_blank" rel="noreferrer">
            <Wallet size={16} aria-hidden /> Vodafone Cash
          </a>
        </div>
        <div className="footer-col footer-map">
          <p className="footer-title">{t('foot.visit')}</p>
          <iframe title={t('foot.visit')} src={MAP_EMBED} loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
          <a className="footer-link" href={MAP_DIRECTIONS} target="_blank" rel="noreferrer">
            <MapPin size={16} aria-hidden /> {t('foot.directions')}
          </a>
        </div>
      </div>
      <div className="footer-copy muted small">
        <span>{t('foot.rights', { year: String(new Date().getFullYear()), shop: state.settings.shopName })}</span>
        <span>
          {t('foot.credit')}{' '}
          <a className="credit" href={DEVELOPER.github} target="_blank" rel="noreferrer" aria-label={`${DEVELOPER.name} (GitHub)`}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 3.5c-.3 1.15-.3 2.35 0 3.5A5.4 5.4 0 0 0 4 10.5c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
              <path d="M9 18c-4.51 2-5-2-7-2" />
            </svg>
            {DEVELOPER.name}
          </a>
        </span>
      </div>
    </footer>
  )
}

function AdminApp() {
  const { state, i18n } = useStore()
  const { t } = i18n
  const route = useRoute()
  const isOwner = state.employees.find((e) => e.id === state.currentUserId)?.role === 'owner'
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
              <a className="btn" href="#/floor">
                {t('nav.floor')}
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
