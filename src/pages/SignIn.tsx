import { cloneElement, useRef, useState, type FormEvent, type ReactElement, type ReactNode } from 'react'
import { ArrowLeft, ArrowRight, Eye, EyeOff, Lock, Phone, UserRound } from 'lucide-react'
import { useStore } from '../store'
import { signIn, signUpCustomer } from '../lib/api'

const PHONE = /^\+?[\d\s-]{7,15}$/

/** Sign-in card adapted from the "sign-in-card-2" design: 3D tilt, glass card, light beams, in the site's theme. */
export default function SignIn() {
  const { state, i18n } = useStore()
  const { t } = i18n
  const [signUp, setSignUp] = useState(false)
  const [f, setF] = useState({ name: '', login: '', password: '' })
  const [show, setShow] = useState(false)
  const [errors, setErrors] = useState<{ name?: string; login?: string; password?: string }>({})
  const [error, setError] = useState('')
  const [hint, setHint] = useState('')
  const [busy, setBusy] = useState(false)
  const card = useRef<HTMLDivElement>(null)

  const set = (patch: Partial<typeof f>) => {
    setF((x) => ({ ...x, ...patch }))
    setError('')
  }

  const tilt = (e: { clientX: number; clientY: number }) => {
    const el = card.current!
    const r = el.getBoundingClientRect()
    el.style.setProperty('--ry', `${((e.clientX - r.left) / r.width - 0.5) * 12}deg`)
    el.style.setProperty('--rx', `${((e.clientY - r.top) / r.height - 0.5) * -12}deg`)
  }
  const untilt = () => {
    card.current!.style.setProperty('--rx', '0deg')
    card.current!.style.setProperty('--ry', '0deg')
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const errs: typeof errors = {}
    if (signUp && f.name.trim().length < 2) errs.name = t('err.name')
    if (signUp ? !PHONE.test(f.login.trim()) : !f.login.trim()) errs.login = t(signUp ? 'err.phone' : 'err.required')
    if (signUp ? f.password.length < 6 : !f.password) errs.password = t(signUp ? 'auth.passwordShort' : 'err.required')
    setErrors(errs)
    if (Object.keys(errs).length) return

    setBusy(true)
    const r = signUp ? await signUpCustomer(f.name, f.login, f.password) : await signIn(f.login, f.password)
    setBusy(false)
    if ('error' in r) return setError(t(r.error))
    // The credentials decide where to go: owner to the shop analysis, employees to the floor, customers home.
    // The store picks up the new session from Supabase and switches views.
    location.hash = r.owner ? '#/dashboard' : r.staffId ? '#/floor' : '#/'
  }

  const Next = i18n.dir === 'rtl' ? ArrowLeft : ArrowRight
  const Back = i18n.dir === 'rtl' ? ArrowRight : ArrowLeft

  return (
    <div className="auth">
      <div className="auth-glow" aria-hidden />
      <a className="auth-back" href="#/">
        <Back size={16} aria-hidden /> {t('auth.back')}
      </a>

      <div className="auth-stage">
        <div className="auth-card" ref={card} onMouseMove={tilt} onMouseLeave={untilt}>
          <span className="beam top" aria-hidden />
          <span className="beam right" aria-hidden />
          <span className="beam bottom" aria-hidden />
          <span className="beam left" aria-hidden />

          <div className="auth-glass">
            <header className="auth-head">
              <img className="auth-logo" src="/logo.png" alt="" width={56} height={56} />
              <h1>{t(signUp ? 'auth.createTitle' : 'auth.welcome')}</h1>
              <p className="muted small">{t('auth.sub', { shop: state.settings.shopName })}</p>
            </header>

            <form className="form" onSubmit={submit} noValidate>
              {signUp && (
                <AuthField icon={<UserRound size={16} />} label={t('auth.name')} error={errors.name}>
                  <input autoComplete="name" value={f.name} onChange={(e) => set({ name: e.target.value })} />
                </AuthField>
              )}
              <AuthField icon={signUp ? <Phone size={16} /> : <UserRound size={16} />} label={t(signUp ? 'auth.phone' : 'auth.id')} error={errors.login}>
                <input type={signUp ? 'tel' : 'text'} dir="ltr" autoComplete={signUp ? 'tel' : 'username'} value={f.login} onChange={(e) => set({ login: e.target.value })} />
              </AuthField>
              <AuthField
                icon={<Lock size={16} />}
                label={t('auth.password')}
                error={errors.password}
                end={
                  <button type="button" className="auth-eye" onClick={() => setShow(!show)} aria-label={t(show ? 'auth.hide' : 'auth.show')} aria-pressed={show}>
                    {show ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                }
              >
                <input
                  type={show ? 'text' : 'password'}
                  dir="ltr"
                  autoComplete={signUp ? 'new-password' : 'current-password'}
                  value={f.password}
                  onChange={(e) => set({ password: e.target.value })}
                />
              </AuthField>

              {!signUp && (
                <button type="button" className="link small auth-forgot" onClick={() => setHint(t('auth.forgotHint'))}>
                  {t('auth.forgot')}
                </button>
              )}
              {hint && <p className="muted small">{hint}</p>}
              {error && (
                <p className="auth-error" role="alert">
                  {error}
                </p>
              )}

              <button type="submit" className="btn primary auth-submit" disabled={busy} aria-busy={busy}>
                {busy ? t('auth.signingIn') : t(signUp ? 'auth.create' : 'auth.signIn')} {!busy && <Next size={16} aria-hidden />}
              </button>
            </form>

            <p className="auth-switch small">
              {t(signUp ? 'auth.haveAccount' : 'auth.noAccount')}{' '}
              <button
                type="button"
                className="link"
                onClick={() => {
                  setSignUp(!signUp)
                  setErrors({})
                  setError('')
                }}
              >
                {t(signUp ? 'auth.signIn' : 'auth.create')}
              </button>
            </p>
          </div>
        </div>

      </div>
    </div>
  )
}

function AuthField(props: { icon: ReactNode; label: string; error?: string; end?: ReactNode; children: ReactElement<{ id?: string; 'aria-invalid'?: boolean; 'aria-describedby'?: string }> }) {
  const id = `auth-${props.label.replace(/\s+/g, '-')}`
  return (
    <div className="field">
      <label htmlFor={id}>{props.label}</label>
      <div className="auth-input">
        <span className="auth-icon" aria-hidden>
          {props.icon}
        </span>
        {cloneElement(props.children, { id, 'aria-invalid': !!props.error, 'aria-describedby': props.error ? `${id}-err` : undefined })}
        {props.end}
      </div>
      {props.error && (
        <p className="field-error" id={`${id}-err`}>
          {props.error}
        </p>
      )}
    </div>
  )
}

