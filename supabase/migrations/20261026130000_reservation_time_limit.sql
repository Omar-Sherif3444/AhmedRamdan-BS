-- Online sofa reservations last 1 hour; a pg_cron job frees expired ones every minute.

alter table seats add column reserved_until timestamptz;

create or replace function clear_reserved_by() returns trigger language plpgsql as $$
begin
  if new.status <> 'reserved' then
    new.reserved_by := null;
    new.reserved_until := null;
  end if;
  return new;
end $$;

create function expire_reservations() returns void language sql security definer set search_path = public as $$
  update seats set status = 'available' where status = 'reserved' and reserved_until < now()
$$;

create or replace function reserve_sofa_seat(p_seat text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_customer uuid := my_customer_id();
begin
  if v_customer is null then raise exception 'forbidden' using errcode = '42501'; end if;
  perform expire_reservations();
  if exists (select 1 from seats where reserved_by = v_customer) then raise exception 'already_reserved'; end if;
  update seats set status = 'reserved', reserved_by = v_customer, reserved_until = now() + interval '1 hour'
    where id = p_seat and kind = 'sofa' and status = 'available';
  if not found then raise exception 'seat_unavailable'; end if;
end $$;

revoke execute on function expire_reservations() from public, anon, authenticated;

create extension if not exists pg_cron;
select cron.schedule('expire-sofa-reservations', '* * * * *', 'select public.expire_reservations()');
