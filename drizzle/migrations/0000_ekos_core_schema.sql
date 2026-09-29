-- ========== ROLES ==========
create type public.app_role as enum ('rep','director');

create table public.profiles (
  id uuid primary key,
  email text not null,
  full_name text not null default '',
  created_at timestamptz not null default now()
);
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  role public.app_role not null,
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create or replace function public.is_director()
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role(auth.uid(), 'director')
$$;

create policy "own profile read" on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_director());
create policy "own profile write" on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_director());
create policy "own profile insert" on public.profiles for insert to authenticated
  with check (id = auth.uid());
create policy "roles read" on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.is_director());

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name',''))
  on conflict (id) do nothing;
  insert into public.user_roles (user_id, role)
  values (new.id, case when lower(new.email) = 'sadie@ekosgroup.co.uk' then 'director'::public.app_role else 'rep'::public.app_role end)
  on conflict do nothing;
  return new;
end; $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ========== SETTINGS ==========
create table public.app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
grant select on public.app_settings to authenticated;
grant all on public.app_settings to service_role;
alter table public.app_settings enable row level security;
create policy "settings read" on public.app_settings for select to authenticated using (true);
create policy "settings write" on public.app_settings for all to authenticated
  using (public.is_director()) with check (public.is_director());

create table public.parks (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order int not null default 0,
  address text default '',
  inbox_email text default '',
  brochure_url text default '',
  site_licence_url text default '',
  park_rules_url text default '',
  active boolean not null default true
);
grant select on public.parks to authenticated;
grant all on public.parks to service_role;
alter table public.parks enable row level security;
create policy "parks read" on public.parks for select to authenticated using (true);
create policy "parks write" on public.parks for all to authenticated
  using (public.is_director()) with check (public.is_director());

create table public.sales_people (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order int not null default 0,
  active boolean not null default true
);
grant select on public.sales_people to authenticated;
grant all on public.sales_people to service_role;
alter table public.sales_people enable row level security;
create policy "sp read" on public.sales_people for select to authenticated using (true);
create policy "sp write" on public.sales_people for all to authenticated
  using (public.is_director()) with check (public.is_director());

-- ========== SALES ==========
create sequence public.order_number_seq start 1;

