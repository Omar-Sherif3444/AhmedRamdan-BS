-- Owner-only correction of past transactions: change who/what/how much, or remove the record.

create function update_visit(p_visit uuid, p_employee uuid, p_service uuid, p_amount numeric, p_method pay_method) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_owner() then raise exception 'forbidden' using errcode = '42501'; end if;
  if coalesce(p_amount, 0) <= 0 then raise exception 'invalid_input'; end if;
  update visits set employee_id = p_employee, service_id = p_service, amount = p_amount, method = p_method where id = p_visit;
end $$;

create function delete_visit(p_visit uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_owner() then raise exception 'forbidden' using errcode = '42501'; end if;
  -- An in-progress visit holds its seat; free the seat with it.
  update seats set status = 'available', visit_id = null, since = null where visit_id = p_visit;
  delete from visits where id = p_visit;
end $$;

revoke execute on function update_visit(uuid, uuid, uuid, numeric, pay_method), delete_visit(uuid) from public, anon;
grant execute on function update_visit(uuid, uuid, uuid, numeric, pay_method), delete_visit(uuid) to authenticated;
