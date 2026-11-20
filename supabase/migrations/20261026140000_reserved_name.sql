-- Show who reserved each sofa seat on the public floor. Only the first name is public; customers stay private.

alter table seats add column reserved_name text;

create or replace function clear_reserved_by() returns trigger language plpgsql as $$
begin
  if new.status <> 'reserved' then
    new.reserved_by := null;
    new.reserved_until := null;
    new.reserved_name := null;
  end if;
  return new;
end $$;

create or replace function reserve_sofa_seat(p_seat text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_customer uuid := my_customer_id();
begin
  if v_customer is null then raise exception 'forbidden' using errcode = '42501'; end if;
  perform expire_reservations();
  if exists (select 1 from seats where reserved_by = v_customer) then raise exception 'already_reserved'; end if;
  update seats set status = 'reserved', reserved_by = v_customer, reserved_until = now() + interval '1 hour',
      reserved_name = (select split_part(trim(name), ' ', 1) from customers where id = v_customer)
    where id = p_seat and kind = 'sofa' and status = 'available';
  if not found then raise exception 'seat_unavailable'; end if;
end $$;

update seats s set reserved_name = split_part(trim(c.name), ' ', 1) from customers c where c.id = s.reserved_by;
