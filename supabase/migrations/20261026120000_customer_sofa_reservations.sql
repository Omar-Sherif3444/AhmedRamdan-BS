-- Signed-in customers can reserve one free sofa seat online and cancel their own reservation.

alter table seats add column reserved_by uuid references customers on delete set null;

-- Whoever reserved a seat stops owning it as soon as it leaves 'reserved' (staff check-in, cancel, out of service).
create function clear_reserved_by() returns trigger language plpgsql as $$
begin
  if new.status <> 'reserved' then new.reserved_by := null; end if;
  return new;
end $$;
create trigger seats_clear_reserved_by before update on seats for each row execute function clear_reserved_by();

create function my_customer_id() returns uuid language sql stable security definer set search_path = public as $$
  select id from customers where user_id = auth.uid()
$$;

create function reserve_sofa_seat(p_seat text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_customer uuid := my_customer_id();
begin
  if v_customer is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if exists (select 1 from seats where reserved_by = v_customer) then raise exception 'already_reserved'; end if;
  update seats set status = 'reserved', reserved_by = v_customer where id = p_seat and kind = 'sofa' and status = 'available';
  if not found then raise exception 'seat_unavailable'; end if;
end $$;

create function cancel_my_reservation(p_seat text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_customer uuid := my_customer_id();
begin
  if v_customer is null then raise exception 'forbidden' using errcode = '42501'; end if;
  update seats set status = 'available' where id = p_seat and status = 'reserved' and reserved_by = v_customer;
  if not found then raise exception 'invalid_transition'; end if;
end $$;

revoke execute on function clear_reserved_by(), my_customer_id(), reserve_sofa_seat(text), cancel_my_reservation(text) from public, anon;
grant execute on function reserve_sofa_seat(text), cancel_my_reservation(text) to authenticated;
