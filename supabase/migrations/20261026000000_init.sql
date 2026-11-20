-- Barbershop schema.
-- Reads are open only as far as row-level security allows; every write goes through a
-- security-definer function that checks the caller's role, so the browser never writes tables directly.

create type staff_role as enum ('owner', 'barber', 'receptionist');
create type seat_kind as enum ('sofa', 'chair');
create type seat_status as enum ('available', 'occupied', 'reserved', 'out_of_service');
create type pay_method as enum ('cash', 'card', 'wallet');
create type visit_status as enum ('in_progress', 'completed', 'cancelled');

create table settings (
  id int primary key default 1 check (id = 1),
  shop_name text not null,
  currency text not null default 'EGP'
);

create table staff (
  id uuid primary key references auth.users on delete cascade,
  name text not null,
  role staff_role not null,
  phone text not null default '',
  email text not null,
  active boolean not null default true,
  joined_at date not null default current_date
);

create table customers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users on delete set null,
  name text not null,
  phone text not null default '',
  created_at timestamptz not null default now()
);
create unique index customers_phone_key on customers (phone) where phone <> '';

create table services (
  id uuid primary key default gen_random_uuid(),
  name_ar text not null,
  name_en text not null,
  price numeric(10, 2) not null check (price >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table seats (
  id text primary key,
  kind seat_kind not null,
  number int not null,
  status seat_status not null default 'available',
  label text not null default '',
  visit_id uuid,
  -- When the current customer sat down; public so the customer view can show elapsed time without reading visits.
  since timestamptz
);

create table visits (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers,
  employee_id uuid not null references staff,
  seat_id text not null references seats,
  service_id uuid references services,
  amount numeric(10, 2) not null check (amount > 0),
  method pay_method not null default 'cash',
  status visit_status not null default 'in_progress',
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  expect_next boolean not null default false
);
alter table seats add constraint seats_visit_fk foreign key (visit_id) references visits on delete set null;
create index visits_started_at_idx on visits (started_at desc);
create index visits_customer_idx on visits (customer_id);

-- Role helpers ------------------------------------------------------------------------------

create function is_staff() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from staff where id = auth.uid() and active)
$$;

create function is_owner() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from staff where id = auth.uid() and active and role = 'owner')
$$;

create function norm_phone(p text) returns text language sql immutable as $$
  select regexp_replace(coalesce(p, ''), '[\s-]', '', 'g')
$$;

-- Row-level security: reads ----------------------------------------------------------------

alter table settings enable row level security;
alter table staff enable row level security;
alter table customers enable row level security;
alter table services enable row level security;
alter table seats enable row level security;
alter table visits enable row level security;

create policy "public reads settings" on settings for select using (true);
create policy "public reads seats" on seats for select using (true);
create policy "public reads services" on services for select using (true);
create policy "staff read staff" on staff for select to authenticated using (is_staff() or id = auth.uid());
create policy "staff or self read customers" on customers for select to authenticated using (is_staff() or user_id = auth.uid());
create policy "staff or own read visits" on visits for select to authenticated
  using (is_staff() or customer_id in (select id from customers where user_id = auth.uid()));

-- Floor operations (any active staff) ------------------------------------------------------

