-- 1) Audit trail for owner-sensitive records.
-- 2) Employee data privacy: an employee reads only the visits they served or registered, and those customers.
-- 3) Payment methods: new payments are Cash or Wallet; historical 'card' rows are kept as they are.
-- 4) Server-side revenue totals by payment method.

-- Audit ------------------------------------------------------------------------------------

create table audit_log (
  id bigint generated always as identity primary key,
  table_name text not null,
  record_id text not null,
  action text not null,
  old_row jsonb,
  new_row jsonb,
  actor uuid default auth.uid(),
  at timestamptz not null default now()
);
create index audit_log_record_idx on audit_log (table_name, record_id);
alter table audit_log enable row level security;
create policy "owner reads audit" on audit_log for select to authenticated using (is_owner());

create function audit_row() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    insert into audit_log (table_name, record_id, action, old_row) values (tg_table_name, old.id::text, 'delete', to_jsonb(old));
    return old;
  elsif tg_op = 'UPDATE' then
    insert into audit_log (table_name, record_id, action, old_row, new_row) values (tg_table_name, new.id::text, 'update', to_jsonb(old), to_jsonb(new));
  else
    insert into audit_log (table_name, record_id, action, new_row) values (tg_table_name, new.id::text, 'insert', to_jsonb(new));
  end if;
  return new;
end $$;

-- Owner corrections of money on past transactions are audited (status changes on the floor are not).
create trigger visits_audit after update of employee_id, service_id, amount, method or delete on visits
  for each row execute function audit_row();

-- Privacy ----------------------------------------------------------------------------------

-- Who entered the visit (a receptionist may register on behalf of a barber). Older rows stay null.
alter table visits add column created_by uuid references staff on delete set null;
create index visits_employee_idx on visits (employee_id);
create index visits_created_by_idx on visits (created_by);

