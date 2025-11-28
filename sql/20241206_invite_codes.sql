-- Create invite_codes table to gate signup access
create table if not exists public.invite_codes (
  id uuid not null default gen_random_uuid(),
  code text not null unique,
  expires_at timestamp with time zone not null,
  max_uses integer not null default 1,
  used_count integer not null default 0,
  active boolean not null default true,
  created_at timestamp with time zone null default now(),
  constraint invite_codes_pkey primary key (id)
);

create index if not exists idx_invite_codes_active on public.invite_codes (active);
create index if not exists idx_invite_codes_expires on public.invite_codes (expires_at);
create index if not exists idx_invite_codes_usage on public.invite_codes (used_count, max_uses);
