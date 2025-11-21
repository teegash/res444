create table if not exists public.mpesa_settings (
  id uuid primary key default gen_random_uuid (),
  auto_verify_enabled boolean not null default true,
  auto_verify_frequency_seconds integer not null default 30,
  max_retries integer not null default 3,
  query_timeout_seconds integer not null default 30,
  last_tested_at timestamp with time zone null,
  last_test_status text null,
  updated_at timestamp with time zone null default CURRENT_TIMESTAMP,
  updated_by uuid null,
  created_at timestamp with time zone null default CURRENT_TIMESTAMP,
  constraint mpesa_settings_max_retries_check check (
    max_retries >= 1 AND max_retries <= 6
  ),
  constraint mpesa_settings_frequency_check check (
    auto_verify_frequency_seconds >= 15 AND auto_verify_frequency_seconds <= 300
  ),
  constraint mpesa_settings_timeout_check check (
    query_timeout_seconds >= 15 AND query_timeout_seconds <= 120
  )
);
