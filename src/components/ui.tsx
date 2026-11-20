import { cloneElement, useEffect, useId, useRef, useState, type ReactElement, type ReactNode } from 'react'
import { X, type LucideIcon } from 'lucide-react'
import { useStore } from '../store'
import { presetRange, type Preset } from '../lib/calc'
import type { DateRange, SeatStatus, VisitStatus } from '../types'

/** Native <dialog>: focus trap, Esc and inert background come from the browser. */
export function Modal(props: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null)
  const { t } = useStore().i18n
  useEffect(() => {
    const d = ref.current!
    if (props.open && !d.open) d.showModal()
    if (!props.open && d.open) d.close()
  }, [props.open])
  return (
    <dialog
      ref={ref}
      className={props.wide ? 'modal wide' : 'modal'}
      onClose={props.onClose}
      onClick={(e) => e.target === ref.current && props.onClose()}
      aria-labelledby={props.open ? 'modal-title' : undefined}
    >
      {props.open && (
        <>
          <header className="modal-head">
            <h2 id="modal-title">{props.title}</h2>
            <button className="icon-btn" onClick={props.onClose} aria-label={t('c.close')}>
              <X size={18} />
            </button>
          </header>
          <div className="modal-body">{props.children}</div>
          {props.footer && <footer className="modal-foot">{props.footer}</footer>}
        </>
      )}
    </dialog>
  )
}

type Control = ReactElement<{ id?: string; 'aria-invalid'?: boolean; 'aria-describedby'?: string }>

export function Field(props: { label: string; error?: string; hint?: string; optional?: boolean; children: Control }) {
  const id = useId()
  const { t } = useStore().i18n
  const note = props.error ? `${id}-err` : props.hint ? `${id}-hint` : undefined
  return (
    <div className="field">
      <label htmlFor={id}>
        {props.label}
        {props.optional && <span className="muted"> ({t('c.optional')})</span>}
      </label>
      {cloneElement(props.children, { id, 'aria-invalid': !!props.error, 'aria-describedby': note })}
      {props.error ? (
        <p className="field-error" id={note}>
          {props.error}
        </p>
      ) : (
        props.hint && (
          <p className="field-hint" id={note}>
            {props.hint}
          </p>
        )
      )}
    </div>
  )
}

export function Card(props: { title?: string; sub?: string; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card ${props.className ?? ''}`}>
      {(props.title || props.actions) && (
        <header className="card-head">
          <div>
            {props.title && <h2>{props.title}</h2>}
            {props.sub && <p className="muted small">{props.sub}</p>}
          </div>
          {props.actions}
        </header>
      )}
      {props.children}
    </section>
  )
}

export function Kpi(props: { icon: LucideIcon; label: string; value: string; sub?: string }) {
  const Icon = props.icon
  return (
    <div className="kpi">
      <span className="kpi-icon" aria-hidden>
        <Icon size={18} />
      </span>
      <div>
        <p className="kpi-label">{props.label}</p>
        <p className="kpi-value">{props.value}</p>
        {props.sub && <p className="muted small">{props.sub}</p>}
      </div>
    </div>
  )
}

export function Empty(props: { icon: LucideIcon; title: string; hint?: string; action?: ReactNode }) {
  const Icon = props.icon
  return (
    <div className="empty">
      <Icon size={28} aria-hidden />
      <p className="empty-title">{props.title}</p>
      {props.hint && <p className="muted">{props.hint}</p>}
      {props.action}
    </div>
  )
}

export function VisitBadge({ status }: { status: VisitStatus }) {
  const { t } = useStore().i18n
  return <span className={`badge v-${status}`}>{t(`v.${status}`)}</span>
}

export function SeatBadge({ status }: { status: SeatStatus }) {
  const { t } = useStore().i18n
  return <span className={`badge s-${status}`}>{t(`seat.${status}`)}</span>
}

const PRESETS: Preset[] = ['today', '7d', '30d', 'month', '90d']

export function useRange(initial: Preset = '30d') {
  return useState<DateRange>(() => presetRange(initial))
}

export function RangePicker({ value, onChange }: { value: DateRange; onChange: (r: DateRange) => void }) {
  const { t } = useStore().i18n
  const active = PRESETS.find((p) => {
    const r = presetRange(p)
    return r.from === value.from && r.to === value.to
  })
  return (
    <div className="range" role="group" aria-label={t('c.range')}>
      <div className="segmented">
        {PRESETS.map((p) => (
          <button key={p} className={active === p ? 'on' : ''} aria-pressed={active === p} onClick={() => onChange(presetRange(p))}>
            {t(`r.${p}`)}
          </button>
        ))}
      </div>
      <div className="range-dates">
        <label>
          <span className="sr-only">{t('c.from')}</span>
          <input type="date" value={value.from} max={value.to} onChange={(e) => e.target.value && onChange({ ...value, from: e.target.value })} />
        </label>
        <span aria-hidden>–</span>
        <label>
          <span className="sr-only">{t('c.to')}</span>
          <input type="date" value={value.to} min={value.from} onChange={(e) => e.target.value && onChange({ ...value, to: e.target.value })} />
        </label>
      </div>
    </div>
  )
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
}