-- True when the signed-in staff member served or registered the visit.
create function is_my_visit(p_employee uuid, p_created_by uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_staff() and (p_employee = auth.uid() or p_created_by = auth.uid())
$$;

drop policy "staff or own read visits" on visits;
create policy "owner, own staff or own customer read visits" on visits for select to authenticated
  using (is_owner() or is_my_visit(employee_id, created_by) or customer_id = my_customer_id());

drop policy "staff or self read customers" on customers;
create policy "owner, own staff or self read customers" on customers for select to authenticated
  using (
    is_owner() or user_id = auth.uid()
    or (is_staff() and exists (
      select 1 from visits v where v.customer_id = customers.id and (v.employee_id = auth.uid() or v.created_by = auth.uid())
    ))
  );

-- May the caller change this visit? The owner, or the employee who served or registered it.
create function can_edit_visit(p_visit uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_owner() or exists (select 1 from visits where id = p_visit and is_my_visit(employee_id, created_by))
$$;

-- Payment methods --------------------------------------------------------------------------

-- 'card' stays in the enum only so historical rows keep their value.
create function check_new_method(p_method pay_method) returns void language plpgsql immutable as $$
begin
  if p_method is null or p_method not in ('cash', 'wallet') then raise exception 'invalid_method'; end if;
end $$;

create or replace function register_visit(
  p_seat text, p_name text, p_phone text, p_employee uuid, p_service uuid,
  p_amount numeric, p_method pay_method, p_expect_next boolean
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_seat seats;
  v_phone text := norm_phone(p_phone);
  v_customer uuid;
  v_visit uuid;
begin
  if not is_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  if length(trim(coalesce(p_name, ''))) < 2 or coalesce(p_amount, 0) <= 0 then raise exception 'invalid_input'; end if;
  perform check_new_method(p_method);
  if not exists (select 1 from staff where id = p_employee and active) then raise exception 'invalid_employee'; end if;
  select * into v_seat from seats where id = p_seat for update;
  if v_seat.id is null or v_seat.status not in ('available', 'reserved') then raise exception 'seat_unavailable'; end if;

  if v_phone <> '' then select id into v_customer from customers where phone = v_phone; end if;
  if v_customer is null then
    select id into v_customer from customers
    where lower(trim(name)) = lower(trim(p_name)) and (v_phone = '' or phone = '') limit 1;
  end if;
  if v_customer is null then
    insert into customers (name, phone) values (trim(p_name), v_phone) returning id into v_customer;
  elsif v_phone <> '' then
    update customers set phone = v_phone where id = v_customer and phone = '';
  end if;

  insert into visits (customer_id, employee_id, seat_id, service_id, amount, method, expect_next, created_by)
  values (v_customer, p_employee, p_seat, p_service, p_amount, p_method, coalesce(p_expect_next, false), auth.uid())
  returning id into v_visit;
  update seats set status = 'occupied', visit_id = v_visit, since = now() where id = p_seat;
  return v_visit;
end $$;

-- Completing a service is a shared floor action; releasing (which cancels the payment) is the owner's or the visit's own employee's.
create or replace function end_visit(p_seat text, p_complete boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_seat seats;
  v_next boolean;
begin
  if not is_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into v_seat from seats where id = p_seat for update;
  if v_seat.status is distinct from 'occupied' then raise exception 'seat_not_occupied'; end if;
  if not p_complete and not can_edit_visit(v_seat.visit_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  select expect_next into v_next from visits where id = v_seat.visit_id;
  update visits set status = case when p_complete then 'completed'::visit_status else 'cancelled'::visit_status end, ended_at = now()
  where id = v_seat.visit_id;
  update seats set status = case when p_complete and v_next then 'reserved'::seat_status else 'available'::seat_status end,
    visit_id = null, since = null
  where id = p_seat;
end $$;

create or replace function set_expect_next(p_seat text, p_value boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_visit uuid := (select visit_id from seats where id = p_seat and status = 'occupied');
begin
  if not can_edit_visit(v_visit) then raise exception 'forbidden' using errcode = '42501'; end if;
  update visits set expect_next = p_value where id = v_visit;
end $$;

create or replace function update_payment(p_visit uuid, p_amount numeric, p_method pay_method) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not can_edit_visit(p_visit) then raise exception 'forbidden' using errcode = '42501'; end if;
  if coalesce(p_amount, 0) <= 0 then raise exception 'invalid_input'; end if;
  -- A historical 'card' payment may keep its method; any change must be to Cash or Wallet.
  if p_method is distinct from (select method from visits where id = p_visit) then perform check_new_method(p_method); end if;
  update visits set amount = p_amount, method = p_method where id = p_visit;
end $$;

create or replace function update_visit(p_visit uuid, p_employee uuid, p_service uuid, p_amount numeric, p_method pay_method) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_owner() then raise exception 'forbidden' using errcode = '42501'; end if;
  if coalesce(p_amount, 0) <= 0 then raise exception 'invalid_input'; end if;
  if p_method is distinct from (select method from visits where id = p_visit) then perform check_new_method(p_method); end if;
  update visits set employee_id = p_employee, service_id = p_service, amount = p_amount, method = p_method where id = p_visit;
end $$;

-- Revenue by payment method, summed from the stored transactions. The owner gets the whole shop;
-- any other caller gets only the visits they served.
create function revenue_totals(p_from date, p_to date)
returns table (cash numeric, wallet numeric, other numeric, total numeric, visits bigint)
language sql stable security definer set search_path = public as $$
  select
    coalesce(sum(amount) filter (where method = 'cash'), 0),
    coalesce(sum(amount) filter (where method = 'wallet'), 0),
    coalesce(sum(amount) filter (where method not in ('cash', 'wallet')), 0),
    coalesce(sum(amount), 0),
    count(*)
  from visits
  where status <> 'cancelled'
    and (started_at at time zone 'Africa/Cairo')::date between p_from and p_to
    and (is_owner() or (is_staff() and employee_id = auth.uid()))
$$;

revoke execute on function audit_row(), is_my_visit(uuid, uuid), can_edit_visit(uuid), check_new_method(pay_method),
  revenue_totals(date, date) from public, anon;
revoke execute on function audit_row() from authenticated;
grant execute on function revenue_totals(date, date), is_my_visit(uuid, uuid), can_edit_visit(uuid) to authenticated;
