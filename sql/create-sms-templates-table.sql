create table if not exists public.sms_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  template_key text not null,
  name text not null,
  description text null,
  content text not null,
  last_modified_at timestamp with time zone not null default CURRENT_TIMESTAMP,
  last_modified_by uuid references auth.users(id),
  constraint sms_templates_unique_org_key unique (organization_id, template_key)
);

create index if not exists idx_sms_templates_org on public.sms_templates (organization_id);
