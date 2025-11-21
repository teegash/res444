create table public.user_profiles (
  id uuid not null,
  full_name text null,
  phone_number text null,
  role text null,
  national_id text null,
  profile_picture_url text null,
  address text null,
  date_of_birth date null,
  created_at timestamp with time zone null default CURRENT_TIMESTAMP,
  updated_at timestamp with time zone null default CURRENT_TIMESTAMP,
  constraint user_profiles_pkey primary key (id),
  constraint user_profiles_national_id_key unique (national_id),
  constraint user_profiles_id_fkey foreign KEY (id) references auth.users (id) on delete CASCADE,
  constraint user_profiles_role_check check (
    role IS NULL OR role = ANY (
      ARRAY['admin'::text, 'manager'::text, 'caretaker'::text, 'tenant'::text]
    )
  )
) TABLESPACE pg_default;

create index IF not exists idx_user_profiles_id on public.user_profiles using btree (id) TABLESPACE pg_default;

create index IF not exists idx_user_profiles_role on public.user_profiles using btree (role) TABLESPACE pg_default;



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
  constraint apartment_buildings_organization_id_fkey foreign KEY (organization_id) references organizations (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists idx_buildings_org_id on public.apartment_buildings using btree (organization_id) TABLESPACE pg_default;


create table public.organization_members (
  id uuid not null default gen_random_uuid (),
  user_id uuid not null,
  organization_id uuid not null,
  role text not null,
  joined_at timestamp with time zone null default CURRENT_TIMESTAMP,
  constraint organization_members_pkey primary key (id),
  constraint organization_members_user_id_organization_id_key unique (user_id, organization_id),
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
  constraint water_bills_pkey primary key (id),
  constraint water_bills_unit_id_billing_month_key unique (unit_id, billing_month),
  constraint water_bills_added_by_fkey foreign KEY (added_by) references auth.users (id),
  constraint water_bills_added_to_invoice_id_fkey foreign KEY (added_to_invoice_id) references invoices (id),
  constraint water_bills_unit_id_fkey foreign KEY (unit_id) references apartment_units (id) on delete CASCADE,
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
  constraint reminders_pkey primary key (id),
  constraint reminders_user_id_fkey foreign KEY (user_id) references auth.users (id) on delete CASCADE,
  constraint reminders_delivery_status_check check (
    (
      delivery_status = any (array['pending'::text, 'sent'::text, 'failed'::text])
    )
  ),
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
  )
) TABLESPACE pg_default;

create index IF not exists idx_reminders_user_id on public.reminders using btree (user_id) TABLESPACE pg_default;

create index IF not exists idx_reminders_scheduled_for on public.reminders using btree (scheduled_for) TABLESPACE pg_default;

