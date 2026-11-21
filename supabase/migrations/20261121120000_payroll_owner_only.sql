-- Payroll is the owner's alone. Paying was already owner-only; reading it is now too
-- (it accepted any signed-in staff, so the shared shop account could call it).
-- Rebuilt verbatim from 20261120210100 except for the guard.
create or replace function payroll(p_month date)
returns table (
  employee_id uuid, name text, daily_wage numeric, eligible_days int, absence_days int, payable_days int,
  gross numeric, deductions numeric, net numeric, status text, paid_at timestamptz
) language plpgsql stable security definer set search_path = public as $$
declare
  v_start date := date_trunc('month', p_month)::date;
  v_end date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
begin
  if not is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
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
