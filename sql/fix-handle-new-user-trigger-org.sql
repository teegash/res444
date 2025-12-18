-- Fix: prevent auth user creation failures when user_profiles.organization_id is NOT NULL
-- Run in Supabase SQL Editor.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
begin
  v_org_id := nullif(new.raw_user_meta_data->>'organization_id', '')::uuid;

  -- organization_id is required. If the signup didn't provide it, don't create the profile here.
  if v_org_id is null then
    return new;
  end if;

  insert into public.user_profiles (
    id,
    full_name,
    phone_number,
    role,
    organization_id,
    created_at,
    updated_at
  )
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'phone', new.raw_user_meta_data->>'phone_number', ''),
    nullif(new.raw_user_meta_data->>'role', ''),
    v_org_id,
    now(),
    now()
  )
  on conflict (id) do update
  set
    full_name = coalesce(excluded.full_name, user_profiles.full_name),
    phone_number = coalesce(excluded.phone_number, user_profiles.phone_number),
    role = coalesce(excluded.role, user_profiles.role),
    organization_id = coalesce(user_profiles.organization_id, excluded.organization_id),
    updated_at = now();

  return new;
end $$;

-- Ensure trigger exists (safe to re-run).
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

