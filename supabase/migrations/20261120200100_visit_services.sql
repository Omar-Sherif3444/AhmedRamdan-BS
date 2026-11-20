-- A visit holds several services, not one. Haircut + beard + wash is one customer,
-- one card, one entry.
--
-- Note for whoever picks this up: `visits.amount` stays a single number on the visit, so
-- revenue_totals(), calc.ts revenue, Reports and payroll are UNCHANGED. The join table
-- records *what was done*; money is still one figure per visit. `visits.service_id` is
-- kept and set to the first service so existing Transactions/Customers display keeps
-- working until those pages are refactored.

create table visit_services (
  visit_id uuid not null references visits (id) on delete cascade,
  service_id uuid not null references services (id),
  -- Price copied at registration: the catalogue may change later, history must not.
  price numeric(10, 2) not null check (price >= 0),
  primary key (visit_id, service_id)
);

create index visit_services_visit_idx on visit_services (visit_id);

alter table visit_services enable row level security;

-- Readable exactly where the parent visit is readable.
create policy "read visit_services with their visit" on visit_services for select to authenticated
  using (exists (select 1 from visits v where v.id = visit_id));

comment on column visits.service_id is
  'Deprecated: the first of visit_services. Kept so existing pages keep rendering a service name.';

-- Backfill history.
insert into visit_services (visit_id, service_id, price)
select v.id, v.service_id, coalesce(s.price, v.amount)
from visits v join services s on s.id = v.service_id
where v.service_id is not null
on conflict do nothing;

-- The operator never types money: the amount is the sum of the chosen services' prices.
-- A name is optional; an absent one becomes "عميل N" by the daily visit count.
create or replace function register_visit(
  p_seat text, p_name text, p_phone text, p_employee uuid, p_services uuid[],
  p_amount numeric, p_method pay_method, p_expect_next boolean
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_seat seats;
  v_phone text := norm_phone(p_phone);
  v_customer uuid;
  v_visit uuid;
  v_name text := trim(coalesce(p_name, ''));
  v_amount numeric;
  v_first uuid;
  v_n int;
begin
  if not is_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  perform check_new_method(p_method);
  if not exists (select 1 from staff where id = p_employee and active) then raise exception 'invalid_employee'; end if;

  if p_services is null or cardinality(p_services) = 0 then raise exception 'invalid_input'; end if;
  -- There is no min(uuid) in Postgres, and "first" should mean the operator's first
  -- chosen chip anyway, so take it from the argument rather than aggregating.
  select sum(price) into v_amount from services where id = any (p_services) and active;
  if v_amount is null then raise exception 'invalid_input'; end if;
  select id into v_first from services where id = p_services[1] and active;
  if v_first is null then raise exception 'invalid_input'; end if;

  -- An explicit amount still wins, so the operator can correct a price on the card.
  v_amount := coalesce(nullif(p_amount, 0), v_amount);
  if v_amount <= 0 then raise exception 'invalid_input'; end if;

  if v_name = '' then
    select count(*) + 1 into v_n from visits
    where started_at >= date_trunc('day', now() at time zone 'Africa/Cairo');
    v_name := 'عميل ' || v_n;
  end if;

  select * into v_seat from seats where id = p_seat for update;
  if v_seat.id is null or v_seat.status not in ('available', 'reserved') then raise exception 'seat_unavailable'; end if;

  if v_phone <> '' then select id into v_customer from customers where phone = v_phone; end if;
  if v_customer is null then
    select id into v_customer from customers
    where lower(trim(name)) = lower(v_name) and (v_phone = '' or phone = '') limit 1;
  end if;
  if v_customer is null then
    insert into customers (name, phone) values (v_name, v_phone) returning id into v_customer;
  elsif v_phone <> '' then
    update customers set phone = v_phone where id = v_customer and phone = '';
  end if;

  insert into visits (customer_id, employee_id, seat_id, service_id, amount, method, expect_next, created_by)
  values (v_customer, p_employee, p_seat, v_first, v_amount, p_method, coalesce(p_expect_next, false), auth.uid())
  returning id into v_visit;

  insert into visit_services (visit_id, service_id, price)
  select v_visit, s.id, s.price from services s where s.id = any (p_services) and s.active;

  update seats set status = 'occupied', visit_id = v_visit, since = now() where id = p_seat;
  return v_visit;
end $$;

-- The single-service signature is gone; drop it so a stale client fails loudly
-- instead of silently writing a visit with no services attached.
drop function if exists register_visit(text, text, text, uuid, uuid, numeric, pay_method, boolean);

-- No blanket revoke here: the previous migration grants staff_login_email to anon and a
-- `revoke ... from anon` would silently strip it. Grant the new signature only.
revoke execute on function register_visit(text, text, text, uuid, uuid[], numeric, pay_method, boolean) from public;
grant execute on function register_visit(text, text, text, uuid, uuid[], numeric, pay_method, boolean) to authenticated;
