-- Day-by-day money for the front desk: income from visits minus expenses, per Cairo calendar day.
--
-- The shop account cannot read visit history or other people's expenses (by design), so this returns
-- only per-day sums — no visits, no customers, no names. Callable by the owner and the shop account.

create function daily_totals(p_days int default 30)
returns table (day date, income numeric, cash numeric, wallet numeric, expenses numeric, net numeric, visits int)
language plpgsql stable security definer set search_path = public as $$
declare
  v_days int := least(greatest(coalesce(p_days, 30), 1), 90);
  v_from timestamptz := ((cairo_today() - (v_days - 1))::timestamp at time zone 'Africa/Cairo');
begin
  if not is_operator() then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
  with days as (
    select (cairo_today() - g)::date as d from generate_series(0, v_days - 1) g
  ),
  v as (
    -- Payment is taken at registration, so every visit that was not cancelled is money in.
    select (x.started_at at time zone 'Africa/Cairo')::date as d,
           sum(x.amount) as total,
           sum(x.amount) filter (where x.method = 'cash') as cash,
           sum(x.amount) filter (where x.method = 'wallet') as wallet,
           count(*) as n
    from visits x
    where x.status <> 'cancelled' and x.started_at >= v_from
    group by 1
  ),
  e as (
    -- Shop and personal expenses both leave the till.
    select (x.spent_at at time zone 'Africa/Cairo')::date as d, sum(x.amount) as total
    from expenses x
    where x.deleted_at is null and x.spent_at >= v_from
    group by 1
  )
  select days.d,
         coalesce(v.total, 0)::numeric,
         coalesce(v.cash, 0)::numeric,
         coalesce(v.wallet, 0)::numeric,
         coalesce(e.total, 0)::numeric,
         (coalesce(v.total, 0) - coalesce(e.total, 0))::numeric,
         coalesce(v.n, 0)::int
  from days
  left join v on v.d = days.d
  left join e on e.d = days.d
  order by days.d desc;
end $$;

revoke execute on function daily_totals(int) from public, anon;
grant execute on function daily_totals(int) to authenticated;
