-- Adds manual technician contact fields to maintenance requests
alter table if exists public.maintenance_requests
  add column if not exists assigned_technician_name text,
  add column if not exists assigned_technician_phone text;

comment on column public.maintenance_requests.assigned_technician_name is 'Human-entered technician name for this request';
comment on column public.maintenance_requests.assigned_technician_phone is 'Technician phone number shared with tenant';
