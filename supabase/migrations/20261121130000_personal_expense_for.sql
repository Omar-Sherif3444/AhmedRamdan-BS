-- Personal expenses belong to a person, not to whoever typed them.
--
-- The shared shop account records expenses for everyone: a shop expense stays under the account that
-- recorded it, a personal expense is filed under the worker (or the owner) it was for. `created_by`
-- keeps who actually recorded each row, which `employee_id` alone no longer tells.

alter table expenses add column if not exists created_by uuid references staff (id) on delete set null;
update expenses set created_by = employee_id where created_by is null;
alter table expenses alter column created_by set default auth.uid();

drop function if exists add_expense(numeric, expense_kind, text, timestamptz);

create function add_expense(
  p_amount numeric, p_kind expense_kind, p_description text,
  p_spent_at timestamptz default null, p_employee uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_owner boolean := is_owner();
  v_for uuid := auth.uid();
  v_id uuid;
begin
  if not is_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  if coalesce(p_amount, 0) <= 0 or p_kind is null then raise exception 'invalid_input'; end if;
  if not v_owner and length(trim(coalesce(p_description, ''))) = 0 then raise exception 'invalid_input'; end if;
  if v_owner and p_spent_at > now() + interval '1 day' then raise exception 'invalid_input'; end if;

  if p_kind = 'personal' then
    -- The shop account is not a person: it must say whose expense this is.
    if p_employee is null and not v_owner then raise exception 'invalid_input'; end if;
    if p_employee is not null then
      -- A real person: the owner, a barber or an employee. Never the shared shop account.
      if not exists (select 1 from staff where id = p_employee and active and role in ('admin', 'barber', 'employee')) then
        raise exception 'invalid_input';
      end if;
      v_for := p_employee;
    end if;
  end if;

  insert into expenses (employee_id, kind, amount, description, spent_at, created_by)
  values (v_for, p_kind, round(p_amount, 2), trim(coalesce(p_description, '')),
          case when v_owner and p_spent_at is not null then p_spent_at else now() end, auth.uid())
  returning id into v_id;
  return v_id;
end $$;

revoke execute on function add_expense(numeric, expense_kind, text, timestamptz, uuid) from public, anon;
grant execute on function add_expense(numeric, expense_kind, text, timestamptz, uuid) to authenticated;
