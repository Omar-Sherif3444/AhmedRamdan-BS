import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react'
import { makeI18n, type I18n } from './i18n'
import { reducer, type Action } from './lib/reducer'
import { errorKey, loadData, resolveSession, run } from './lib/api'
import { supabase } from './lib/supabase'
import type { Lang, State } from './types'

// Only per-device preferences live in the browser; shop data comes from Supabase.
const PREFS = 'barbershop:prefs'

function initial(): State {
  let prefs: { lang?: Lang } = {}
  try {
    prefs = JSON.parse(localStorage.getItem(PREFS) ?? '{}')
  } catch {
    // Blocked storage: use the defaults.
  }
  return {
    seats: [],
    employees: [],
    customers: [],
    services: [],
    visits: [],
    expenses: [],
    absences: [],
    holidays: [],
    wages: [],
    deductions: [],
    settings: { shopName: '', currency: 'EGP', lang: prefs.lang ?? 'ar' },
    currentUserId: '',
    signedIn: false,
    waiting: 0,
    notices: [],
  }
}

interface Toast {
  id: number
  text: string
}

export type LoadStatus = 'loading' | 'ready' | 'error'

interface Ctx {
  state: State
  dispatch: (a: Action) => void
  i18n: I18n
  status: LoadStatus
  reload: () => Promise<void>
  toast: (text: string) => void
}

const StoreCtx = createContext<Ctx | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, local] = useReducer(reducer, undefined, initial)
  const [status, setStatus] = useState<LoadStatus>('loading')
  const [toasts, setToasts] = useState<Toast[]>([])
  const { lang, currency, shopName } = state.settings
  const i18n = useMemo(() => makeI18n(lang, currency), [lang, currency])

  const stateRef = useRef(state)
  stateRef.current = state
  const i18nRef = useRef(i18n)
  i18nRef.current = i18n

  const toast = useCallback((text: string) => {
    const id = Date.now() + Math.random()
    setToasts((ts) => [...ts, { id, text }])
    setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), 3500)
  }, [])

  const reload = useCallback(async () => {
    try {
      const r = await loadData()
      local({ type: 'data', ...r })
      setStatus('ready')
    } catch {
      // Keep showing the last good data if there is any; otherwise show the error screen.
      setStatus((s) => (s === 'ready' ? s : 'error'))
    }
  }, [])

  // Apply locally at once, then save on the server and reload; a failed save is undone by the reload.
  const dispatch = useCallback(
    (a: Action) => {
      const before = stateRef.current
      local(a)
      run(a, before)
        ?.catch((e) => toast(i18nRef.current.t(errorKey(e))))
        .finally(reload)
    },
    [reload, toast],
  )

  // Session: who is signed in decides what row-level security lets us read, so reload on every change.
  useEffect(() => {
    const sync = async () => {
      const who = await resolveSession()
      local({ type: 'session', staffId: who?.staffId ?? null })
      await reload()
    }
    const { data } = supabase.auth.onAuthStateChange((event) => {
      // Defer: Supabase must not be called from inside this callback.
      if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') setTimeout(sync)
    })
    return () => data.subscription.unsubscribe()
  }, [reload])

  // Live updates: any change by another device reloads this one (debounced).
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const channel = supabase
      .channel('shop')
      .on('postgres_changes', { event: '*', schema: 'public' }, () => {
        clearTimeout(timer)
        timer = setTimeout(reload, 300)
      })
      .subscribe()
    return () => {
      clearTimeout(timer)
      supabase.removeChannel(channel)
    }
  }, [reload])

  useEffect(() => {
    try {
      localStorage.setItem(PREFS, JSON.stringify({ lang }))
    } catch {
      // Storage blocked: preferences last for this visit only.
    }
  }, [lang])

  // Layout effect: lang/dir must be on <html> before child effects (the 3D scenes) read layout and CSS colors.
  useLayoutEffect(() => {
    const html = document.documentElement
    html.lang = lang
    html.dir = i18n.dir
    if (shopName) document.title = shopName
  }, [lang, i18n, shopName])

  const value = useMemo<Ctx>(() => ({ state, dispatch, i18n, status, reload, toast }), [state, dispatch, i18n, status, reload, toast])

  return (
    <StoreCtx.Provider value={value}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((x) => (
          <div key={x.id} className="toast">
            {x.text}
          </div>
        ))}
      </div>
    </StoreCtx.Provider>
  )
}

export function useStore() {
  const c = useContext(StoreCtx)
  if (!c) throw new Error('useStore outside StoreProvider')
  return c
}
