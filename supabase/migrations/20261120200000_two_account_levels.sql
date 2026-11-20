-- Two account levels (admin, operator) + login-less barbers, and the removal of
-- customer self-service. See products/salon/SPEC.md.
--
-- Deliberate choices worth knowing before you edit this:
--   * `is_owner()` keeps its NAME and only changes its BODY to check role = 'admin'.
--     It is called from ~20 functions and policies; renaming it would touch all of them
--     for no behavioural gain. `is_admin()` is added as the name to use from here on.
--   * `staff.id` stays equal to `auth.users.id` for account holders. Only the foreign
--     key is dropped, so a barber can be a staff row whose id is in no auth table.
--     That keeps every existing `id = auth.uid()` check working untouched: barbers
--     simply never match one. Payroll, wages, absences and deductions are unaffected.

-- 1. Customer self-service: detach the policies that depend on it, before dropping.
drop policy if exists "owner, own staff or own customer read visits" on visits;
create policy "admin or own staff read visits" on visits for select to authenticated
  using (is_owner() or is_my_visit(employee_id, created_by));

drop policy if exists "owner, own staff or self read customers" on customers;
create policy "admin or own staff read customers" on customers for select to authenticated
  using (
    is_owner()
    or (is_staff() and exists (
      select 1 from visits v
      where v.customer_id = customers.id and (v.employee_id = auth.uid() or v.created_by = auth.uid())
    ))
  );

-- 2. Customer sofa reservations. `seat_status` keeps its 'reserved' value: staff still
--    hold a seat via set_seat_status(), and end_visit() parks a seat there on expect_next.
drop trigger if exists seats_clear_reserved_by on seats;
drop function if exists clear_reserved_by();
alter table seats drop column if exists reserved_by;
alter table seats drop column if exists reserved_until;
alter table seats drop column if exists reserved_name;

do $$ begin
  perform cron.unschedule('expire-sofa-reservations');
exception when others then null;  -- job or pg_cron absent: nothing to unschedule
end $$;

drop function if exists reserve_sofa_seat(text);
drop function if exists cancel_my_reservation(text);
drop function if exists expire_reservations();

-- 3. Customer accounts.
drop function if exists claim_customer(text, text);
drop function if exists phone_has_account(text);
drop function if exists my_customer_id();
alter table customers drop column if exists user_id;

-- 4. Login-less staff: drop the hard link to auth.users so barbers can exist.
alter table staff drop constraint if exists staff_id_fkey;
alter table staff alter column email set default '';
comment on column staff.id is
  'Equals auth.users.id for admin/operator accounts. For barbers it is a standalone uuid with no auth user.';

-- 5. The role enum. update_staff() takes the type as a parameter, so it goes first.
drop function if exists update_staff(uuid, text, text, staff_role, boolean);

alter type staff_role rename to staff_role_old;
create type staff_role as enum ('admin', 'operator', 'barber');
alter table staff alter column role type staff_role using (
  case role::text
    when 'owner' then 'admin'
    when 'receptionist' then 'operator'
    else 'barber'
  end::staff_role
);
drop type staff_role_old;

-- 6. Rebuild everything that referenced the old values.
create or replace function is_owner() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from staff where id = auth.uid() and active and role = 'admin')
$$;

create or replace function is_admin() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from staff where id = auth.uid() and active and role = 'admin')
$$;

create or replace function is_operator() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from staff where id = auth.uid() and active and role in ('admin', 'operator'))
$$;

create function update_staff(p_id uuid, p_name text, p_phone text, p_role staff_role, p_active boolean) returns void
language plpgsql security definer set search_path = public as $$
declare v_target staff;
begin
  if not is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into v_target from staff where id = p_id;
  if v_target is null then raise exception 'not_found'; end if;
  if length(trim(coalesce(p_name, ''))) < 2 then raise exception 'invalid_input'; end if;
  -- The last admin cannot be demoted or deactivated, and nobody is promoted to admin here.
  if v_target.role = 'admin' and (p_role <> 'admin' or not p_active) then raise exception 'owner_locked'; end if;
  if p_role = 'admin' and v_target.role <> 'admin' then raise exception 'owner_locked'; end if;
  -- A barber has no login, so it can never be given an account role, and vice versa.
  if (v_target.role = 'barber') <> (p_role = 'barber') then raise exception 'invalid_input'; end if;
  update staff set name = trim(p_name), phone = regexp_replace(coalesce(p_phone, ''), '[\s-]', '', 'g'),
                   role = p_role, active = p_active
  where id = p_id;