create index IF not exists idx_reminders_delivery_status on public.reminders using btree (delivery_status) TABLESPACE pg_default;




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
  months_paid integer null default 1,
  created_at timestamp with time zone null default CURRENT_TIMESTAMP,
  constraint payments_pkey primary key (id),
  constraint payments_invoice_id_fkey foreign KEY (invoice_id) references invoices (id) on delete CASCADE,
  constraint payments_tenant_user_id_fkey foreign KEY (tenant_user_id) references auth.users (id) on delete CASCADE,
  constraint payments_verified_by_fkey foreign KEY (verified_by) references auth.users (id),
  constraint payments_payment_method_check check (
    (
      payment_method = any (
        array[
          'mpesa'::text,
          'bank_transfer'::text,
          'cash'::text,
          'cheque'::text,
          'card'::text
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



  create table public.mpesa_verification_audit (
  id uuid not null default gen_random_uuid (),
  payment_id uuid not null,
  query_timestamp timestamp with time zone null default CURRENT_TIMESTAMP,
  response_code text null,
  result_description text null,
  transaction_status text null,
  daraja_response jsonb null,
  created_at timestamp with time zone null default CURRENT_TIMESTAMP,
  constraint mpesa_verification_audit_pkey primary key (id),
  constraint mpesa_verification_audit_payment_id_fkey foreign KEY (payment_id) references payments (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists idx_audit_payment on public.mpesa_verification_audit using btree (payment_id) TABLESPACE pg_default;

create index IF not exists idx_audit_timestamp on public.mpesa_verification_audit using btree (query_timestamp) TABLESPACE pg_default;




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
  constraint mpesa_settings_pkey primary key (id),
  constraint mpesa_settings_max_retries_check check (
    max_retries >= 1 AND max_retries <= 6
  ),
  constraint mpesa_settings_frequency_check check (
    auto_verify_frequency_seconds >= 15 AND auto_verify_frequency_seconds <= 300
  ),
  constraint mpesa_settings_timeout_check check (
    query_timeout_seconds >= 15 AND query_timeout_seconds <= 120
  )
) TABLESPACE pg_default;


create table public.maintenance_requests (
  id uuid not null default gen_random_uuid (),
  unit_id uuid not null,
  tenant_user_id uuid not null,
  title text not null,
  description text not null,
  priority_level text null,
  status text null,
  assigned_to uuid null,
  assigned_technician_name text null,
  assigned_technician_phone text null,
  attachment_urls text[] null,
  created_at timestamp with time zone null default CURRENT_TIMESTAMP,
  updated_at timestamp with time zone null default CURRENT_TIMESTAMP,
  completed_at timestamp with time zone null,
  constraint maintenance_requests_pkey primary key (id),
  constraint maintenance_requests_assigned_to_fkey foreign KEY (assigned_to) references auth.users (id),
  constraint maintenance_requests_tenant_user_id_fkey foreign KEY (tenant_user_id) references auth.users (id) on delete CASCADE,
  constraint maintenance_requests_unit_id_fkey foreign KEY (unit_id) references apartment_units (id) on delete CASCADE,
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
  rent_paid_until date null,
  created_at timestamp with time zone null default CURRENT_TIMESTAMP,
  updated_at timestamp with time zone null default CURRENT_TIMESTAMP,
  constraint leases_pkey primary key (id),
  constraint leases_tenant_user_id_fkey foreign KEY (tenant_user_id) references auth.users (id) on delete CASCADE,
  constraint leases_unit_id_fkey foreign KEY (unit_id) references apartment_units (id) on delete CASCADE,
  constraint leases_status_check check (
    (
      status = any (array['active'::text, 'ended'::text, 'pending'::text])
    )
  )
) TABLESPACE pg_default;

create index IF not exists idx_leases_status on public.leases using btree (status) TABLESPACE pg_default;

create index IF not exists idx_leases_unit_id on public.leases using btree (unit_id) TABLESPACE pg_default;

create index IF not exists idx_leases_tenant_user_id on public.leases using btree (tenant_user_id) TABLESPACE pg_default;



create table public.invoices (
  id uuid not null default gen_random_uuid (),
  lease_id uuid not null,
  invoice_type text not null,
  amount numeric(12, 2) not null,
  due_date date not null,
  payment_date date null,
  status text null,
  months_covered integer null default 1,
  description text null,
  created_at timestamp with time zone null default CURRENT_TIMESTAMP,
  updated_at timestamp with time zone null default CURRENT_TIMESTAMP,
  constraint invoices_pkey primary key (id),
  constraint invoices_lease_id_fkey foreign KEY (lease_id) references leases (id) on delete CASCADE,
  constraint invoices_invoice_type_check check (
    (
      invoice_type = any (array['rent'::text, 'water'::text])
    )
  ),
  constraint invoices_status_check check (
    (
      status = any (
        array[
          'unpaid'::text,
          'partially_paid'::text,
          'paid'::text,
          'overdue'::text
        ]
      )
    )
  )
) TABLESPACE pg_default;

create index IF not exists idx_invoices_lease_id on public.invoices using btree (lease_id) TABLESPACE pg_default;

create index IF not exists idx_invoices_status on public.invoices using btree (status) TABLESPACE pg_default;

create index IF not exists idx_invoices_due_date on public.invoices using btree (due_date) TABLESPACE pg_default;

create index IF not exists idx_invoices_type on public.invoices using btree (invoice_type) TABLESPACE pg_default;


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
  constraint communications_pkey primary key (id),
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


create table public.bulk_unit_creation_logs (
  id uuid not null default gen_random_uuid (),
  building_id uuid not null,
  bulk_group_id uuid not null,
  created_by uuid not null,
  units_created integer not null,
  units_data jsonb not null,
  created_at timestamp with time zone null default CURRENT_TIMESTAMP,
  constraint bulk_unit_creation_logs_pkey primary key (id),
  constraint bulk_unit_creation_logs_building_id_fkey foreign KEY (building_id) references apartment_buildings (id) on delete CASCADE,
  constraint bulk_unit_creation_logs_created_by_fkey foreign KEY (created_by) references auth.users (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists idx_bulk_building_id on public.bulk_unit_creation_logs using btree (building_id) TABLESPACE pg_default;

create index IF not exists idx_bulk_group_id on public.bulk_unit_creation_logs using btree (bulk_group_id) TABLESPACE pg_default;


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
  constraint apartment_units_pkey primary key (id),
  constraint apartment_units_building_id_unit_number_key unique (building_id, unit_number),
  constraint apartment_units_building_id_fkey foreign KEY (building_id) references apartment_buildings (id) on delete CASCADE,
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
  constraint apartment_buildings_organization_id_fkey foreign KEY (organization_id) references organizations (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists idx_buildings_org_id on public.apartment_buildings using btree (organization_id) TABLESPACE pg_default;
