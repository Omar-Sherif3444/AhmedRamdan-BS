-- Attendance, daily wages and monthly payroll.
--   Eligible days = scheduled working days in the month on or after the employment start date
--                   (weekly days off and official holidays excluded).
--   Payable days  = eligible days - recorded absences (each absent day counted once).
--   Gross         = sum of the daily wage in effect on each payable day (= payable days x wage when it did not change).
--   Net           = gross - owner-approved deductions. Expenses are never deducted.
-- A paid month is frozen as a snapshot, so later wage, absence or holiday changes never rewrite history.

-- Weekly days off per employee, as day numbers 0 (Sunday) .. 6 (Saturday). staff.joined_at is the employment start date.
alter table staff add column days_off smallint[] not null default '{}';

-- Daily wage history: a change applies from its effective date onward and never alters earlier days.
create table wage_rates (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references staff,
  daily_wage numeric(10, 2) not null check (daily_wage >= 0),
  effective_from date not null,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  unique (employee_id, effective_from)
);

create table holidays (
  id uuid primary key default gen_random_uuid(),
  day date not null unique,
  name text not null default ''
);

create table absences (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references staff,
  day date not null,
  reason text not null default '',
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz,
  -- Cancelled absences stay as history and stop counting.
  cancelled_at timestamptz
);
create unique index absences_one_per_day on absences (employee_id, day) where cancelled_at is null;
create index absences_day_idx on absences (day);

create table salary_deductions (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references staff,
  month date not null check (extract(day from month) = 1),
  amount numeric(10, 2) not null check (amount > 0),
  reason text not null check (length(trim(reason)) > 0),
  approved_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  cancelled_at timestamptz
);
create index salary_deductions_month_idx on salary_deductions (month);

-- One payment per employee and month; the figures are the snapshot that was paid.
create table payroll_payments (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references staff,
  month date not null check (extract(day from month) = 1),
  daily_wage numeric(10, 2) not null,
  eligible_days int not null,
  absence_days int not null,
  payable_days int not null,
  gross numeric(12, 2) not null,
  deductions numeric(12, 2) not null,
  net numeric(12, 2) not null,
  paid_at timestamptz not null default now(),
  paid_by uuid default auth.uid(),
  unique (employee_id, month)
);

-- Owner sees everything; an employee sees only their own rows. All writes go through the functions below.
alter table wage_rates enable row level security;
alter table holidays enable row level security;
alter table absences enable row level security;
alter table salary_deductions enable row level security;
alter table payroll_payments enable row level security;
create policy "owner or own read wage_rates" on wage_rates for select to authenticated using (is_owner() or (is_staff() and employee_id = auth.uid()));
create policy "staff read holidays" on holidays for select to authenticated using (is_staff());
create policy "owner or own read absences" on absences for select to authenticated using (is_owner() or (is_staff() and employee_id = auth.uid()));
create policy "owner or own read deductions" on salary_deductions for select to authenticated using (is_owner() or (is_staff() and employee_id = auth.uid()));
create policy "owner or own read payroll" on payroll_payments for select to authenticated using (is_owner() or (is_staff() and employee_id = auth.uid()));

create trigger wage_rates_audit after insert or update or delete on wage_rates for each row execute function audit_row();
create trigger holidays_audit after insert or update or delete on holidays for each row execute function audit_row();
create trigger absences_audit after insert or update on absences for each row execute function audit_row();
create trigger salary_deductions_audit after insert or update on salary_deductions for each row execute function audit_row();
create trigger payroll_payments_audit after insert on payroll_payments for each row execute function audit_row();

create function cairo_today() returns date language sql stable as $$
  select (now() at time zone 'Africa/Cairo')::date
$$;

create function is_paid_month(p_employee uuid, p_day date) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from payroll_payments where employee_id = p_employee and month = date_trunc('month', p_day)::date)
$$;

-- Wages, start date and days off -----------------------------------------------------------

-- A new wage applies from today; an employee's first wage applies from their start date.
create function set_staff_pay(p_id uuid, p_daily_wage numeric, p_joined_at date, p_days_off smallint[]) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_staff staff;
  v_from date;
  v_current numeric;
begin
  if not is_owner() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into v_staff from staff where id = p_id;
  if v_staff.id is null then raise exception 'not_found'; end if;
  if p_joined_at is null or p_days_off is null or cardinality(p_days_off) > 6
    or exists (select 1 from unnest(p_days_off) d where d not between 0 and 6) then
    raise exception 'invalid_input';
  end if;
  if v_staff.role <> 'owner' and (p_daily_wage is null or p_daily_wage <= 0) then raise exception 'invalid_input'; end if;

  update staff set joined_at = p_joined_at, days_off = (select coalesce(array_agg(distinct d order by d), '{}') from unnest(p_days_off) d)
  where id = p_id;

  if p_daily_wage is null then return; end if;
  select daily_wage into v_current from wage_rates where employee_id = p_id order by effective_from desc limit 1;
  if v_current = p_daily_wage then return; end if;
  v_from := case when v_current is null then least(p_joined_at, cairo_today()) else cairo_today() end;
  insert into wage_rates (employee_id, daily_wage, effective_from) values (p_id, round(p_daily_wage, 2), v_from)
  on conflict (employee_id, effective_from) do update set daily_wage = excluded.daily_wage, created_at = now(), created_by = auth.uid();
end $$;

-- Official holidays ------------------------------------------------------------------------

