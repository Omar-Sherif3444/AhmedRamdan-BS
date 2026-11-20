# Ahmed Ramdan Barber Shop — Project Documentation

Live site: https://ahmed-ramdan-barbershop.vercel.app
Designed and developed by Omar Sherif (https://github.com/Omar-Sherif3444)

---

## 1. What the app is

A live seating board and management system for one barbershop with **7 seats**:

- a **3-seat waiting sofa** (Seat 1–3), and
- **4 barber chairs** (Chair 1–4).

Every seat is always in one of four states, shown everywhere with the same colours:

| Status | Arabic | Colour | Meaning |
|---|---|---|---|
| Available | متاح | Green | Free right now |
| Occupied | مشغول | Red | A customer is being served / sitting |
| Reserved | محجوز | Gold | Held for a customer (by staff, or booked online) |
| Out of service | خارج الخدمة | Grey | Not in use |

Changes made on one device appear on every other open screen within about a second (Supabase Realtime).

The site is **Arabic first** (right-to-left) with a one-click switch to **English**. It uses a light theme only and works on phones, tablets and desktops.

---

## 2. Who uses it and what they can do

Everyone signs in on the same page (`#/login`). The credentials decide where the user lands — there are no tabs to choose a role.

### 2.1 Visitors (not signed in) — home page `#/`
- See the live 3D shop floor (drag to look around) and the status of all 7 seats.
- See counts per status (available / occupied / reserved / out of service).
- Never see customer names or any personal details.
- Footer: phone, WhatsApp, Google reviews, Facebook, Instagram, TikTok, Snapchat, InstaPay, Vodafone Cash, a map of the shop with "Get directions", and the developer credit.
- A link invites them to sign in to reserve a sofa seat.

### 2.2 Customers (signed in with phone number + password)
- Create an account from the sign-in page ("New customer? Create account"): name, phone, password (6+ characters). No SMS code is sent.
- If staff already registered them as a walk-in with the same phone number, the new account is linked to that history automatically.
- See **My visits**: their last 10 visits with service, date, barber, amount and status.
- **Reserve a sofa seat online:**
  - "Reserve this seat" appears on each free sofa seat.
  - One reservation per customer at a time.
  - The seat is held for **1 hour**, then freed automatically (checked every minute).
  - They see "Reserved for you · until HH:MM" and can cancel it.
  - Only sofa seats can be booked online; barber chairs are managed by staff.

### 2.3 Staff (barbers and receptionists, signed in with email + password) — `#/floor`
Pages: **Shop Floor**, **Customers**, **Transactions**.

- **Shop Floor:** tap any seat (in the 3D view or on its card) to manage it.
  - *Available seat:* check in a customer: name (suggests known customers), service (optional, fills the price), amount paid, phone (optional), payment method (cash / card / wallet), barber, and "another customer is waiting after this one". Or reserve the seat, or mark it out of service.
  - *Occupied seat:* see customer, phone, barber, service, start time and minutes elapsed; correct the amount or payment method; **Complete** the service (seat becomes available, or reserved if someone is waiting next) or **Release** it (visit is cancelled).
  - *Reserved seat:* start a service on it, cancel the reservation, or mark it out of service. Online bookings show the customer's name and the expiry time.
  - *Out of service:* restore it.
- **Customers:** list with phone, number of visits, last visit and total spent.
- **Transactions:** every visit with filters (date range, barber, status), sorting, paging and **CSV export**.

### 2.4 Owner — `#/dashboard`
Everything staff can do, plus an **Owner area**:

- **Dashboard:**
  - KPIs: revenue today / this week / this month, visits today, average transaction, occupied and available seats, active employees.
  - A live 3D shop floor.
  - 3D bar charts for revenue over time, visits over time, busy hours, and revenue and visits per barber, each for a chosen date range.
- **Reports:** revenue, visits, average ticket, distinct customers and cancellations for any date range; revenue trend and visit trend charts; per-employee performance table with revenue share; **CSV export** (daily report, employee report).
- **Employees:** add barbers/receptionists with their own sign-in email and password, edit details, change email or password, deactivate/reactivate. A deactivated employee can no longer sign in. The owner account itself cannot be deactivated or demoted.
- **Settings:** shop name, currency (EGP, SAR, AED, USD, EUR), language, custom seat labels, and the service catalogue (Arabic name, English name, price, active/inactive).

---

## 3. Technology

| Part | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite 8, plain CSS (design tokens, logical properties for RTL) |
| 3D | three.js 0.186 (OrbitControls, CSS2D labels, RoomEnvironment), loaded lazily |
| Icons | lucide-react, plus small inline SVG brand marks for social networks |
| Font | IBM Plex Sans Arabic (Google Fonts) |
| Backend | Supabase: Postgres, Auth, Realtime, Edge Functions, pg_cron |
| Hosting | Vercel (static build) |
| Tests | Node's built-in test runner (`node:test`) |

Routing uses the URL hash (`#/floor`, `#/dashboard`, …), so the site needs no server-side routing.

---

## 4. Folder structure

```
index.html                 Page shell, favicon, title, social-share (Open Graph) tags
public/
  logo.png                 The salon's crowned "AR" monogram (logo, favicon, sign-in card)
  og.jpg                   Image shown when the link is shared
src/
  main.tsx                 Entry point
  App.tsx                  Public page, footer, staff/owner shell, navigation, top bar
  store.tsx                App state, Supabase loading, realtime reload, language, toasts
  config.ts                Salon contact details, social/payment links, map location, credit
  i18n.ts                  All Arabic and English text, number/date/money formatting
  types.ts                 Data types (Seat, Visit, Customer, Employee, Service, …)
  styles.css               All styling
  components/
    Three3D.tsx            3D shop floor (Floor3D) and 3D bar charts (Bars3D)
    Charts.tsx             2D charts (area chart, columns)
    ui.tsx                 Shared UI: Card, Kpi, Field, Modal, badges, date range picker
  pages/
    SignIn.tsx             Sign-in and customer sign-up card
    Floor.tsx              Shop floor (staff) and public read-only floor, online sofa booking
    Customers.tsx, Transactions.tsx, Dashboard.tsx, Reports.tsx, Employees.tsx, Settings.tsx
  lib/
    api.ts                 Supabase data layer: load, actions → server functions, sign-in
    reducer.ts             Instant local state changes (the server stays the source of truth)
    calc.ts                Revenue/visit maths, date ranges, CSV export
    auth.ts                Email/phone normalisation
    supabase.ts            Supabase client (public URL + anon key)
    seed.ts                Deterministic sample data for tests only
    logic.test.ts          Unit tests
supabase/
  config.toml              Supabase CLI config
  migrations/              Database schema, security rules and server functions (in order)
  functions/admin-users/   Edge function: owner-only creation/update of staff logins
```

---

## 5. Data model (Supabase Postgres)

| Table | Contents |
|---|---|
| `settings` | Single row: shop name, currency |
| `seats` | `s1–s3` (sofa), `c1–c4` (chairs): status, custom label, current visit, `since`, `reserved_by` (customer), `reserved_until` |
| `staff` | One row per staff login: name, role (`owner`, `barber`, `receptionist`), phone, email, active, joined date |
| `customers` | Name, phone (unique when set), optional link to a customer login (`user_id`) |
| `services` | Arabic/English name, price, active |
| `visits` | Customer, barber, seat, service, amount, payment method, status (`in_progress`, `completed`, `cancelled`), start/end time, "someone waiting next" flag |

### 5.1 Security model
- **Row-level security is on for every table.**
  - Anyone can read settings, seats and services; seats carry no personal data.
  - Staff can read staff, customers and visits.
  - A customer can read only their own customer row and their own visits.
- **The browser never writes to tables directly.** Every change goes through a server function that checks the caller's role first:

| Function | Who | Purpose |
|---|---|---|
| `register_visit` | Staff | Check a customer into a seat (matches returning customers by phone, else by exact name) |
| `end_visit` | Staff | Complete or release a visit |
| `set_expect_next` | Staff | Toggle "another customer is waiting" |
| `set_seat_status` | Staff | Reserve / cancel reservation / out of service / restore |
| `update_payment` | Staff | Correct amount or payment method |
| `save_settings`, `set_seat_label`, `save_service`, `update_staff` | Owner | Shop settings, seat labels, services, employee details |
| `phone_has_account` | Anyone | Sign-up check: is this phone already registered? |
| `claim_customer` | Signed-in user | Create or link the customer record after sign-up |
| `reserve_sofa_seat`, `cancel_my_reservation` | Signed-in customer | Online sofa booking (1 hour, one at a time) |
| `expire_reservations` | Database only | Run every minute by pg_cron to free expired bookings |

- **Staff logins** are created and changed only through the `admin-users` edge function. It runs on Supabase with the service-role key, checks that the caller is an active owner, and keeps the login and the `staff` row in step.
- **Customers sign in with a phone number.** Supabase Auth needs an email, so each phone is mapped to a private address `<digits>@phone.ahmed-ramdan-barbershop.vercel.app`. No SMS verification is done (a deliberate choice; add phone OTP before trusting phone numbers for anything sensitive).
- Secrets (database password, service-role key) are never in the browser or in the Vercel upload. Only the public Supabase URL and anon key are shipped, and the security rules above protect the data.

---

## 6. Configuration

### 6.1 Salon details — `src/config.ts`
Phone, WhatsApp number (international format, digits only), Facebook, Instagram, TikTok, Snapchat, InstaPay, Vodafone Cash, Google reviews link, and the map location (latitude/longitude). The footer, map and "Get directions" link are built from these values. Edit this file and redeploy to change them.

### 6.2 Environment files (project root)
| File | Contents | Shipped? |
|---|---|---|
| `.env` | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (public) | Yes, as Vercel config values |
| `.env.supabase` | `SUPABASE_DB_PASSWORD` (secret) | **Never.** Excluded by `.vercelignore` |

### 6.3 Hosting accounts
- **Vercel** project: `ahmed-ramdan-barbershop`.
- **Supabase** project ref: `uwzkcxooydeahrdutgfe` (region eu-central-1, free plan).
- **Auth:** email confirmation is off.

---

## 7. Running and changing the project

Requirements: Node.js 20+ and npm.

```bash
npm install          # once
npm run dev          # local development server (uses the live Supabase project from .env)
npm test             # unit tests
npm run build        # type-check and production build into dist/
```

### 7.1 Deploying the website
```bash
npx vercel deploy --prod
```
The production URL updates automatically.

### 7.2 Changing the database
1. Add a new file in `supabase/migrations/` named `YYYYMMDDHHMMSS_description.sql`. Never edit an already-applied migration.
2. Apply it to the live project, with the password from `.env.supabase` in the environment:
   ```bash
   npx supabase db push --linked
   ```
3. Any new write operation should be a `security definer` function that checks `is_staff()` / `is_owner()` / the signed-in customer, followed by `grant execute … to authenticated`.

### 7.3 Updating the edge function
```bash
npx supabase functions deploy admin-users
```

---

## 8. Accounts

### 8.1 Creating the owner account
The owner is created once, by hand, in the Supabase dashboard:

1. **Authentication → Users → Add user:** enter the owner's email and a password, and tick "Auto confirm user".
2. Copy the new user's ID, then run in the **SQL editor**:
   ```sql
   insert into staff (id, email, name, role)
   values ('<user id>', '<owner email in lower case>', '<owner name>', 'owner');
   ```
The owner then signs in at `#/login` and is taken to the dashboard.

### 8.2 Other accounts
- **Barbers and receptionists:** the owner adds them in **Employees**. They sign in with their email and are taken to the Shop Floor.
- **Customers:** they create their own accounts on the sign-in page.

### 8.3 Removing a test account
1. Delete the user in **Authentication → Users**. Its `staff` row is removed automatically.
2. If it recorded test visits, delete those first, because visits keep a reference to the staff member:
   ```sql
   update seats set status = 'available', visit_id = null, since = null where visit_id in (select id from visits where employee_id = '<user id>');
   delete from visits where employee_id = '<user id>';
   ```

---

## 9. Behaviour details worth knowing

- **Completing vs releasing:**
  - *Complete* marks the visit as completed and counts it in revenue.
  - *Release* marks it cancelled: it isn't counted, and it shows struck through in history.
- **"Another customer is waiting after this one":** when that visit is completed, the seat becomes *reserved* instead of available.
- **Online sofa bookings:**
  - They clear automatically when staff check the customer in, cancel the reservation, or mark the seat out of service.
  - They also clear after 1 hour.
- **Saving and errors:** the screen updates instantly, then saves on the server and reloads. If the server refuses a change (for example, another device changed the seat first), the screen returns to the real state and shows a message.
- **History loaded:** the browser loads about 13 months of visit history for the dashboard and reports. If the history grows very large, move the reports to server-side totals (marked with a `shortcut:` comment in `src/lib/api.ts`).
- **Accessibility:** keyboard-usable dialogs, focus on the first invalid field, screen-reader labels for seats and the 3D view, and reduced motion when the device asks for it.

---

## 10. Contact details currently on the site

| | |
|---|---|
| Phone / WhatsApp | 010 9492 8882 |
| Instagram | instagram.com/ahmed_ramdan_barbershop1 |
| Facebook | facebook.com/share/1EmewG7EQh |
| TikTok | tiktok.com/@a.ramadan204 |
| Snapchat | snapchat.com/t/tlcu1Fg1 |
| Payments | InstaPay, Vodafone Cash |
| Location | 30.051039, 31.355562 (map and directions in the footer) |

Source: the salon's Safe Code profile.
