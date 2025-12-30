create table public.apartment_buildings (
  id uuid not null default gen_random_uuid (),
  organization_id uuid not null,
  name text not null,
  location text not null,
  total_units integer not null,
  description text null,
  image_url text null,
  created_at timestamp with time zone null default CURRENT_TIMESTAMP,
  updated_at timestamp with time zone null default CURRENT_TIMESTAMP,
  constraint apartment_buildings_pkey primary key (id),
  constraint apartment_buildings_id_org_unique unique (id, organization_id),
  constraint apartment_buildings_organization_id_fkey foreign KEY (organization_id) references organizations (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists idx_buildings_org_id on public.apartment_buildings using btree (organization_id) TABLESPACE pg_default;




create table public.apartment_units (
  id uuid not null default gen_random_uuid (),
  building_id uuid not null,
  unit_number text not null,
  floor integer null,
  number_of_bedrooms integer null,
  number_of_bathrooms integer null,
  size_sqft numeric(10, 2) null,
  status text null,
  bulk_group_id uuid null,
  unit_price_category text null,
  created_at timestamp with time zone null default CURRENT_TIMESTAMP,
  updated_at timestamp with time zone null default CURRENT_TIMESTAMP,
  organization_id uuid not null,
  constraint apartment_units_pkey primary key (id),
  constraint apartment_units_building_id_unit_number_key unique (building_id, unit_number),
  constraint apartment_units_id_org_unique unique (id, organization_id),
  constraint apartment_units_building_org_fk foreign KEY (building_id, organization_id) references apartment_buildings (id, organization_id) on delete CASCADE,
  constraint apartment_units_org_fk foreign KEY (organization_id) references organizations (id) on delete CASCADE,
  constraint apartment_units_status_check check (
    (
      status = any (
        array[
          'occupied'::text,
          'vacant'::text,
          'maintenance'::text
        ]
      )
    )
  )
) TABLESPACE pg_default;

create index IF not exists idx_units_building_id on public.apartment_units using btree (building_id) TABLESPACE pg_default;

create index IF not exists idx_units_status on public.apartment_units using btree (status) TABLESPACE pg_default;

create index IF not exists idx_units_bulk_group on public.apartment_units using btree (bulk_group_id) TABLESPACE pg_default;

create index IF not exists idx_units_org_id on public.apartment_units using btree (organization_id) TABLESPACE pg_default;





create table public.app_settings (
  id uuid not null default gen_random_uuid (),
  organization_id uuid not null,
  key text not null,
  value text not null,
  created_at timestamp with time zone not null default now(),
  constraint app_settings_pkey primary key (id),
  constraint app_settings_organization_id_key_key unique (organization_id, key)
) TABLESPACE pg_default;






create table public.bulk_unit_creation_logs (
  id uuid not null default gen_random_uuid (),
  building_id uuid not null,
  bulk_group_id uuid not null,
  created_by uuid not null,
  units_created integer not null,
  units_data jsonb not null,
  created_at timestamp with time zone null default CURRENT_TIMESTAMP,
  organization_id uuid not null,
  constraint bulk_unit_creation_logs_pkey primary key (id),
  constraint bulk_logs_building_org_fk foreign KEY (building_id, organization_id) references apartment_buildings (id, organization_id) on delete CASCADE,
  constraint bulk_logs_org_fk foreign KEY (organization_id) references organizations (id) on delete CASCADE,
  constraint bulk_unit_creation_logs_created_by_fkey foreign KEY (created_by) references auth.users (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists idx_bulk_building_id on public.bulk_unit_creation_logs using btree (building_id) TABLESPACE pg_default;

create index IF not exists idx_bulk_group_id on public.bulk_unit_creation_logs using btree (bulk_group_id) TABLESPACE pg_default;

create index IF not exists idx_bulk_logs_org_id on public.bulk_unit_creation_logs using btree (organization_id) TABLESPACE pg_default;





create table public.communications (
  id uuid not null default gen_random_uuid (),
  sender_user_id uuid not null,
  recipient_user_id uuid null,
  related_entity_type text null,
  related_entity_id uuid null,
  message_text text not null,
  message_type text null,
  read boolean null default false,
  sent_via_africas_talking boolean null default false,
  africas_talking_message_id text null,
  created_at timestamp with time zone null default CURRENT_TIMESTAMP,
  organization_id uuid not null,
  constraint communications_pkey primary key (id),
  constraint communications_org_fk foreign KEY (organization_id) references organizations (id) on delete CASCADE,
  constraint communications_recipient_user_id_fkey foreign KEY (recipient_user_id) references auth.users (id) on delete CASCADE,
  constraint communications_sender_user_id_fkey foreign KEY (sender_user_id) references auth.users (id) on delete CASCADE,
  constraint communications_message_type_check check (
    (
      message_type = any (array['sms'::text, 'in_app'::text, 'email'::text])
    )
  ),
  constraint communications_related_entity_type_check check (
    (
      related_entity_type = any (
        array[
          'maintenance_request'::text,
          'payment'::text,
          'lease'::text
        ]
      )
    )
  )
) TABLESPACE pg_default;

create index IF not exists idx_communications_sender on public.communications using btree (sender_user_id) TABLESPACE pg_default;

create index IF not exists idx_communications_recipient on public.communications using btree (recipient_user_id) TABLESPACE pg_default;

create index IF not exists idx_communications_created_at on public.communications using btree (created_at) TABLESPACE pg_default;

create index IF not exists idx_communications_org_id on public.communications using btree (organization_id) TABLESPACE pg_default;

create index IF not exists idx_communications_recipient_created_at on public.communications using btree (recipient_user_id, created_at desc) TABLESPACE pg_default;

create trigger trg_set_communications_org_from_sender BEFORE INSERT on communications for EACH row
execute FUNCTION set_communications_org_from_sender ();





create table public.cron_runs (
  id uuid not null default gen_random_uuid (),
  organization_id uuid null,
  function_name text not null,
  trigger text not null default 'github_actions'::text,
  started_at timestamp with time zone not null default now(),
  finished_at timestamp with time zone null,
  ok boolean null,
  inserted_count integer not null default 0,
  attempted_count integer not null default 0,
  skipped_prepaid integer not null default 0,
  leases_processed integer not null default 0,
  months_considered integer not null default 0,
  catch_up boolean not null default false,
  error text null,
  meta jsonb not null default '{}'::jsonb,
  constraint cron_runs_pkey primary key (id)
) TABLESPACE pg_default;

create index IF not exists idx_cron_runs_function_started on public.cron_runs using btree (function_name, started_at desc) TABLESPACE pg_default;

create index IF not exists idx_cron_runs_started on public.cron_runs using btree (started_at desc) TABLESPACE pg_default;

create index IF not exists idx_cron_runs_org_started on public.cron_runs using btree (organization_id, started_at desc) TABLESPACE pg_default;

create unique INDEX IF not exists ux_cron_runs_one_active_per_function on public.cron_runs using btree (function_name) TABLESPACE pg_default
where
  (finished_at is null);

create index IF not exists idx_cron_runs_active_started_at on public.cron_runs using btree (started_at) TABLESPACE pg_default
where
  (finished_at is null);






create table public.cron_runs (
  id uuid not null default gen_random_uuid (),
  organization_id uuid null,
  function_name text not null,
  trigger text not null default 'github_actions'::text,
  started_at timestamp with time zone not null default now(),
  finished_at timestamp with time zone null,
  ok boolean null,
  inserted_count integer not null default 0,
  attempted_count integer not null default 0,
  skipped_prepaid integer not null default 0,
  leases_processed integer not null default 0,
  months_considered integer not null default 0,
  catch_up boolean not null default false,
  error text null,
  meta jsonb not null default '{}'::jsonb,
  constraint cron_runs_pkey primary key (id)
) TABLESPACE pg_default;

create index IF not exists idx_cron_runs_function_started on public.cron_runs using btree (function_name, started_at desc) TABLESPACE pg_default;

create index IF not exists idx_cron_runs_started on public.cron_runs using btree (started_at desc) TABLESPACE pg_default;

create index IF not exists idx_cron_runs_org_started on public.cron_runs using btree (organization_id, started_at desc) TABLESPACE pg_default;

create unique INDEX IF not exists ux_cron_runs_one_active_per_function on public.cron_runs using btree (function_name) TABLESPACE pg_default
where
  (finished_at is null);

create index IF not exists idx_cron_runs_active_started_at on public.cron_runs using btree (started_at) TABLESPACE pg_default
where
  (finished_at is null);







create table public.cron_state (
  function_name text not null,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamp with time zone not null default now(),
  constraint cron_state_pkey primary key (function_name)
) TABLESPACE pg_default;

create trigger trg_touch_cron_state_updated_at BEFORE
update on cron_state for EACH row
execute FUNCTION touch_cron_state_updated_at ();





create table public.expenses (
  id uuid not null default gen_random_uuid (),
  property_id uuid not null,
  category text not null,
  amount numeric(12, 2) not null,
  incurred_at timestamp with time zone not null default now(),
  notes text null,
  created_by uuid null,
  created_at timestamp with time zone null default now(),
  organization_id uuid not null,
  recurring_expense_id uuid null,
  maintenance_request_id uuid null,
  constraint expenses_pkey primary key (id),
  constraint expenses_org_maintenance_request_unique unique (organization_id, maintenance_request_id),
  constraint expenses_maintenance_request_fk foreign KEY (maintenance_request_id) references maintenance_requests (id) on delete set null,
  constraint expenses_org_fk foreign KEY (organization_id) references organizations (id) on delete CASCADE,
  constraint fk_expenses_recurring_expense_id foreign KEY (recurring_expense_id) references recurring_expenses (id) on delete set null,
  constraint expenses_created_by_fkey foreign KEY (created_by) references auth.users (id),
  constraint expenses_property_org_fk foreign KEY (property_id, organization_id) references apartment_buildings (id, organization_id) on delete CASCADE,
  constraint expenses_amount_check check ((amount >= (0)::numeric)),
  constraint expenses_category_check check (
    (
      category = any (
        array[
          'maintenance'::text,
          'utilities'::text,
          'taxes'::text,
          'staff'::text,
          'insurance'::text,
          'marketing'::text,
          'other'::text
        ]
      )
    )
  )
) TABLESPACE pg_default;

create index IF not exists idx_expenses_org_id on public.expenses using btree (organization_id) TABLESPACE pg_default;

create index IF not exists idx_expenses_property on public.expenses using btree (property_id) TABLESPACE pg_default;

create index IF not exists idx_expenses_incurred_at on public.expenses using btree (incurred_at) TABLESPACE pg_default;

create unique INDEX IF not exists uq_expenses_recurring_idempotent on public.expenses using btree (
  organization_id,
  recurring_expense_id,
  incurred_at
) TABLESPACE pg_default
where
  (recurring_expense_id is not null);

create unique INDEX IF not exists uq_expenses_maintenance_request_idempotent on public.expenses using btree (organization_id, maintenance_request_id) TABLESPACE pg_default
where
  (maintenance_request_id is not null);






create table public.invite_codes (
  id uuid not null default gen_random_uuid (),
  code text not null,
  expires_at timestamp with time zone not null,
  max_uses integer not null default 1,
  used_count integer not null default 0,
  active boolean not null default true,
  created_at timestamp with time zone null default now(),
  constraint invite_codes_pkey primary key (id),
  constraint invite_codes_code_key unique (code)
) TABLESPACE pg_default;

create index IF not exists idx_invite_codes_active on public.invite_codes using btree (active) TABLESPACE pg_default;

create index IF not exists idx_invite_codes_expires on public.invite_codes using btree (expires_at) TABLESPACE pg_default;

create index IF not exists idx_invite_codes_usage on public.invite_codes using btree (used_count, max_uses) TABLESPACE pg_default;






create table public.invoices (
  id uuid not null default gen_random_uuid (),
  lease_id uuid not null,
  invoice_type text not null,
  amount numeric(12, 2) not null,
  due_date date not null,
  payment_date date null,
  months_covered integer null default 1,
  description text null,
  created_at timestamp with time zone null default CURRENT_TIMESTAMP,
  updated_at timestamp with time zone null default CURRENT_TIMESTAMP,
  status boolean null default false,
  organization_id uuid not null,
  period_start date null,
  status_text text null,
  notes text null,
  last_reminder_stage integer null,
  last_reminder_sent_at timestamp with time zone null,
  total_paid numeric(12, 2) not null default 0,
  constraint invoices_pkey primary key (id),
  constraint invoices_id_org_unique unique (id, organization_id),
  constraint invoices_unique_lease_type_period unique (lease_id, invoice_type, period_start),
  constraint invoices_org_fk foreign KEY (organization_id) references organizations (id) on delete CASCADE,
  constraint invoices_lease_org_fk foreign KEY (lease_id, organization_id) references leases (id, organization_id) on delete CASCADE,
  constraint invoices_status_text_check check (
    (
      status_text = any (
        array[
          'unpaid'::text,
          'paid'::text,
          'overdue'::text,
          'partially_paid'::text,
          'void'::text
        ]
      )
    )
  ),
  constraint invoices_invoice_type_check check (
    (
      invoice_type = any (array['rent'::text, 'water'::text])
    )
  )
) TABLESPACE pg_default;

create index IF not exists idx_invoices_lease_id on public.invoices using btree (lease_id) TABLESPACE pg_default;

create index IF not exists idx_invoices_due_date on public.invoices using btree (due_date) TABLESPACE pg_default;

create index IF not exists idx_invoices_type on public.invoices using btree (invoice_type) TABLESPACE pg_default;

create unique INDEX IF not exists idx_invoices_lease_due_type on public.invoices using btree (lease_id, due_date, invoice_type) TABLESPACE pg_default;

create index IF not exists idx_invoices_amount_paid on public.invoices using btree (status_text, total_paid) TABLESPACE pg_default;

create unique INDEX IF not exists invoices_unique_water_lease_period on public.invoices using btree (lease_id, period_start) TABLESPACE pg_default
where
  (invoice_type = 'water'::text);

create index IF not exists idx_invoices_last_reminder on public.invoices using btree (last_reminder_stage, last_reminder_sent_at) TABLESPACE pg_default;

create index IF not exists idx_invoices_arrears_lookup on public.invoices using btree (
  organization_id,
  invoice_type,
  due_date,
  status_text
) TABLESPACE pg_default;

create index IF not exists idx_invoices_lease_due on public.invoices using btree (lease_id, due_date) TABLESPACE pg_default;

create index IF not exists idx_invoices_lease_type_period on public.invoices using btree (lease_id, invoice_type, period_start) TABLESPACE pg_default;

create index IF not exists idx_invoices_lease_status_type on public.invoices using btree (lease_id, status, invoice_type) TABLESPACE pg_default;

create index IF not exists idx_invoices_lease_due_date on public.invoices using btree (lease_id, due_date, invoice_type) TABLESPACE pg_default;

create index IF not exists idx_invoices_org_id on public.invoices using btree (organization_id) TABLESPACE pg_default;

create index IF not exists idx_invoices_org_lease on public.invoices using btree (organization_id, lease_id) TABLESPACE pg_default;

create index IF not exists idx_invoices_org_lease_id on public.invoices using btree (organization_id, lease_id) TABLESPACE pg_default;

create unique INDEX IF not exists invoices_unique_active_lease_type_period on public.invoices using btree (lease_id, invoice_type, period_start) TABLESPACE pg_default
where
  (
    COALESCE(status_text, 'unpaid'::text) <> 'void'::text
  );

create index IF not exists idx_invoices_org_lease_due on public.invoices using btree (organization_id, lease_id, due_date) TABLESPACE pg_default;

create index IF not exists idx_invoices_org_invoice_type on public.invoices using btree (organization_id, invoice_type) TABLESPACE pg_default;






create table public.lease_renewal_events (
  id uuid not null default gen_random_uuid (),
  renewal_id uuid not null,
  organization_id uuid not null,
  actor_user_id uuid null,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  ip text null,
  user_agent text null,
  created_at timestamp with time zone not null default now(),
  constraint lease_renewal_events_pkey primary key (id),
  constraint lease_renewal_events_renewal_id_fkey foreign KEY (renewal_id) references lease_renewals (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists idx_lease_renewal_events_renewal on public.lease_renewal_events using btree (renewal_id) TABLESPACE pg_default;





create table public.lease_renewals (
  id uuid not null default gen_random_uuid (),
  organization_id uuid not null,
  lease_id uuid not null,
  tenant_user_id uuid not null,
  status text not null default 'draft'::text,
  proposed_start_date date null,
  proposed_end_date date null,
  proposed_rent numeric null,
  proposed_deposit numeric null,
  notes text null,
  opensign_document_id text null,
  opensign_status text null,
  opensign_file_url text null,
  opensign_certificate_url text null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  pdf_unsigned_path text null,
  pdf_tenant_signed_path text null,
  pdf_fully_signed_path text null,
  tenant_signed_at timestamp with time zone null,
  manager_signed_at timestamp with time zone null,
  constraint lease_renewals_pkey primary key (id),
  constraint lease_renewals_status_check check (
    (
      status = any (
        array[
          'draft'::text,
          'sent_for_signature'::text,
          'in_progress'::text,
          'completed'::text,
          'declined'::text,
          'expired'::text,
          'cancelled'::text
        ]
      )
    )
  )
) TABLESPACE pg_default;

create index IF not exists idx_lease_renewals_org_lease on public.lease_renewals using btree (organization_id, lease_id) TABLESPACE pg_default;

create index IF not exists idx_lease_renewals_org_tenant on public.lease_renewals using btree (organization_id, tenant_user_id) TABLESPACE pg_default;

create unique INDEX IF not exists uq_lease_renewal_active on public.lease_renewals using btree (lease_id) TABLESPACE pg_default
where
  (
    status = any (
      array[
        'draft'::text,
        'sent_for_signature'::text,
        'in_progress'::text
      ]
    )
  );

create index IF not exists idx_lease_renewals_lease on public.lease_renewals using btree (lease_id) TABLESPACE pg_default;

create index IF not exists idx_lease_renewals_org on public.lease_renewals using btree (organization_id) TABLESPACE pg_default;







create table public.leases (
  id uuid not null default gen_random_uuid (),
  unit_id uuid not null,
  tenant_user_id uuid not null,
  start_date date not null,
  end_date date null,
  monthly_rent numeric(12, 2) not null,
  deposit_amount numeric(12, 2) null,
  status text null,
  lease_agreement_url text null,
  rent_auto_populated boolean null default false,
  rent_locked_reason text null,
  lease_auto_generated boolean null default false,
  created_at timestamp with time zone null default CURRENT_TIMESTAMP,
  updated_at timestamp with time zone null default CURRENT_TIMESTAMP,
  rent_paid_until date null,
  next_rent_due_date date null default CURRENT_DATE,
  organization_id uuid not null,
  constraint leases_pkey primary key (id),
  constraint leases_id_org_unique unique (id, organization_id),
  constraint leases_unit_org_fk foreign KEY (unit_id, organization_id) references apartment_units (id, organization_id) on delete CASCADE,
  constraint leases_org_fk foreign KEY (organization_id) references organizations (id) on delete CASCADE,
  constraint leases_tenant_user_id_fkey foreign KEY (tenant_user_id) references auth.users (id) on delete CASCADE,
  constraint leases_status_check check (
    (
      status = any (
        array['active'::text, 'ended'::text, 'pending'::text]
      )
    )
  ),
  constraint rent_paid_until_must_be_month_end check (
    (
      (rent_paid_until is null)
      or (
        rent_paid_until = (
          (
            (
              date_trunc(
                'month'::text,
                (rent_paid_until)::timestamp with time zone
              )
            )::date + '1 mon -1 days'::interval
          )
        )::date
      )
    )
  )
) TABLESPACE pg_default;

create index IF not exists idx_leases_status on public.leases using btree (status) TABLESPACE pg_default;

create index IF not exists idx_leases_unit_id on public.leases using btree (unit_id) TABLESPACE pg_default;

create index IF not exists idx_leases_tenant_user_id on public.leases using btree (tenant_user_id) TABLESPACE pg_default;

create index IF not exists idx_leases_org_id on public.leases using btree (organization_id) TABLESPACE pg_default;

create index IF not exists idx_leases_next_rent_due_date on public.leases using btree (next_rent_due_date) TABLESPACE pg_default;

create index IF not exists idx_leases_org_unit_id on public.leases using btree (organization_id, unit_id) TABLESPACE pg_default;






create table public.maintenance_requests (
  id uuid not null default gen_random_uuid (),
  unit_id uuid not null,
  tenant_user_id uuid not null,
  title text not null,
  description text not null,
  priority_level text null,
  status text null,
  assigned_to uuid null,
  attachment_urls text[] null,
  created_at timestamp with time zone null default CURRENT_TIMESTAMP,
  updated_at timestamp with time zone null default CURRENT_TIMESTAMP,
  completed_at timestamp with time zone null,
  assigned_technician_name text null,
  assigned_technician_phone text null,
  organization_id uuid not null,
  technician_id uuid null,
  assigned_profession_id uuid null,
  maintenance_cost numeric(12, 2) not null default 0,
  maintenance_cost_notes text null,
  maintenance_cost_paid_by text not null default 'tenant'::text,
  constraint maintenance_requests_pkey primary key (id),
  constraint maintenance_requests_org_fk foreign KEY (organization_id) references organizations (id) on delete CASCADE,
  constraint maintenance_unit_org_fk foreign KEY (unit_id, organization_id) references apartment_units (id, organization_id) on delete CASCADE,
  constraint maintenance_requests_tenant_user_id_fkey foreign KEY (tenant_user_id) references auth.users (id) on delete CASCADE,
  constraint maintenance_requests_assigned_to_fkey foreign KEY (assigned_to) references auth.users (id),
  constraint maintenance_requests_profession_fk foreign KEY (assigned_profession_id) references technician_professions (id) on delete set null,
  constraint maintenance_requests_technician_fk foreign KEY (technician_id) references technicians (id) on delete set null,
  constraint maintenance_requests_priority_level_check check (
    (
      priority_level = any (
        array[
          'low'::text,
          'medium'::text,
          'high'::text,
          'urgent'::text
        ]
      )
    )
  ),
  constraint maintenance_requests_status_check check (
    (
      status = any (
        array[
          'open'::text,
          'assigned'::text,
          'in_progress'::text,
          'completed'::text,
          'cancelled'::text
        ]
      )
    )
  )
) TABLESPACE pg_default;

create index IF not exists idx_maintenance_unit_id on public.maintenance_requests using btree (unit_id) TABLESPACE pg_default;

create index IF not exists idx_maintenance_tenant_id on public.maintenance_requests using btree (tenant_user_id) TABLESPACE pg_default;

create index IF not exists idx_maintenance_status on public.maintenance_requests using btree (status) TABLESPACE pg_default;

create index IF not exists idx_maintenance_priority on public.maintenance_requests using btree (priority_level) TABLESPACE pg_default;

create index IF not exists idx_maintenance_technician on public.maintenance_requests using btree (organization_id, technician_id) TABLESPACE pg_default;

create index IF not exists idx_maintenance_profession on public.maintenance_requests using btree (organization_id, assigned_profession_id) TABLESPACE pg_default;

create index IF not exists idx_maintenance_cost_org_unit_created on public.maintenance_requests using btree (organization_id, unit_id, created_at) TABLESPACE pg_default;

create index IF not exists idx_maintenance_org_id on public.maintenance_requests using btree (organization_id) TABLESPACE pg_default;

create trigger trg_sync_maintenance_cost_to_expenses
after INSERT
or
update OF unit_id,
maintenance_cost,
maintenance_cost_paid_by,
maintenance_cost_notes,
title on maintenance_requests for EACH row
execute FUNCTION sync_maintenance_cost_to_expenses ();






create table public.mpesa_settings (
  id uuid not null default gen_random_uuid (),
  auto_verify_enabled boolean not null default true,
  auto_verify_frequency_seconds integer not null default 30,
  max_retries integer not null default 3,
  query_timeout_seconds integer not null default 30,
  last_tested_at timestamp with time zone null,
  last_test_status text null,
  updated_at timestamp with time zone null default CURRENT_TIMESTAMP,
  updated_by uuid null,
  created_at timestamp with time zone null default CURRENT_TIMESTAMP,
  organization_id uuid not null,
  constraint mpesa_settings_pkey primary key (id),
  constraint mpesa_settings_org_fk foreign KEY (organization_id) references organizations (id) on delete CASCADE,
  constraint mpesa_settings_frequency_check check (
    (
      (auto_verify_frequency_seconds >= 15)
      and (auto_verify_frequency_seconds <= 300)
    )
  ),
  constraint mpesa_settings_max_retries_check check (
    (
      (max_retries >= 1)
      and (max_retries <= 6)
    )
  ),
  constraint mpesa_settings_timeout_check check (
    (
      (query_timeout_seconds >= 15)
      and (query_timeout_seconds <= 120)
    )
  )
) TABLESPACE pg_default;

create index IF not exists idx_mpesa_settings_org_id on public.mpesa_settings using btree (organization_id) TABLESPACE pg_default;

create unique INDEX IF not exists mpesa_settings_one_per_org on public.mpesa_settings using btree (organization_id) TABLESPACE pg_default;





create table public.mpesa_verification_audit (
  id uuid not null default gen_random_uuid (),
  payment_id uuid not null,
  query_timestamp timestamp with time zone null default CURRENT_TIMESTAMP,
  response_code text null,
  result_description text null,
  transaction_status text null,
  daraja_response jsonb null,
  created_at timestamp with time zone null default CURRENT_TIMESTAMP,
  organization_id uuid not null,
  constraint mpesa_verification_audit_pkey primary key (id),
  constraint mpesa_audit_payment_org_fk foreign KEY (payment_id, organization_id) references payments (id, organization_id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists idx_audit_payment on public.mpesa_verification_audit using btree (payment_id) TABLESPACE pg_default;

create index IF not exists idx_audit_timestamp on public.mpesa_verification_audit using btree (query_timestamp) TABLESPACE pg_default;

create index IF not exists idx_mpesa_audit_org_id on public.mpesa_verification_audit using btree (organization_id) TABLESPACE pg_default;





create table public.organization_members (
  id uuid not null default gen_random_uuid (),
  user_id uuid not null,
  organization_id uuid not null,
  role text not null,
  joined_at timestamp with time zone null default CURRENT_TIMESTAMP,
  constraint organization_members_pkey primary key (id),
  constraint organization_members_one_org_per_user unique (user_id),
  constraint organization_members_organization_id_fkey foreign KEY (organization_id) references organizations (id) on delete CASCADE,
  constraint organization_members_user_id_fkey foreign KEY (user_id) references auth.users (id) on delete CASCADE,
  constraint organization_members_role_check check (
    (
      role = any (
        array[
          'admin'::text,
          'manager'::text,
          'caretaker'::text,
          'tenant'::text
        ]
      )
    )
  )
) TABLESPACE pg_default;

create index IF not exists idx_org_members_user_id on public.organization_members using btree (user_id) TABLESPACE pg_default;

create index IF not exists idx_org_members_org_id on public.organization_members using btree (organization_id) TABLESPACE pg_default;

create index IF not exists idx_org_members_role on public.organization_members using btree (role) TABLESPACE pg_default;

create unique INDEX IF not exists organization_one_admin on public.organization_members using btree (organization_id) TABLESPACE pg_default
where
  (role = 'admin'::text);

create trigger trg_enforce_single_org_membership BEFORE INSERT
or
update on organization_members for EACH row
execute FUNCTION enforce_single_org_membership ();





create table public.organizations (
  id uuid not null default gen_random_uuid (),
  name text not null,
  email text not null,
  phone text null,
  location text null,
  registration_number text null,
  logo_url text null,
  created_at timestamp with time zone null default CURRENT_TIMESTAMP,
  updated_at timestamp with time zone null default CURRENT_TIMESTAMP,
  constraint organizations_pkey primary key (id),
  constraint organizations_registration_number_key unique (registration_number)
) TABLESPACE pg_default;

create index IF not exists idx_organizations_id on public.organizations using btree (id) TABLESPACE pg_default;




create table public.payments (
  id uuid not null default gen_random_uuid (),
  invoice_id uuid not null,
  tenant_user_id uuid not null,
  amount_paid numeric(12, 2) not null,
  payment_method text null,
  mpesa_receipt_number text null,
  bank_reference_number text null,
  deposit_slip_url text null,
  payment_date timestamp with time zone null default CURRENT_TIMESTAMP,
  verified boolean null default false,
  verified_by uuid null,
  verified_at timestamp with time zone null,
  notes text null,
  mpesa_auto_verified boolean null default false,
  mpesa_verification_timestamp timestamp with time zone null,
  mpesa_query_status text null,
  mpesa_response_code text null,
  last_status_check timestamp with time zone null,
  retry_count integer null default 0,
  created_at timestamp with time zone null default CURRENT_TIMESTAMP,
  months_paid integer null default 1,
  organization_id uuid not null,
  batch_id uuid null,
  applied_to_prepayment boolean not null default false,
  mpesa_checkout_request_id text null,
  constraint payments_pkey primary key (id),
  constraint payments_id_org_unique unique (id, organization_id),
  constraint payments_verified_by_fkey foreign KEY (verified_by) references auth.users (id),
  constraint payments_invoice_org_fk foreign KEY (invoice_id, organization_id) references invoices (id, organization_id) on delete CASCADE,
  constraint payments_org_fk foreign KEY (organization_id) references organizations (id) on delete CASCADE,
  constraint payments_tenant_user_id_fkey foreign KEY (tenant_user_id) references auth.users (id) on delete CASCADE,
  constraint payments_payment_method_check check (
    (
      payment_method = any (
        array[
          'mpesa'::text,
          'bank_transfer'::text,
          'cash'::text,
          'cheque'::text
        ]
      )
    )
  )
) TABLESPACE pg_default;

create index IF not exists idx_payments_invoice_id on public.payments using btree (invoice_id) TABLESPACE pg_default;

create index IF not exists idx_payments_tenant_user_id on public.payments using btree (tenant_user_id) TABLESPACE pg_default;

create index IF not exists idx_payments_payment_date on public.payments using btree (payment_date) TABLESPACE pg_default;

create index IF not exists idx_payments_verified on public.payments using btree (verified) TABLESPACE pg_default;

create index IF not exists idx_payments_mpesa_pending on public.payments using btree (verified, mpesa_receipt_number) TABLESPACE pg_default
where
  (
    (payment_method = 'mpesa'::text)
    and (verified = false)
  );

create index IF not exists idx_payments_org_invoice_verified_date on public.payments using btree (
  organization_id,
  invoice_id,
  verified,
  payment_date desc
) TABLESPACE pg_default;

create index IF not exists idx_payments_org_invoice_id on public.payments using btree (organization_id, invoice_id) TABLESPACE pg_default;

create index IF not exists idx_payments_org_id on public.payments using btree (organization_id) TABLESPACE pg_default;

create index IF not exists idx_payments_batch_id on public.payments using btree (batch_id) TABLESPACE pg_default;

create index IF not exists idx_payments_mpesa_checkout_unverified on public.payments using btree (organization_id, mpesa_checkout_request_id) TABLESPACE pg_default
where
  (
    (payment_method = 'mpesa'::text)
    and (verified = false)
    and (mpesa_checkout_request_id is not null)
  );

create index IF not exists idx_payments_applied_to_prepayment on public.payments using btree (applied_to_prepayment) TABLESPACE pg_default;

create index IF not exists idx_payments_org_tenant_date on public.payments using btree (organization_id, tenant_user_id, payment_date) TABLESPACE pg_default;

create index IF not exists idx_payments_mpesa_last_check_unverified on public.payments using btree (organization_id, last_status_check) TABLESPACE pg_default
where
  (
    (payment_method = 'mpesa'::text)
    and (verified = false)
  );

create index IF not exists idx_payments_org_verified_payment_date on public.payments using btree (organization_id, verified, payment_date) TABLESPACE pg_default;

create trigger payments_recompute_invoice_total_paid
after INSERT
or DELETE
or
update on payments for EACH row
execute FUNCTION trg_payments_recompute_invoice_total_paid ();

create trigger trg_apply_rent_prepayment_on_payment_verify
after INSERT
or
update OF verified,
months_paid on payments for EACH row when (
  new.verified = true
  and COALESCE(new.months_paid, 1) > 1
  and COALESCE(new.applied_to_prepayment, false) = false
)
execute FUNCTION apply_rent_prepayment_on_payment_verify ();





create table public.recurring_expenses (
  id uuid not null default gen_random_uuid (),
  property_id uuid not null,
  category text not null,
  amount numeric(12, 2) not null,
  notes text null,
  next_run timestamp with time zone not null,
  active boolean not null default true,
  created_by uuid null,
  created_at timestamp with time zone null default now(),
  organization_id uuid not null,
  constraint recurring_expenses_pkey primary key (id),
  constraint recurring_expenses_created_by_fkey foreign KEY (created_by) references auth.users (id),
  constraint recurring_expenses_org_fk foreign KEY (organization_id) references organizations (id) on delete CASCADE,
  constraint recurring_expenses_property_org_fk foreign KEY (property_id, organization_id) references apartment_buildings (id, organization_id) on delete CASCADE,
  constraint recurring_expenses_amount_check check ((amount >= (0)::numeric))
) TABLESPACE pg_default;

create index IF not exists idx_recurring_expenses_org_id on public.recurring_expenses using btree (organization_id) TABLESPACE pg_default;

create index IF not exists idx_recurring_expenses_next_run on public.recurring_expenses using btree (next_run) TABLESPACE pg_default;

create index IF not exists idx_recurring_expenses_property on public.recurring_expenses using btree (property_id) TABLESPACE pg_default;




create table public.reminders (
  id uuid not null default gen_random_uuid (),
  user_id uuid not null,
  related_entity_type text null,
  related_entity_id uuid null,
  reminder_type text null,
  message text not null,
  scheduled_for timestamp with time zone not null,
  sent_at timestamp with time zone null,
  delivery_status text null,
  sent_via_africas_talking boolean null default false,
  created_at timestamp with time zone null default CURRENT_TIMESTAMP,
  organization_id uuid not null,
  stage integer null,
  channel text null,
  scheduled_slot text null,
  payload jsonb null,
  scheduled_day date null,
  attempt_count integer not null default 0,
  last_error text null,
  constraint reminders_pkey primary key (id),
  constraint reminders_user_id_fkey foreign KEY (user_id) references auth.users (id) on delete CASCADE,
  constraint reminders_related_entity_type_check check (
    (
      related_entity_type = any (
        array[
          'payment'::text,
          'water_bill'::text,
          'lease'::text,
          'maintenance'::text
        ]
      )
    )
  ),
  constraint reminders_channel_check check (
    (
      channel = any (array['sms'::text, 'in_app'::text, 'email'::text])
    )
  ),
  constraint reminders_scheduled_slot_check check (
    (
      scheduled_slot = any (array['00:30'::text, '14:00'::text])
    )
  ),
  constraint reminders_sent_at_required_if_sent check (
    (
      (delivery_status <> 'sent'::text)
      or (sent_at is not null)
    )
  ),
  constraint reminders_reminder_type_check check (
    (
      reminder_type = any (
        array[
          'rent_payment'::text,
          'water_bill'::text,
          'maintenance_update'::text,
          'lease_renewal'::text
        ]
      )
    )
  ),
  constraint reminders_delivery_status_check check (
    (
      delivery_status = any (
        array[
          'pending'::text,
          'processing'::text,
          'sent'::text,
          'failed'::text
        ]
      )
    )
  )
) TABLESPACE pg_default;

create index IF not exists idx_reminders_user_id on public.reminders using btree (user_id) TABLESPACE pg_default;

create index IF not exists idx_reminders_scheduled_for on public.reminders using btree (scheduled_for) TABLESPACE pg_default;

create index IF not exists idx_reminders_delivery_status on public.reminders using btree (delivery_status) TABLESPACE pg_default;

create index IF not exists idx_reminders_dispatch on public.reminders using btree (delivery_status, scheduled_for) TABLESPACE pg_default;

create index IF not exists idx_reminders_org_id on public.reminders using btree (organization_id) TABLESPACE pg_default;

create unique INDEX IF not exists uq_reminders_rent_idempotent on public.reminders using btree (
  organization_id,
  related_entity_id,
  reminder_type,
  stage,
  channel,
  scheduled_day,
  scheduled_slot
) TABLESPACE pg_default;

create trigger trg_set_reminder_scheduled_day BEFORE INSERT
or
update OF scheduled_for on reminders for EACH row
execute FUNCTION set_reminder_scheduled_day ();




create table public.reports (
  id uuid not null default gen_random_uuid (),
  organization_id uuid not null,
  report_type text null,
  report_period_start date not null,
  report_period_end date not null,
  data_json jsonb null,
  created_by uuid not null,
  created_at timestamp with time zone null default CURRENT_TIMESTAMP,
  constraint reports_pkey primary key (id),
  constraint reports_created_by_fkey foreign KEY (created_by) references auth.users (id),
  constraint reports_organization_id_fkey foreign KEY (organization_id) references organizations (id) on delete CASCADE,
  constraint reports_report_type_check check (
    (
      report_type = any (
        array[
          'monthly'::text,
          'utility'::text,
          'rent'::text,
          'revenue'::text,
          'performance'::text,
          'occupancy'::text,
          'financial'::text
        ]
      )
    )
  )
) TABLESPACE pg_default;

create index IF not exists idx_reports_org_id on public.reports using btree (organization_id) TABLESPACE pg_default;

create index IF not exists idx_reports_report_type on public.reports using btree (report_type) TABLESPACE pg_default;

create index IF not exists idx_reports_created_at on public.reports using btree (created_at) TABLESPACE pg_default;






create table public.sms_templates (
  id uuid not null default gen_random_uuid (),
  organization_id uuid not null,
  template_key text not null,
  name text not null,
  description text null,
  content text not null,
  last_modified_at timestamp with time zone not null default CURRENT_TIMESTAMP,
  last_modified_by uuid null,
  constraint sms_templates_pkey primary key (id),
  constraint sms_templates_unique_org_key unique (organization_id, template_key),
  constraint sms_templates_last_modified_by_fkey foreign KEY (last_modified_by) references auth.users (id),
  constraint sms_templates_organization_id_fkey foreign KEY (organization_id) references organizations (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists idx_sms_templates_org on public.sms_templates using btree (organization_id) TABLESPACE pg_default;

create unique INDEX IF not exists uq_sms_templates_org_key on public.sms_templates using btree (organization_id, template_key) TABLESPACE pg_default;






create table public.technician_profession_map (
  technician_id uuid not null,
  profession_id uuid not null,
  organization_id uuid not null,
  created_at timestamp with time zone not null default now(),
  constraint technician_profession_map_pkey primary key (technician_id, profession_id),
  constraint technician_profession_map_organization_id_technician_id_pro_key unique (organization_id, technician_id, profession_id),
  constraint technician_profession_map_organization_id_fkey foreign KEY (organization_id) references organizations (id) on delete CASCADE,
  constraint technician_profession_map_profession_id_fkey foreign KEY (profession_id) references technician_professions (id) on delete CASCADE,
  constraint technician_profession_map_technician_id_fkey foreign KEY (technician_id) references technicians (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists idx_tech_map_org on public.technician_profession_map using btree (organization_id) TABLESPACE pg_default;

create index IF not exists idx_tech_map_prof on public.technician_profession_map using btree (organization_id, profession_id) TABLESPACE pg_default;




create table public.technician_professions (
  id uuid not null default gen_random_uuid (),
  organization_id uuid not null,
  name text not null,
  created_at timestamp with time zone not null default now(),
  constraint technician_professions_pkey primary key (id),
  constraint technician_professions_organization_id_name_key unique (organization_id, name),
  constraint technician_professions_organization_id_fkey foreign KEY (organization_id) references organizations (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists idx_tech_prof_org on public.technician_professions using btree (organization_id) TABLESPACE pg_default;





create table public.technicians (
  id uuid not null default gen_random_uuid (),
  organization_id uuid not null,
  full_name text not null,
  phone text null,
  email text null,
  company text null,
  is_active boolean not null default true,
  notes text null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint technicians_pkey primary key (id),
  constraint technicians_organization_id_fkey foreign KEY (organization_id) references organizations (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists idx_tech_org on public.technicians using btree (organization_id) TABLESPACE pg_default;

create index IF not exists idx_tech_active on public.technicians using btree (organization_id, is_active) TABLESPACE pg_default;

create trigger trg_technicians_touch_updated_at BEFORE
update on technicians for EACH row
execute FUNCTION touch_updated_at ();




create table public.user_profiles (
  id uuid not null,
  full_name text null,
  phone_number text null,
  national_id text null,
  profile_picture_url text null,
  address text null,
  date_of_birth date null,
  created_at timestamp with time zone null default CURRENT_TIMESTAMP,
  updated_at timestamp with time zone null default CURRENT_TIMESTAMP,
  role text null,
  organization_id uuid not null,
  constraint user_profiles_pkey primary key (id),
  constraint user_profiles_national_id_key unique (national_id),
  constraint user_profiles_id_fkey foreign KEY (id) references auth.users (id) on delete CASCADE,
  constraint user_profiles_org_fk foreign KEY (organization_id) references organizations (id) on delete RESTRICT,
  constraint user_profiles_role_check check (
    (
      (role is null)
      or (
        role = any (
          array[
            'admin'::text,
            'manager'::text,
            'caretaker'::text,
            'tenant'::text
          ]
        )
      )
    )
  )
) TABLESPACE pg_default;

create index IF not exists idx_user_profiles_id on public.user_profiles using btree (id) TABLESPACE pg_default;

create index IF not exists idx_user_profiles_role on public.user_profiles using btree (role) TABLESPACE pg_default;

create index IF not exists idx_user_profiles_org_id on public.user_profiles using btree (organization_id) TABLESPACE pg_default;

create trigger trg_ensure_membership_on_profile_insert
after INSERT on user_profiles for EACH row
execute FUNCTION ensure_membership_on_profile_write ();

create trigger trg_ensure_membership_on_profile_update
after
update OF organization_id,
role on user_profiles for EACH row
execute FUNCTION ensure_membership_on_profile_write ();

create trigger trg_set_tenant_org_from_creator BEFORE INSERT on user_profiles for EACH row when (
  new.role = 'tenant'::text
  and new.organization_id is null
)
execute FUNCTION set_tenant_org_from_creator ();





create view public.v_technicians_with_professions as
select
  t.id,
  t.organization_id,
  t.full_name,
  t.phone,
  t.email,
  t.company,
  t.is_active,
  t.notes,
  t.created_at,
  t.updated_at,
  COALESCE(
    jsonb_agg(
      distinct jsonb_build_object('id', p.id, 'name', p.name)
    ) filter (
      where
        p.id is not null
    ),
    '[]'::jsonb
  ) as professions
from
  technicians t
  left join technician_profession_map m on m.technician_id = t.id
  and m.organization_id = t.organization_id
  left join technician_professions p on p.id = m.profession_id
  and p.organization_id = t.organization_id
group by
  t.id;







create view public.vw_lease_arrears as
select
  i.organization_id,
  i.lease_id,
  l.tenant_user_id,
  l.unit_id,
  sum(
    GREATEST(
      i.amount - COALESCE(i.total_paid, 0::numeric),
      0::numeric
    )
  ) as arrears_amount,
  count(*) filter (
    where
      GREATEST(
        i.amount - COALESCE(i.total_paid, 0::numeric),
        0::numeric
      ) > 0::numeric
  ) as open_invoices_count,
  min(i.due_date) filter (
    where
      GREATEST(
        i.amount - COALESCE(i.total_paid, 0::numeric),
        0::numeric
      ) > 0::numeric
  ) as oldest_due_date
from
  invoices i
  join leases l on l.id = i.lease_id
  and l.organization_id = i.organization_id
where
  i.status_text <> 'void'::text
  and i.invoice_type = 'rent'::text
  and i.due_date <= (now() AT TIME ZONE 'utc'::text)::date
  and GREATEST(
    i.amount - COALESCE(i.total_paid, 0::numeric),
    0::numeric
  ) > 0::numeric
group by
  i.organization_id,
  i.lease_id,
  l.tenant_user_id,
  l.unit_id;






create view public.vw_lease_arrears_detail as
select
  a.organization_id,
  a.lease_id,
  a.tenant_user_id,
  up.full_name as tenant_name,
  up.phone_number as tenant_phone,
  a.unit_id,
  u.unit_number,
  a.arrears_amount,
  a.open_invoices_count,
  a.oldest_due_date
from
  vw_lease_arrears a
  left join user_profiles up on up.id = a.tenant_user_id
  left join apartment_units u on u.id = a.unit_id;






create view public.vw_lease_prepayment_status as
select
  l.organization_id,
  l.id as lease_id,
  l.tenant_user_id,
  up.full_name as tenant_name,
  up.phone_number as tenant_phone,
  l.unit_id,
  u.unit_number,
  l.rent_paid_until,
  l.next_rent_due_date,
  date_trunc(
    'month'::text,
    (now() AT TIME ZONE 'utc'::text)::date::timestamp with time zone
  )::date as current_month_start,
  case
    when l.rent_paid_until is null then false
    when l.rent_paid_until >= date_trunc(
      'month'::text,
      (now() AT TIME ZONE 'utc'::text)::date::timestamp with time zone
    )::date then true
    else false
  end as is_prepaid
from
  leases l
  left join user_profiles up on up.id = l.tenant_user_id
  left join apartment_units u on u.id = l.unit_id
where
  l.status = 'active'::text;





create view public.vw_manager_statement_summary as
select
  d.organization_id,
  d.tenant_user_id,
  d.tenant_name,
  d.tenant_phone,
  d.lease_id,
  d.unit_id,
  d.unit_number,
  b.id as building_id,
  b.name as building_name,
  b.location as building_location,
  d.arrears_amount as current_balance,
  d.open_invoices_count,
  d.oldest_due_date,
  lp.last_payment_date
from
  vw_lease_arrears_detail d
  join apartment_units u on u.id = d.unit_id
  and u.organization_id = d.organization_id
  join apartment_buildings b on b.id = u.building_id
  and b.organization_id = d.organization_id
  left join lateral (
    select
      max(p.payment_date)::date as last_payment_date
    from
      payments p
      join invoices i on i.id = p.invoice_id
      and i.organization_id = p.organization_id
    where
      p.organization_id = d.organization_id
      and i.lease_id = d.lease_id
      and p.verified is true
  ) lp on true;






create view public.vw_tenant_arrears as
select
  organization_id,
  tenant_user_id,
  sum(arrears_amount) as arrears_amount,
  sum(open_invoices_count) as open_invoices_count,
  min(oldest_due_date) as oldest_due_date
from
  vw_lease_arrears v
group by
  organization_id,
  tenant_user_id;





create view public.vw_tenant_statement_ledger as
with
  invoice_rows as (
    select
      i.organization_id,
      l.tenant_user_id,
      l.id as lease_id,
      l.unit_id,
      u.building_id,
      i.id as source_id,
      'invoice'::text as entry_type,
      COALESCE(i.period_start, i.due_date) as entry_date,
      i.due_date,
      i.invoice_type,
      COALESCE(
        i.description,
        initcap(i.invoice_type) || ' invoice'::text
      ) as description,
      i.amount as debit,
      0::numeric as credit,
      i.status_text,
      i.created_at
    from
      invoices i
      join leases l on l.id = i.lease_id
      and l.organization_id = i.organization_id
      join apartment_units u on u.id = l.unit_id
      and u.organization_id = l.organization_id
    where
      COALESCE(i.status_text, 'unpaid'::text) <> 'void'::text
  ),
  payment_rows as (
    select
      p.organization_id,
      p.tenant_user_id,
      i.lease_id,
      l.unit_id,
      u.building_id,
      p.id as source_id,
      'payment'::text as entry_type,
      (p.payment_date AT TIME ZONE 'utc'::text)::date as entry_date,
      i.due_date,
      i.invoice_type,
      (
        'Payment - '::text || COALESCE(p.payment_method, ''::text)
      ) || COALESCE(' '::text || p.mpesa_receipt_number, ''::text) as description,
      0::numeric as debit,
      p.amount_paid as credit,
      case
        when p.verified then 'verified'::text
        else 'unverified'::text
      end as status_text,
      p.created_at
    from
      payments p
      join invoices i on i.id = p.invoice_id
      and i.organization_id = p.organization_id
      join leases l on l.id = i.lease_id
      and l.organization_id = i.organization_id
      join apartment_units u on u.id = l.unit_id
      and u.organization_id = l.organization_id
  )
select
  invoice_rows.organization_id,
  invoice_rows.tenant_user_id,
  invoice_rows.lease_id,
  invoice_rows.unit_id,
  invoice_rows.building_id,
  invoice_rows.source_id,
  invoice_rows.entry_type,
  invoice_rows.entry_date,
  invoice_rows.due_date,
  invoice_rows.invoice_type,
  invoice_rows.description,
  invoice_rows.debit,
  invoice_rows.credit,
  invoice_rows.status_text,
  invoice_rows.created_at
from
  invoice_rows
union all
select
  payment_rows.organization_id,
  payment_rows.tenant_user_id,
  payment_rows.lease_id,
  payment_rows.unit_id,
  payment_rows.building_id,
  payment_rows.source_id,
  payment_rows.entry_type,
  payment_rows.entry_date,
  payment_rows.due_date,
  payment_rows.invoice_type,
  payment_rows.description,
  payment_rows.debit,
  payment_rows.credit,
  payment_rows.status_text,
  payment_rows.created_at
from
  payment_rows;






create view public.vw_unit_financial_performance_yearly as
select
  COALESCE(c.organization_id, m.organization_id) as organization_id,
  COALESCE(c.unit_id, m.unit_id) as unit_id,
  COALESCE(c.property_id, m.property_id) as property_id,
  COALESCE(c.year, m.year) as year,
  COALESCE(c.rent_collected, 0::numeric)::numeric(12, 2) as rent_collected,
  COALESCE(m.maintenance_spend, 0::numeric)::numeric(12, 2) as maintenance_spend,
  (
    COALESCE(c.rent_collected, 0::numeric) - COALESCE(m.maintenance_spend, 0::numeric)
  )::numeric(12, 2) as net_income,
  case
    when COALESCE(c.rent_collected, 0::numeric) > 0::numeric then (
      COALESCE(m.maintenance_spend, 0::numeric) / COALESCE(c.rent_collected, 0::numeric)
    )::numeric(12, 6)
    else null::numeric
  end as maintenance_to_collections_ratio
from
  vw_unit_rent_collected_yearly c
  full join vw_unit_maintenance_spend_yearly m on m.organization_id = c.organization_id
  and m.unit_id = c.unit_id
  and m.property_id = c.property_id
  and m.year = c.year;






create view public.vw_unit_financial_performance_yearly_enriched as
select
  v.organization_id,
  v.property_id,
  b.name as property_name,
  v.unit_id,
  u.unit_number,
  v.year,
  v.rent_collected,
  v.maintenance_spend,
  v.net_income,
  v.maintenance_to_collections_ratio
from
  vw_unit_financial_performance_yearly v
  join apartment_units u on u.id = v.unit_id
  and u.organization_id = v.organization_id
  join apartment_buildings b on b.id = v.property_id
  and b.organization_id = v.organization_id;





create view public.vw_unit_maintenance_spend_yearly as
select
  mr.organization_id,
  mr.unit_id,
  au.building_id as property_id,
  date_part('year'::text, mr.created_at)::integer as year,
  sum(mr.maintenance_cost) as maintenance_spend
from
  maintenance_requests mr
  join apartment_units au on au.id = mr.unit_id
  and au.organization_id = mr.organization_id
where
  mr.maintenance_cost_paid_by = 'landlord'::text
  and mr.maintenance_cost > 0::numeric
group by
  mr.organization_id,
  mr.unit_id,
  au.building_id,
  (date_part('year'::text, mr.created_at));





create view public.vw_unit_rent_collected_yearly as
select
  l.organization_id,
  l.unit_id,
  au.building_id as property_id,
  date_part('year'::text, p.payment_date)::integer as year,
  sum(p.amount_paid) as rent_collected
from
  payments p
  join invoices i on i.id = p.invoice_id
  and i.organization_id = p.organization_id
  join leases l on l.id = i.lease_id
  and l.organization_id = i.organization_id
  join apartment_units au on au.id = l.unit_id
  and au.organization_id = l.organization_id
where
  p.verified = true
  and i.invoice_type = 'rent'::text
group by
  l.organization_id,
  l.unit_id,
  au.building_id,
  (date_part('year'::text, p.payment_date)::integer);






create view public.vw_unit_rent_coverage_months_yearly as
select
  l.organization_id,
  l.unit_id,
  au.building_id as property_id,
  date_part('year'::text, p.payment_date)::integer as year,
  sum(COALESCE(p.months_paid, 1))::integer as months_covered
from
  payments p
  join invoices i on i.id = p.invoice_id
  and i.organization_id = p.organization_id
  join leases l on l.id = i.lease_id
  and l.organization_id = i.organization_id
  join apartment_units au on au.id = l.unit_id
  and au.organization_id = l.organization_id
where
  p.verified = true
  and i.invoice_type = 'rent'::text
group by
  l.organization_id,
  l.unit_id,
  au.building_id,
  (date_part('year'::text, p.payment_date)::integer);







create table public.water_bills (
  id uuid not null default gen_random_uuid (),
  unit_id uuid not null,
  billing_month date not null,
  meter_reading_start numeric(10, 2) null,
  meter_reading_end numeric(10, 2) null,
  units_consumed numeric(10, 2) null,
  amount numeric(12, 2) not null,
  status text null,
  added_to_invoice_id uuid null,
  added_by uuid null,
  added_at timestamp with time zone null,
  is_estimated boolean null default false,
  notes text null,
  created_at timestamp with time zone null default CURRENT_TIMESTAMP,
  organization_id uuid not null,
  constraint water_bills_pkey primary key (id),
  constraint water_bills_unit_id_billing_month_key unique (unit_id, billing_month),
  constraint water_bills_added_to_invoice_id_fkey foreign KEY (added_to_invoice_id) references invoices (id),
  constraint water_bills_org_fk foreign KEY (organization_id) references organizations (id) on delete CASCADE,
  constraint water_bills_added_by_fkey foreign KEY (added_by) references auth.users (id),
  constraint water_bills_unit_org_fk foreign KEY (unit_id, organization_id) references apartment_units (id, organization_id) on delete CASCADE,
  constraint water_bills_status_check check (
    (
      status = any (
        array[
          'pending'::text,
          'added_to_invoice'::text,
          'invoiced_separately'::text
        ]
      )
    )
  )
) TABLESPACE pg_default;

create index IF not exists idx_water_bills_unit_id on public.water_bills using btree (unit_id) TABLESPACE pg_default;

create index IF not exists idx_water_bills_billing_month on public.water_bills using btree (billing_month) TABLESPACE pg_default;

create index IF not exists idx_water_bills_status on public.water_bills using btree (status) TABLESPACE pg_default;

create index IF not exists idx_water_bills_org_id on public.water_bills using btree (organization_id) TABLESPACE pg_default;