create function save_holiday(p_day date, p_name text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_owner() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_day is null then raise exception 'invalid_input'; end if;
  insert into holidays (day, name) values (p_day, trim(coalesce(p_name, '')))
  on conflict (day) do update set name = excluded.name;
end $$;

create function delete_holiday(p_day date) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_owner() then raise exception 'forbidden' using errcode = '42501'; end if;
  delete from holidays where day = p_day;
end $$;

-- Absences (owner only) --------------------------------------------------------------------

create function save_absence(p_id uuid, p_employee uuid, p_day date, p_reason text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_old absences;
  v_id uuid;
begin
  if not is_owner() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_day is null or not exists (select 1 from staff where id = p_employee and role <> 'owner') then raise exception 'invalid_input'; end if;
  if is_paid_month(p_employee, p_day) then raise exception 'payroll_locked'; end if;
  if exists (select 1 from absences where employee_id = p_employee and day = p_day and cancelled_at is null and id is distinct from p_id) then
    raise exception 'duplicate_absence';
  end if;
  if p_id is not null then
    select * into v_old from absences where id = p_id and cancelled_at is null;
    if v_old.id is null then raise exception 'not_found'; end if;
    if is_paid_month(v_old.employee_id, v_old.day) then raise exception 'payroll_locked'; end if;
    update absences set employee_id = p_employee, day = p_day, reason = trim(coalesce(p_reason, '')), updated_at = now() where id = p_id;
    return p_id;
  end if;
  insert into absences (employee_id, day, reason) values (p_employee, p_day, trim(coalesce(p_reason, ''))) returning id into v_id;
  return v_id;
exception when unique_violation then
  raise exception 'duplicate_absence';
end $$;

create function cancel_absence(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_old absences;
begin
  if not is_owner() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into v_old from absences where id = p_id and cancelled_at is null;
  if v_old.id is null then raise exception 'not_found'; end if;
  if is_paid_month(v_old.employee_id, v_old.day) then raise exception 'payroll_locked'; end if;
  update absences set cancelled_at = now(), updated_at = now() where id = p_id;
end $$;

-- Deductions (owner approval with a reason) ------------------------------------------------

create function add_deduction(p_employee uuid, p_month date, p_amount numeric, p_reason text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_month date := date_trunc('month', p_month)::date;
  v_id uuid;
begin
  if not is_owner() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_month is null or coalesce(p_amount, 0) <= 0 or length(trim(coalesce(p_reason, ''))) = 0
    or not exists (select 1 from staff where id = p_employee and role <> 'owner') then
    raise exception 'invalid_input';
  end if;
  if is_paid_month(p_employee, v_month) then raise exception 'payroll_locked'; end if;
  insert into salary_deductions (employee_id, month, amount, reason) values (p_employee, v_month, round(p_amount, 2), trim(p_reason))
  returning id into v_id;
  return v_id;
end $$;

create function cancel_deduction(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_old salary_deductions;
begin
  if not is_owner() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into v_old from salary_deductions where id = p_id and cancelled_at is null;
  if v_old.id is null then raise exception 'not_found'; end if;
  if is_paid_month(v_old.employee_id, v_old.month) then raise exception 'payroll_locked'; end if;
  update salary_deductions set cancelled_at = now() where id = p_id;
end $$;

-- Payroll ----------------------------------------------------------------------------------

-- The owner gets every employee (the owner is not on payroll); anyone else gets only their own row.
-- Paid months return the stored snapshot; pending months are calculated live.
create function payroll(p_month date)
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
    where s.role <> 'owner' and (is_owner() or s.id = auth.uid()) and s.joined_at <= v_end
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

-- Marks a month as paid for one employee, storing the calculated figures. Paying twice is refused.
create function pay_salary(p_employee uuid, p_month date) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_month date := date_trunc('month', p_month)::date;
  r record;
begin
  if not is_owner() then raise exception 'forbidden' using errcode = '42501'; end if;
  perform 1 from staff where id = p_employee for update;
  if is_paid_month(p_employee, v_month) then raise exception 'already_paid'; end if;
  select * into r from payroll(v_month) p where p.employee_id = p_employee;
  if r.employee_id is null then raise exception 'not_found'; end if;
  insert into payroll_payments (employee_id, month, daily_wage, eligible_days, absence_days, payable_days, gross, deductions, net)
  values (p_employee, v_month, r.daily_wage, r.eligible_days, r.absence_days, r.payable_days, r.gross, r.deductions, r.net);
exception when unique_violation then
  raise exception 'already_paid';
end $$;

revoke execute on function cairo_today(), is_paid_month(uuid, date), set_staff_pay(uuid, numeric, date, smallint[]),
  save_holiday(date, text), delete_holiday(date), save_absence(uuid, uuid, date, text), cancel_absence(uuid),
  add_deduction(uuid, date, numeric, text), cancel_deduction(uuid), payroll(date), pay_salary(uuid, date) from public, anon;
grant execute on function set_staff_pay(uuid, numeric, date, smallint[]), save_holiday(date, text), delete_holiday(date),
  save_absence(uuid, uuid, date, text), cancel_absence(uuid), add_deduction(uuid, date, numeric, text), cancel_deduction(uuid),
  payroll(date), pay_salary(uuid, date) to authenticated;

alter publication supabase_realtime add table wage_rates, holidays, absences, salary_deductions, payroll_payments;
