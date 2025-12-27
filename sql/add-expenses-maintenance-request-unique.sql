-- Ensure maintenance requests can upsert expenses without conflict errors.
alter table public.expenses
  add column if not exists maintenance_request_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'expenses_org_maintenance_request_unique'
      and conrelid = 'public.expenses'::regclass
  ) then
    alter table public.expenses
      add constraint expenses_org_maintenance_request_unique
      unique (organization_id, maintenance_request_id);
  end if;
end $$;
