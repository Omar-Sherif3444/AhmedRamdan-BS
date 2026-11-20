-- The waiting count the operator bumps with + / −, and the one thing the public page reads.
--
-- Append-only on purpose. A single shared integer updated by read-modify-write loses
-- increments when two devices tap at once; a log of deltas cannot. It also gives Undo
-- for free and lets the admin see the drift later.

create table waiting_events (
  id bigint generated always as identity primary key,
  delta smallint not null check (delta in (-1, 1)),
  actor uuid references staff (id) on delete set null,
  at timestamptz not null default now(),
  -- Set when this event has been undone; undone events are excluded from the count.
  undone_at timestamptz
);

create index waiting_events_at_idx on waiting_events (at desc);

alter table waiting_events enable row level security;

create policy "staff read waiting events" on waiting_events for select to authenticated using (is_staff());

alter publication supabase_realtime add table waiting_events;

-- Shop settings the estimate depends on. Kept on the singleton settings row.
alter table settings add column if not exists minutes_per_customer smallint not null default 20
  check (minutes_per_customer between 1 and 180);

-- The count resets itself every day: only today's events count, in Cairo time.
create function waiting_count() returns int language sql stable security definer set search_path = public as $$
  select greatest(0, coalesce(sum(delta), 0))::int
  from waiting_events
  where undone_at is null
    and at >= date_trunc('day', now() at time zone 'Africa/Cairo') at time zone 'Africa/Cairo'
$$;

-- + when someone walks in, − when the operator seats someone. Never goes below zero.
create function bump_waiting(p_delta smallint) returns int
language plpgsql security definer set search_path = public as $$
begin
  if not is_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_delta not in (-1, 1) then raise exception 'invalid_input'; end if;
  -- Refuse to log a decrement that would take a count of zero negative, so the log
  -- stays a truthful history rather than something the reader has to clamp.
  if p_delta = -1 and waiting_count() = 0 then return 0; end if;
  insert into waiting_events (delta, actor) values (p_delta, auth.uid());
  return waiting_count();
end $$;

-- Undo for the operator's last bump. Marks rather than deletes, so the history survives.
create function undo_waiting() returns int
language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  if not is_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  select id into v_id from waiting_events
  where undone_at is null
    and at >= date_trunc('day', now() at time zone 'Africa/Cairo') at time zone 'Africa/Cairo'
  order by at desc, id desc limit 1;
  if v_id is null then return waiting_count(); end if;
  update waiting_events set undone_at = now() where id = v_id;
  return waiting_count();
end $$;

-- The entire public surface. One row, no auth, no personal data of any kind:
-- no names, no phone numbers, no seat identities, no money.
create function public_wait_status()
returns table (waiting int, in_progress int, barbers_active int, minutes_per_customer int, at timestamptz)
language sql stable security definer set search_path = public as $$
  select
    waiting_count(),
    (select count(*)::int from visits where status = 'in_progress'),
    (select greatest(1, count(*))::int from staff where role = 'barber' and active),
    (select s.minutes_per_customer::int from settings s where s.id = 1),
    now()
$$;

revoke execute on function waiting_count(), bump_waiting(smallint), undo_waiting(), public_wait_status() from public;
grant execute on function waiting_count(), bump_waiting(smallint), undo_waiting() to authenticated;
-- The only function the anonymous public page may call.
grant execute on function public_wait_status() to anon, authenticated;