create function register_visit(
  p_seat text, p_name text, p_phone text, p_employee uuid, p_service uuid,
  p_amount numeric, p_method pay_method, p_expect_next boolean
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_seat seats;
  v_phone text := norm_phone(p_phone);
  v_customer uuid;
  v_visit uuid;
begin
  if not is_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  if length(trim(coalesce(p_name, ''))) < 2 or coalesce(p_amount, 0) <= 0 then raise exception 'invalid_input'; end if;
  if not exists (select 1 from staff where id = p_employee and active) then raise exception 'invalid_employee'; end if;
  select * into v_seat from seats where id = p_seat for update;
  if v_seat.id is null or v_seat.status not in ('available', 'reserved') then raise exception 'seat_unavailable'; end if;

  -- A returning customer is matched by phone, else by exact name among records without a phone.
  if v_phone <> '' then select id into v_customer from customers where phone = v_phone; end if;
  if v_customer is null then
    select id into v_customer from customers
    where lower(trim(name)) = lower(trim(p_name)) and (v_phone = '' or phone = '') limit 1;
  end if;
  if v_customer is null then
    insert into customers (name, phone) values (trim(p_name), v_phone) returning id into v_customer;
  elsif v_phone <> '' then
    update customers set phone = v_phone where id = v_customer and phone = '';
  end if;

  insert into visits (customer_id, employee_id, seat_id, service_id, amount, method, expect_next)
  values (v_customer, p_employee, p_seat, p_service, p_amount, p_method, coalesce(p_expect_next, false))
  returning id into v_visit;
  update seats set status = 'occupied', visit_id = v_visit, since = now() where id = p_seat;
  return v_visit;
end $$;

create function end_visit(p_seat text, p_complete boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_seat seats;
  v_next boolean;
begin
  if not is_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into v_seat from seats where id = p_seat for update;
  if v_seat.status is distinct from 'occupied' then raise exception 'seat_not_occupied'; end if;
  select expect_next into v_next from visits where id = v_seat.visit_id;
  update visits set status = case when p_complete then 'completed'::visit_status else 'cancelled'::visit_status end, ended_at = now()
  where id = v_seat.visit_id;
  -- Completing keeps the seat held when another customer is expected; releasing always frees it.
  update seats set status = case when p_complete and v_next then 'reserved'::seat_status else 'available'::seat_status end,
    visit_id = null, since = null
  where id = p_seat;
end $$;

create function set_expect_next(p_seat text, p_value boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  update visits set expect_next = p_value where id = (select visit_id from seats where id = p_seat and status = 'occupied');
end $$;

create function set_seat_status(p_seat text, p_status seat_status) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_from seat_status;
begin
  if not is_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  select status into v_from from seats where id = p_seat for update;
  if v_from is null or v_from = 'occupied' or p_status = 'occupied'
    or (p_status = 'reserved' and v_from <> 'available')
    or (p_status = 'available' and v_from not in ('reserved', 'out_of_service')) then
    raise exception 'invalid_transition';
  end if;
  update seats set status = p_status where id = p_seat;
end $$;

create function update_payment(p_visit uuid, p_amount numeric, p_method pay_method) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  if coalesce(p_amount, 0) <= 0 then raise exception 'invalid_input'; end if;
  update visits set amount = p_amount, method = p_method where id = p_visit;
end $$;

-- Owner operations -----------------------------------------------------------------------

create function save_settings(p_shop_name text, p_currency text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_owner() then raise exception 'forbidden' using errcode = '42501'; end if;
  if length(trim(coalesce(p_shop_name, ''))) = 0 then raise exception 'invalid_input'; end if;
  update settings set shop_name = trim(p_shop_name), currency = p_currency where id = 1;
end $$;

create function set_seat_label(p_seat text, p_label text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_owner() then raise exception 'forbidden' using errcode = '42501'; end if;
  update seats set label = trim(coalesce(p_label, '')) where id = p_seat;
end $$;

create function save_service(p_id uuid, p_name_ar text, p_name_en text, p_price numeric, p_active boolean) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := p_id;
begin
  if not is_owner() then raise exception 'forbidden' using errcode = '42501'; end if;
  if coalesce(p_price, -1) < 0 or trim(coalesce(p_name_ar, '')) = '' or trim(coalesce(p_name_en, '')) = '' then
    raise exception 'invalid_input';
  end if;
  if v_id is null or not exists (select 1 from services where id = v_id) then
    insert into services (name_ar, name_en, price, active) values (trim(p_name_ar), trim(p_name_en), p_price, p_active) returning id into v_id;
  else
    update services set name_ar = trim(p_name_ar), name_en = trim(p_name_en), price = p_price, active = p_active where id = v_id;
  end if;
  return v_id;
end $$;

-- Profile fields only; sign-in email and password changes go through the admin-users edge function.
create function update_staff(p_id uuid, p_name text, p_phone text, p_role staff_role, p_active boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_target staff;
begin
  if not is_owner() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into v_target from staff where id = p_id;
  if v_target.id is null then raise exception 'not_found'; end if;
  -- The owner keeps the owner role and stays active, so the shop always has someone in charge.
  if v_target.role = 'owner' and (p_role <> 'owner' or not p_active) then raise exception 'owner_locked'; end if;
  if p_role = 'owner' and v_target.role <> 'owner' then raise exception 'owner_locked'; end if;
  update staff set name = trim(p_name), phone = norm_phone(p_phone), role = p_role, active = p_active where id = p_id;
end $$;

-- Customer accounts ----------------------------------------------------------------------

create function phone_has_account(p_phone text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from customers where phone = norm_phone(p_phone) and user_id is not null)
$$;

-- Links the signed-in user to their customer record, claiming a walk-in record with the same phone.
-- shortcut: no SMS verification of the phone number; add phone OTP before trusting it for anything sensitive.
create function claim_customer(p_name text, p_phone text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_phone text := norm_phone(p_phone);
  v_customer customers;
begin
  if v_uid is null then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into v_customer from customers where user_id = v_uid;
  if v_customer.id is not null then return v_customer.id; end if;
  if v_phone = '' or length(trim(coalesce(p_name, ''))) < 2 then raise exception 'invalid_input'; end if;
  select * into v_customer from customers where phone = v_phone for update;
  if v_customer.id is not null then
    if v_customer.user_id is not null then raise exception 'phone_taken'; end if;
    update customers set user_id = v_uid where id = v_customer.id;
    return v_customer.id;
  end if;
  insert into customers (name, phone, user_id) values (trim(p_name), v_phone, v_uid) returning id into v_customer.id;
  return v_customer.id;
end $$;

-- Only signed-in users may call the floor/owner functions; the role checks inside decide the rest.
revoke execute on all functions in schema public from public, anon;
grant execute on function phone_has_account(text) to anon, authenticated;
grant execute on function is_staff(), is_owner(), norm_phone(text) to authenticated;
grant execute on function register_visit(text, text, text, uuid, uuid, numeric, pay_method, boolean),
  end_visit(text, boolean), set_expect_next(text, boolean), set_seat_status(text, seat_status),
  update_payment(uuid, numeric, pay_method), save_settings(text, text), set_seat_label(text, text),
  save_service(uuid, text, text, numeric, boolean), update_staff(uuid, text, text, staff_role, boolean),
  claim_customer(text, text) to authenticated;

-- Live updates for every screen.
alter publication supabase_realtime add table seats, visits, customers, services, staff, settings;

-- Clean start: the shop, its seven seats and the service catalog.
insert into settings (shop_name, currency) values ('Ahmed Ramdan Barber Shop', 'EGP');
insert into seats (id, kind, number) values
  ('s1', 'sofa', 1), ('s2', 'sofa', 2), ('s3', 'sofa', 3),
  ('c1', 'chair', 1), ('c2', 'chair', 2), ('c3', 'chair', 3), ('c4', 'chair', 4);
insert into services (name_ar, name_en, price, created_at) values
  ('قص شعر', 'Haircut', 120, now()),
  ('تهذيب لحية', 'Beard trim', 70, now() + interval '1 second'),
  ('قص شعر ولحية', 'Haircut & beard', 170, now() + interval '2 seconds'),
  ('حلاقة أطفال', 'Kids cut', 90, now() + interval '3 seconds'),
  ('حلاقة ذقن بالموس', 'Hot towel shave', 80, now() + interval '4 seconds'),
  ('صبغة شعر', 'Hair coloring', 250, now() + interval '5 seconds'),
  ('تنظيف بشرة', 'Facial', 150, now() + interval '6 seconds');
