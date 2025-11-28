Leases table

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
  constraint leases_pkey primary key (id),
  constraint leases_tenant_user_id_fkey foreign KEY (tenant_user_id) references auth.users (id) on delete CASCADE,
  constraint leases_unit_id_fkey foreign KEY (unit_id) references apartment_units (id) on delete CASCADE,
  constraint leases_status_check check (
    (
      status = any (
        array['active'::text, 'ended'::text, 'pending'::text]
      )
    )
  )
) TABLESPACE pg_default;

create index IF not exists idx_leases_status on public.leases using btree (status) TABLESPACE pg_default;

create index IF not exists idx_leases_unit_id on public.leases using btree (unit_id) TABLESPACE pg_default;

create index IF not exists idx_leases_tenant_user_id on public.leases using btree (tenant_user_id) TABLESPACE pg_default;

create index IF not exists idx_leases_next_rent_due_date on public.leases using btree (next_rent_due_date) TABLESPACE pg_default;



Invoices table

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
  constraint invoices_pkey primary key (id),
  constraint unique_lease_invoice_month unique (lease_id, invoice_type, due_date),
  constraint invoices_lease_id_fkey foreign KEY (lease_id) references leases (id) on delete CASCADE,
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

create index IF not exists idx_invoices_lease_status_type on public.invoices using btree (lease_id, status, invoice_type) TABLESPACE pg_default;

create index IF not exists idx_invoices_lease_due_date on public.invoices using btree (lease_id, due_date, invoice_type) TABLESPACE pg_default;



Payments table

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



  Apartment units - create table public.apartment_units (
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



Apartment buildings 

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




organizations table

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




user_profile table


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
  constraint user_profiles_pkey primary key (id),
  constraint user_profiles_national_id_key unique (national_id),
  constraint user_profiles_id_fkey foreign KEY (id) references auth.users (id) on delete CASCADE,
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

to add more later