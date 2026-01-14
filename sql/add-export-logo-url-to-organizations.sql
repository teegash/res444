alter table public.organizations
add column if not exists export_logo_url text null;
