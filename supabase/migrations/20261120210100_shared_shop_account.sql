-- One shared shop account for the front desk; nobody else but the owner signs in.
--
-- Account model after this migration:
--   admin     the owner: unchanged, full control.
--   operator  the one shared front-desk login. Sees what daily work needs and nothing more.
--   barber    profile only, no login; offered as "who served this customer".
--   employee  profile only, no login; on payroll, not offered as a barber.
-- Nothing is deleted: every staff row, customer and visit stays.

-- 1. Only the two account roles count as signed-in staff, even if a stale login still exists.
create or replace function is_staff() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from staff where id = auth.uid() and active and role in ('admin', 'operator'))
$$;

-- A profile has no sign-in email, so nothing can resolve to it.
update staff set email = '' where role in ('barber', 'employee');

create or replace function staff_login_email(p_phone text) returns text
language sql stable security definer set search_path = public as $$
  select email from staff
  where active and role in ('admin', 'operator') and email <> ''
    and length(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')) >= 7
    and right(regexp_replace(phone, '\D', '', 'g'), 10)
      = right(regexp_replace(p_phone, '\D', '', 'g'), 10)
    and length(regexp_replace(phone, '\D', '', 'g')) >= 7
  order by role = 'admin' desc, joined_at
  limit 1
$$;

-- 2. Visibility. Per-person visibility made sense with one login per employee; with one shared
--    account the front desk sees the shop's customers and today's work. History and money stay
--    with the owner: older visits are not readable by the front desk.
-- cairo_today() (attendance migration) is the shop's calendar day; today's work starts at its midnight.
drop policy if exists "admin or own staff read visits" on visits;
create policy "admin, or front desk for today" on visits for select to authenticated
  using (is_owner() or (is_operator() and (status = 'in_progress' or started_at >= (cairo_today()::timestamp at time zone 'Africa/Cairo'))));

drop policy if exists "admin or own staff read customers" on customers;
create policy "admin or front desk read customers" on customers for select to authenticated
  using (is_owner() or is_operator());

create or replace function can_edit_visit(p_visit uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_owner() or (is_operator() and exists (
    select 1 from visits where id = p_visit and (status = 'in_progress' or started_at >= (cairo_today()::timestamp at time zone 'Africa/Cairo'))
  ))
$$;

-- 3. Profiles: barbers and employees, created and edited by the owner, never through auth.
drop function if exists save_barber(uuid, text, text, boolean);
create function save_barber(p_id uuid, p_name text, p_phone text, p_active boolean, p_role staff_role default 'barber') returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if length(trim(coalesce(p_name, ''))) < 2 then raise exception 'invalid_input'; end if;
  if p_role not in ('barber', 'employee') then raise exception 'invalid_input'; end if;
  if p_id is null then
    insert into staff (id, name, role, phone, email, active)
    values (gen_random_uuid(), trim(p_name), p_role,
            regexp_replace(coalesce(p_phone, ''), '[\s-]', '', 'g'), '', coalesce(p_active, true))
    returning id into v_id;
  else
    if not exists (select 1 from staff where id = p_id and role in ('barber', 'employee')) then raise exception 'not_found'; end if;
    update staff set name = trim(p_name),
                     phone = regexp_replace(coalesce(p_phone, ''), '[\s-]', '', 'g'),
                     role = p_role,
                     active = coalesce(p_active, active)
    where id = p_id returning id into v_id;
  end if;
  return v_id;
end $$;

-- update_staff is for the two account roles only; profiles go through save_barber.
create or replace function update_staff(p_id uuid, p_name text, p_phone text, p_role staff_role, p_active boolean) returns void
language plpgsql security definer set search_path = public as $$
declare v_target staff;
begin
  if not is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into v_target from staff where id = p_id;
  if v_target is null then raise exception 'not_found'; end if;
  if length(trim(coalesce(p_name, ''))) < 2 then raise exception 'invalid_input'; end if;
  -- The admin cannot be demoted or deactivated, and nobody is promoted to admin here.
  if v_target.role = 'admin' and (p_role <> 'admin' or not p_active) then raise exception 'owner_locked'; end if;
  if p_role = 'admin' and v_target.role <> 'admin' then raise exception 'owner_locked'; end if;
  if v_target.role not in ('admin', 'operator') or p_role not in ('admin', 'operator') then raise exception 'invalid_input'; end if;
  update staff set name = trim(p_name), phone = regexp_replace(coalesce(p_phone, ''), '[\s-]', '', 'g'),
                   role = p_role, active = p_active
  where id = p_id;
end $$;

revoke execute on function save_barber(uuid, text, text, boolean, staff_role) from public, anon;
grant execute on function cairo_today(), save_barber(uuid, text, text, boolean, staff_role) to authenticated;

-- 4. The shared shop account is not a person and is not on payroll.
--    payroll() rebuilt verbatim except for the emp predicate.
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
    where s.role not in ('admin', 'operator') and (is_owner() or s.id = auth.uid()) and s.joined_at <= v_end
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
