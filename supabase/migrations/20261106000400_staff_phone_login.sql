-- Staff can sign in with the phone number on their profile as well as their email.
-- Returns the sign-in email of the active staff member with that phone (last 10 digits, so 010…, +2010… and
-- 2010… all match), or null. The password is still checked by Supabase Auth.
create function staff_login_email(p_phone text) returns text
language sql stable security definer set search_path = public as $$
  select email from staff
  where active
    and length(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')) >= 7
    and length(regexp_replace(phone, '\D', '', 'g')) >= 7
    and right(regexp_replace(phone, '\D', '', 'g'), 10) = right(regexp_replace(p_phone, '\D', '', 'g'), 10)
  order by role = 'owner' desc, joined_at
  limit 1
$$;

revoke execute on function staff_login_email(text) from public;
grant execute on function staff_login_email(text) to anon, authenticated;