create table public.sales (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  park_name text not null default '',
  customer_name text not null default '',
  customer_email text not null default '',
  customer_phone text not null default '',
  sales_person text not null default '',
  deposit_date date,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update on public.sales to authenticated;
grant all on public.sales to service_role;
alter table public.sales enable row level security;
create policy "sales read" on public.sales for select to authenticated
  using (created_by = auth.uid() or public.is_director());
create policy "sales insert" on public.sales for insert to authenticated
  with check (created_by = auth.uid());
create policy "sales update" on public.sales for update to authenticated
  using (created_by = auth.uid() or public.is_director());

create or replace function public.set_order_number()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.order_number is null or new.order_number = '' then
    new.order_number := 'EKOS-' || lpad(nextval('public.order_number_seq')::text, 5, '0');
  end if;
  return new;
end; $$;
create trigger sales_order_number before insert on public.sales
  for each row execute function public.set_order_number();

-- ========== SUBMISSIONS ==========
create table public.form_submissions (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  form_type text not null,
  order_number text not null default '',
  data jsonb not null default '{}'::jsonb,
  status text not null default 'Draft',
  is_draft boolean not null default true,
  pdf_path text,
  drive_file_id text,
  disapproval_note text,
  customer_signed_at timestamptz,
  submitted_at timestamptz,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.form_submissions (sale_id);
grant select, insert, update on public.form_submissions to authenticated;
grant all on public.form_submissions to service_role;
alter table public.form_submissions enable row level security;
create policy "subs read" on public.form_submissions for select to authenticated
  using (created_by = auth.uid() or public.is_director());
create policy "subs insert" on public.form_submissions for insert to authenticated
  with check (created_by = auth.uid());
create policy "subs update" on public.form_submissions for update to authenticated
  using (created_by = auth.uid() or public.is_director());

create table public.submission_files (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.form_submissions(id) on delete cascade,
  field_key text not null,
  file_name text not null,
  mime_type text not null default '',
  storage_path text not null,
  created_at timestamptz not null default now()
);
create index on public.submission_files (submission_id);
grant select, insert, delete on public.submission_files to authenticated;
grant all on public.submission_files to service_role;
alter table public.submission_files enable row level security;
create policy "files read" on public.submission_files for select to authenticated
  using (exists (select 1 from public.form_submissions s where s.id = submission_id and (s.created_by = auth.uid() or public.is_director())));
create policy "files write" on public.submission_files for all to authenticated
  using (exists (select 1 from public.form_submissions s where s.id = submission_id and (s.created_by = auth.uid() or public.is_director())))
  with check (exists (select 1 from public.form_submissions s where s.id = submission_id and (s.created_by = auth.uid() or public.is_director())));

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid references public.form_submissions(id) on delete cascade,
  actor_id uuid,
  actor_label text not null default '',
  action text not null,
  from_status text,
  to_status text,
  note text,
  created_at timestamptz not null default now()
);
create index on public.audit_log (submission_id);
grant select, insert on public.audit_log to authenticated;
grant all on public.audit_log to service_role;
alter table public.audit_log enable row level security;
create policy "audit read" on public.audit_log for select to authenticated
  using (exists (select 1 from public.form_submissions s where s.id = submission_id and (s.created_by = auth.uid() or public.is_director())));
create policy "audit insert" on public.audit_log for insert to authenticated with check (true);

create table public.signing_tokens (
  token text primary key,
  submission_id uuid not null references public.form_submissions(id) on delete cascade,
  kind text not null default 'customer_offsite',
  expires_at timestamptz not null default (now() + interval '90 days'),
  used_at timestamptz,
  created_at timestamptz not null default now()
);
grant select on public.signing_tokens to authenticated;
grant all on public.signing_tokens to service_role;
alter table public.signing_tokens enable row level security;
create policy "tokens read" on public.signing_tokens for select to authenticated
  using (exists (select 1 from public.form_submissions s where s.id = submission_id and (s.created_by = auth.uid() or public.is_director())));

create table public.email_log (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid references public.form_submissions(id) on delete set null,
  to_addresses text[] not null default '{}',
  from_address text not null default 'sales@ekosgroup.co.uk',
  subject text not null default '',
  template text not null default '',
  status text not null default 'sent',
  error text,
  created_at timestamptz not null default now()
);
grant select on public.email_log to authenticated;
grant all on public.email_log to service_role;
alter table public.email_log enable row level security;
create policy "email log read" on public.email_log for select to authenticated using (public.is_director());

-- ========== SEED ==========
insert into public.parks (name, sort_order) values
  ('Carlton Manor',1),('Castle View',2),('Coastal Retreat',3),('Dales View',4),
  ('Harvey''s Nurseries',5),('Haveringland Hall',6),('Merry Hill',7),('Outhill View',8),
  ('Sun Valley',9),('Walworth Retreat',10);

insert into public.sales_people (name, sort_order) values
  ('Ben Cook',1),('Alison Dallimer',2),('Sadie Deveraux',3),('Melanie Davidson',4),
  ('Jenna Fowler',5),('Chris Harris',6),('Claire McCulloch',7),('Jackie Hilditch',8),
  ('Bryan Marquis',9),('Lisa Buchan',10),('Cheryl Smith',11),('Charlotte Simnett',12),
  ('Angela Dobbs',13);

insert into public.app_settings (key, value) values
  ('notifications', '{"sales_email":"sales@ekosgroup.co.uk","director_email":"sadie@ekosgroup.co.uk","construction_email":""}'::jsonb),
  ('links', '{"written_statement_draft":"https://ekosgroup.co.uk/wp-content/uploads/2026/07/Your-Written-Statement-Draft-1.pdf","mobile_homes_act":"https://www.gov.uk/government/publications/park-homes-know-your-rights/park-homes-know-your-rights","terms_conditions":"https://ekosgroup.co.uk/wp-content/uploads/2026/05/EKOS-Group-Master-Terms-Conditions-1.pdf"}'::jsonb),
  ('director_signature', '{"name":"Sadie Deveraux","title":"Director – authorised signatory of EKOS Group","image_path":""}'::jsonb),
  ('google_drive', '{"folder_id":"1Q4nN9KEZigJadDPT5F28sr2xE_CVIMSu"}'::jsonb);