end $$;

-- staff_login_email ordered by `role = 'owner'`; barbers must never resolve to a login.
create or replace function staff_login_email(p_phone text) returns text
language sql stable security definer set search_path = public as $$
  select email from staff
  where active and role <> 'barber' and email <> ''
    and length(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')) >= 7
    and right(regexp_replace(phone, '\D', '', 'g'), 10)
      = right(regexp_replace(p_phone, '\D', '', 'g'), 10)
    and length(regexp_replace(phone, '\D', '', 'g')) >= 7
  order by role = 'admin' desc, joined_at
  limit 1
$$;

-- 7. Barbers: created and edited by an admin, never through auth.
create function save_barber(p_id uuid, p_name text, p_phone text, p_active boolean) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if length(trim(coalesce(p_name, ''))) < 2 then raise exception 'invalid_input'; end if;
  if p_id is null then
    insert into staff (id, name, role, phone, email, active)
    values (gen_random_uuid(), trim(p_name), 'barber',
            regexp_replace(coalesce(p_phone, ''), '[\s-]', '', 'g'), '', coalesce(p_active, true))
    returning id into v_id;
  else
    if not exists (select 1 from staff where id = p_id and role = 'barber') then raise exception 'not_found'; end if;
    update staff set name = trim(p_name),
                     phone = regexp_replace(coalesce(p_phone, ''), '[\s-]', '', 'g'),
                     active = coalesce(p_active, active)
    where id = p_id returning id into v_id;
  end if;
  return v_id;
end $$;

-- 8. Payroll and attendance filtered on role <> 'owner'; the admin is still excluded.
create or replace function set_staff_pay(p_id uuid, p_daily_wage numeric, p_joined_at date, p_days_off smallint[]) returns void
language plpgsql security definer set search_path = public as $$
declare v_staff staff; v_from date;
begin
  if not is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into v_staff from staff where id = p_id;
  if v_staff is null then raise exception 'not_found'; end if;
  if p_days_off is not null and (
       cardinality(p_days_off) > 6
       or exists (select 1 from unnest(p_days_off) d where d < 0 or d > 6)
     ) then raise exception 'invalid_input'; end if;
  if v_staff.role <> 'admin' and (p_daily_wage is null or p_daily_wage <= 0) then raise exception 'invalid_input'; end if;

  update staff set joined_at = coalesce(p_joined_at, joined_at),
                   days_off = coalesce(p_days_off, days_off)
  where id = p_id;

  if p_daily_wage is not null and p_daily_wage > 0 then
    select case when exists (select 1 from wage_rates where employee_id = p_id)
                then cairo_today()
                else least(coalesce(p_joined_at, v_staff.joined_at), cairo_today()) end
    into v_from;
    insert into wage_rates (employee_id, daily_wage, effective_from)
    values (p_id, p_daily_wage, v_from)
    on conflict (employee_id, effective_from) do update set daily_wage = excluded.daily_wage;
  end if;
end $$;

create or replace function save_absence(p_id uuid, p_employee uuid, p_day date, p_reason text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_day is null or not exists (select 1 from staff where id = p_employee and role <> 'admin') then
    raise exception 'invalid_input';
  end if;
  if is_paid_month(p_employee, p_day) then raise exception 'payroll_locked'; end if;
  if p_id is null then
    insert into absences (employee_id, day, reason) values (p_employee, p_day, coalesce(p_reason, ''))
    returning id into v_id;
  else
    update absences set day = p_day, reason = coalesce(p_reason, ''), updated_at = now()
    where id = p_id and cancelled_at is null returning id into v_id;
    if v_id is null then raise exception 'not_found'; end if;
  end if;
  return v_id;
exception when unique_violation then raise exception 'duplicate_absence';
end $$;

create or replace function add_deduction(p_employee uuid, p_month date, p_amount numeric, p_reason text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_amount is null or p_amount <= 0 or length(trim(coalesce(p_reason, ''))) = 0
     or not exists (select 1 from staff where id = p_employee and role <> 'admin') then
    raise exception 'invalid_input';
  end if;
  if is_paid_month(p_employee, p_month) then raise exception 'payroll_locked'; end if;
  insert into salary_deductions (employee_id, month, amount, reason)
  values (p_employee, date_trunc('month', p_month)::date, p_amount, trim(p_reason))
  returning id into v_id;
  return v_id;
end $$;

-- 9. Grants. Nothing here is callable by anon except the login lookup that already was.
revoke execute on all functions in schema public from public, anon;
grant execute on function is_staff(), is_owner(), is_admin(), is_operator(), norm_phone(text) to authenticated;
grant execute on function staff_login_email(text) to anon, authenticated;
grant execute on function save_barber(uuid, text, text, boolean) to authenticated;
grant execute on function update_staff(uuid, text, text, staff_role, boolean) to authenticated;
grant execute on function set_staff_pay(uuid, numeric, date, smallint[]) to authenticated;
grant execute on function save_absence(uuid, uuid, date, text) to authenticated;
grant execute on function add_deduction(uuid, date, numeric, text) to authenticated;

-- 10. payroll() contained the literal role <> 'owner', now an invalid enum value.
--     Rebuilt verbatim except for that predicate; the admin is still off payroll.
create or replace function payroll(p_month date)
returns table (
  employee_id uuid, name text, daily_wage numeric, eligible_days int, absence_days int, payable_days int,
  gross numeric, deductions numeric, net numeric, status text, paid_at timestamptz
) language plpgsql stable security definer set search_path = public as $$
declare
  v_start date := date_trunc('month', p_month)::date;
  v_end date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
begin
  if not is_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
  with emp as (
    select s.id, s.name, s.joined_at, s.days_off from staff s
    where s.role <> 'admin' and (is_owner() or s.id = auth.uid()) and s.joined_at <= v_end
      and (s.active or exists (select 1 from payroll_payments p where p.employee_id = s.id and p.month = v_start))
  ),
  work_days as (
    select e.id as eid, d::date as day
    from emp e, generate_series(greatest(v_start, e.joined_at), v_end, interval '1 day') d
    where extract(dow from d)::smallint <> all (e.days_off)
      and not exists (select 1 from holidays h where h.day = d::date)
  ),
  priced as (
    select w.eid, w.day,
      exists (select 1 from absences a where a.employee_id = w.eid and a.day = w.day and a.cancelled_at is null) as absent,
      coalesce(
        (select r.daily_wage from wage_rates r where r.employee_id = w.eid and r.effective_from <= w.day order by r.effective_from desc limit 1),
        (select r.daily_wage from wage_rates r where r.employee_id = w.eid order by r.effective_from limit 1),
        0) as wage
    from work_days w
  ),
  calc as (
    select e.id, e.name,
      coalesce(
        (select r.daily_wage from wage_rates r where r.employee_id = e.id and r.effective_from <= v_end order by r.effective_from desc limit 1),
        (select r.daily_wage from wage_rates r where r.employee_id = e.id order by r.effective_from limit 1),
        0) as wage,
      count(p.day)::int as eligible,
      (count(p.day) filter (where p.absent))::int as absent_n,
      coalesce(sum(p.wage) filter (where not p.absent), 0)::numeric as gross
    from emp e left join priced p on p.eid = e.id
    group by e.id, e.name
  ),
  ded as (
    select sd.employee_id as eid, sum(sd.amount)::numeric as total from salary_deductions sd
    where sd.month = v_start and sd.cancelled_at is null group by sd.employee_id
  )
  select c.id, c.name,
    coalesce(pp.daily_wage, c.wage),
    coalesce(pp.eligible_days, c.eligible),
    coalesce(pp.absence_days, c.absent_n),
    coalesce(pp.payable_days, c.eligible - c.absent_n),
    coalesce(pp.gross, round(c.gross, 2)),
    coalesce(pp.deductions, coalesce(d.total, 0)),
    coalesce(pp.net, round(c.gross, 2) - coalesce(d.total, 0)),
    case when pp.id is null then 'pending' else 'paid' end,
    pp.paid_at
  from calc c
  left join payroll_payments pp on pp.employee_id = c.id and pp.month = v_start
  left join ded d on d.eid = c.id
  order by c.name;
end $$;

grant execute on function payroll(date) to authenticated;
