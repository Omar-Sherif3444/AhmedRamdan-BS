-- Undo for the operator's Done tap.
--
-- Done fires immediately with no confirmation dialog (DESIGN.md), so the 8-second Undo must be able
-- to put the visit back. end_visit has no inverse; this is it. Deliberately narrow: only a visit that
-- was *completed* (a cancelled one is a release, not a Done), only shortly after it ended, and only
-- while its seat has not been given to someone else.

create function reopen_visit(p_visit uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_visit visits;
  v_seat seats;
begin
  if not is_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into v_visit from visits where id = p_visit for update;
  if not found or v_visit.status <> 'completed' then raise exception 'invalid_transition'; end if;
  if v_visit.ended_at < now() - interval '15 minutes' then raise exception 'invalid_transition'; end if;
  if not can_edit_visit(p_visit) then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into v_seat from seats where id = v_visit.seat_id for update;
  -- 'reserved' is what Done leaves behind when another customer was expected.
  if v_seat.status not in ('available', 'reserved') then raise exception 'seat_unavailable'; end if;
  update visits set status = 'in_progress', ended_at = null where id = p_visit;
  update seats set status = 'occupied', visit_id = p_visit, since = v_visit.started_at where id = v_visit.seat_id;
end $$;

revoke execute on function reopen_visit(uuid) from public, anon;
grant execute on function reopen_visit(uuid) to authenticated;
