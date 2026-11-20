-- Expenses: every staff member records their own; the owner sees, corrects and removes all of them.
-- Shop expenses are operating costs; personal expenses are tracked apart and never touch payroll.

create type expense_kind as enum ('shop', 'personal');

create table expenses (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references staff,
  kind expense_kind not null,
  amount numeric(10, 2) not null check (amount > 0),
  description text not null default '',
  spent_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  -- Removed expenses are hidden, not erased, so the history and the audit trail stay complete.
  deleted_at timestamptz
);
create index expenses_spent_at_idx on expenses (spent_at desc);
create index expenses_employee_idx on expenses (employee_id);

alter table expenses enable row level security;
create policy "owner or own read expenses" on expenses for select to authenticated
  using (deleted_at is null and (is_owner() or (is_staff() and employee_id = auth.uid())));

create trigger expenses_audit after insert or update on expenses for each row execute function audit_row();

-- Employees: amount, type and a description are required; the date and the employee are set by the server.
-- The owner may leave the description empty and record an earlier date.
create function add_expense(p_amount numeric, p_kind expense_kind, p_description text, p_spent_at timestamptz default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_owner boolean := is_owner();
  v_id uuid;
begin
  if not is_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  if coalesce(p_amount, 0) <= 0 or p_kind is null then raise exception 'invalid_input'; end if;
  if not v_owner and length(trim(coalesce(p_description, ''))) = 0 then raise exception 'invalid_input'; end if;
  if v_owner and p_spent_at > now() + interval '1 day' then raise exception 'invalid_input'; end if;
  insert into expenses (employee_id, kind, amount, description, spent_at)
  values (auth.uid(), p_kind, round(p_amount, 2), trim(coalesce(p_description, '')),
          case when v_owner and p_spent_at is not null then p_spent_at else now() end)
  returning id into v_id;
  return v_id;
end $$;

create function update_expense(p_id uuid, p_amount numeric, p_kind expense_kind, p_description text, p_spent_at timestamptz)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_owner() then raise exception 'forbidden' using errcode = '42501'; end if;
  if coalesce(p_amount, 0) <= 0 or p_kind is null or p_spent_at is null or p_spent_at > now() + interval '1 day' then
    raise exception 'invalid_input';
  end if;
  update expenses set amount = round(p_amount, 2), kind = p_kind, description = trim(coalesce(p_description, '')),
    spent_at = p_spent_at, updated_at = now()
  where id = p_id and deleted_at is null;
  if not found then raise exception 'not_found'; end if;
end $$;

create function delete_expense(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_owner() then raise exception 'forbidden' using errcode = '42501'; end if;
  update expenses set deleted_at = now(), updated_at = now() where id = p_id and deleted_at is null;
  if not found then raise exception 'not_found'; end if;
end $$;

revoke execute on function add_expense(numeric, expense_kind, text, timestamptz), update_expense(uuid, numeric, expense_kind, text, timestamptz),
  delete_expense(uuid) from public, anon;
grant execute on function add_expense(numeric, expense_kind, text, timestamptz), update_expense(uuid, numeric, expense_kind, text, timestamptz),
  delete_expense(uuid) to authenticated;

alter publication supabase_realtime add table expenses;
