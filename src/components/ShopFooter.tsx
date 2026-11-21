import { MapPin, MessageCircle, Phone, Star, Wallet } from 'lucide-react'
import { DEVELOPER, MAP_DIRECTIONS, MAP_EMBED, SALON } from '../config'

/**
 * Shop info under the public wait board: call, follow, pay, visit. Arabic only, like the board itself,
 * and standalone on purpose: no store, no i18n.ts, no admin stylesheet (styles live in public.css).
 */
const L = {
  tagline: 'مش مجرد حلاقة.. دي أناقة وثقة وشياكة في كل تفصيلة 👑',
  call: 'اتصل بنا',
  reviews: 'تقييماتنا على جوجل',
  follow: 'تابعنا',
  pay: 'الدفع',
  visit: 'زورونا',
  directions: 'الاتجاهات على الخريطة',
  rights: (year: number) => `© ${year} ${SALON.name}. جميع الحقوق محفوظة.`,
  credit: 'تصميم وتطوير',
}

// lucide-react no longer ships brand logos, so these are small inline marks.
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

const SOCIAL = [
  { key: 'facebook', href: SALON.facebook, label: 'Facebook' },
  { key: 'instagram', href: SALON.instagram, label: 'Instagram' },
  { key: 'tiktok', href: SALON.tiktok, label: 'TikTok' },
  { key: 'snapchat', href: SALON.snapchat, label: 'Snapchat' },
] as const

export default function ShopFooter() {
  return (
    <footer className="sf" dir="rtl">
      <div className="sf-inner">
        <div className="sf-col">
          <div className="sf-brand">
            <img src="/logo.png" alt="" width={40} height={40} loading="lazy" />
            <strong>{SALON.name}</strong>
          </div>
          <p className="sf-tagline">{L.tagline}</p>
        </div>

        <div className="sf-col">
          <p className="sf-title">{L.call}</p>
          <a className="sf-link" href={`tel:${SALON.phoneIntl}`}>
            <Phone size={16} aria-hidden /> <span dir="ltr">{SALON.phone}</span>
          </a>
          <a className="sf-link" href={`https://wa.me/${SALON.whatsapp}`} target="_blank" rel="noreferrer">
            <MessageCircle size={16} aria-hidden /> WhatsApp
          </a>
          <a className="sf-link" href={SALON.reviews} target="_blank" rel="noreferrer">
            <Star size={16} aria-hidden /> {L.reviews}
          </a>
        </div>

        <div className="sf-col">
          <p className="sf-title">{L.follow}</p>
          <div className="sf-socials">
            {SOCIAL.map((x) => (
              <a key={x.key} className="sf-social" href={x.href} target="_blank" rel="noreferrer" aria-label={x.label}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  {Brandmark[x.key]}
                </svg>
              </a>
            ))}
          </div>
          <p className="sf-title">{L.pay}</p>
          <a className="sf-link" href={SALON.instapay} target="_blank" rel="noreferrer">
            <Wallet size={16} aria-hidden /> InstaPay
          </a>
          <a className="sf-link" href={SALON.vodafoneCash} target="_blank" rel="noreferrer">
            <Wallet size={16} aria-hidden /> Vodafone Cash
          </a>
        </div>

        <div className="sf-col sf-map">
          <p className="sf-title">{L.visit}</p>
          <iframe title={L.visit} src={MAP_EMBED} loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
          <a className="sf-link" href={MAP_DIRECTIONS} target="_blank" rel="noreferrer">
            <MapPin size={16} aria-hidden /> {L.directions}
          </a>
        </div>
      </div>

      <div className="sf-copy">
        <span>{L.rights(new Date().getFullYear())}</span>
        <span>
          {L.credit}{' '}
          <a className="sf-credit" href={DEVELOPER.github} target="_blank" rel="noreferrer">
            {DEVELOPER.name}
          </a>
        </span>
      </div>
    </footer>
  )
}

/** Top bar of the public page: logo, shop name and a one-tap call button. */
export function ShopHeader() {
  return (
    <header className="ph" dir="rtl">
      <div className="ph-brand">
        <img src="/logo.png" alt="" width={40} height={40} fetchPriority="high" />
        <span>{SALON.name}</span>
      </div>
      <a className="ph-call" href={`tel:${SALON.phoneIntl}`}>
        <Phone size={16} aria-hidden /> {L.call}
      </a>
    </header>
  )
}
