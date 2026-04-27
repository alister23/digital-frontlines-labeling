-- LabelKit schema v2
-- Run the full file in Supabase SQL Editor. Safe to re-run.

-- ── Core tables ────────────────────────────────────────────────────────────────

create table if not exists tasks (
  id          text primary key,
  name        text not null,
  questions   jsonb not null default '[]'::jsonb,
  created_at  timestamptz default now()
);

create table if not exists datasets (
  task_id            text primary key references tasks(id) on delete cascade,
  datapoints         jsonb not null default '[]'::jsonb,
  images_folder_id   text default '',
  messages_folder_id text default '',
  loaded_by          text default '',
  loaded_at          timestamptz default now()
);

create table if not exists submissions (
  id            uuid primary key default gen_random_uuid(),
  task_id       text references tasks(id) on delete cascade not null,
  user_id       uuid references auth.users(id) on delete set null,
  labeler_name  text not null,
  labels        jsonb not null default '{}'::jsonb,
  submitted_at  timestamptz default now()
);

-- Add user_id to submissions if it was created by the old schema (no-op if already present)
alter table submissions add column if not exists user_id uuid references auth.users(id) on delete set null;

-- ── Auth tables ────────────────────────────────────────────────────────────────

create table if not exists profiles (
  id        uuid primary key references auth.users(id) on delete cascade,
  email     text,
  is_admin  boolean default false
);

create table if not exists progress (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users(id) on delete cascade not null,
  task_id       text references tasks(id) on delete cascade not null,
  labels        jsonb not null default '{}'::jsonb,
  current_index int not null default 0,
  updated_at    timestamptz default now(),
  unique(user_id, task_id)
);

-- ── Trigger: auto-create profile on signup ─────────────────────────────────────
-- ayl27@mit.edu is seeded as admin automatically.

create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email, is_admin)
  values (new.id, new.email, new.email = 'ayl27@mit.edu')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- ── Admin helper function ──────────────────────────────────────────────────────

create or replace function is_admin()
returns boolean language sql security definer stable set search_path = public as $$
  select coalesce((select is_admin from profiles where id = auth.uid()), false);
$$;

-- Backfill: promote ayl27@mit.edu to admin (handles case where trigger ran before fix)
insert into profiles (id, email, is_admin)
select id, email, true from auth.users where email = 'ayl27@mit.edu'
on conflict (id) do update set is_admin = true;

-- ── Row-level security ─────────────────────────────────────────────────────────

alter table tasks       enable row level security;
alter table datasets    enable row level security;
alter table submissions enable row level security;
alter table profiles    enable row level security;
alter table progress    enable row level security;

-- Drop old anon policies if they exist
drop policy if exists "public access" on tasks;
drop policy if exists "public access" on datasets;
drop policy if exists "public access" on submissions;

-- Tasks: all authenticated users read; only admins write
drop policy if exists "tasks read"   on tasks;
drop policy if exists "tasks insert" on tasks;
drop policy if exists "tasks update" on tasks;
drop policy if exists "tasks delete" on tasks;
create policy "tasks read"   on tasks for select to authenticated using (true);
create policy "tasks insert" on tasks for insert to authenticated with check (is_admin());
create policy "tasks update" on tasks for update to authenticated using (is_admin());
create policy "tasks delete" on tasks for delete to authenticated using (is_admin());

-- Datasets: same as tasks
drop policy if exists "datasets read"   on datasets;
drop policy if exists "datasets insert" on datasets;
drop policy if exists "datasets update" on datasets;
drop policy if exists "datasets delete" on datasets;
create policy "datasets read"   on datasets for select to authenticated using (true);
create policy "datasets insert" on datasets for insert to authenticated with check (is_admin());
create policy "datasets update" on datasets for update to authenticated using (is_admin());
create policy "datasets delete" on datasets for delete to authenticated using (is_admin());

-- Submissions: users create/read their own; admins read all
drop policy if exists "submissions insert" on submissions;
drop policy if exists "submissions select" on submissions;
create policy "submissions insert" on submissions
  for insert to authenticated with check (user_id = auth.uid());
create policy "submissions select" on submissions
  for select to authenticated using (user_id = auth.uid() or is_admin());

-- Profiles: each user reads/updates their own
drop policy if exists "profiles select" on profiles;
drop policy if exists "profiles update" on profiles;
create policy "profiles select" on profiles for select to authenticated using (id = auth.uid());
create policy "profiles update" on profiles for update to authenticated using (id = auth.uid());

-- Progress: per-user full access
drop policy if exists "progress all" on progress;
create policy "progress all" on progress for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
