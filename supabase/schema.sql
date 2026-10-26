-- DayOne100 Tools · Idea Check database setup
-- Run this once in Supabase: SQL Editor > New query > paste everything > Run.
-- Safe to run again: it only creates what is missing and refreshes the rules.

-- 1. Tables -----------------------------------------------------------------

-- Class codes students need to sign up. Managed by the teacher.
create table if not exists public.classes (
  code        text primary key,
  name        text not null default '',
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- One row per user. Students cannot change their own role.
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  name        text not null default '',
  email       text not null default '',
  role        text not null default 'student' check (role in ('student', 'teacher')),
  class_code  text references public.classes(code) on update cascade on delete set null,
  created_at  timestamptz not null default now()
);

-- Each student's whole Idea Check workspace, plus a short summary for the teacher view.
create table if not exists public.workspaces (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  data        jsonb not null default '{}'::jsonb,
  summary     jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

-- One row per AI call, used for the daily limit. Only the coach function writes here.
create table if not exists public.ai_usage (
  id          bigserial primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  kind        text not null default 'chat',
  created_at  timestamptz not null default now()
);
create index if not exists ai_usage_user_time on public.ai_usage (user_id, created_at);

-- 2. Helpers ----------------------------------------------------------------

create or replace function public.is_teacher()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'teacher');
$$;

-- Sign-up only works with an active class code. Creates the profile row.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  typed text := upper(trim(coalesce(new.raw_user_meta_data->>'class_code', '')));
  found_code text;
begin
  select code into found_code from public.classes where upper(code) = typed and active limit 1;
  if found_code is null then
    raise exception 'INVALID_CLASS_CODE';
  end if;
  insert into public.profiles (id, name, email, class_code)
  values (new.id, left(coalesce(new.raw_user_meta_data->>'name', ''), 80), coalesce(new.email, ''), found_code);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Teacher only: deletes every student account and all their work. Teachers are kept.
create or replace function public.delete_all_student_data()
returns integer
language plpgsql security definer set search_path = public, auth
as $$
declare n integer;
begin
  if not public.is_teacher() then
    raise exception 'NOT_ALLOWED';
  end if;
  with gone as (
    delete from auth.users u
    where exists (select 1 from public.profiles p where p.id = u.id and p.role = 'student')
    returning 1
  )
  select count(*) into n from gone;
  return n;
end;
$$;
revoke all on function public.delete_all_student_data() from public, anon;
grant execute on function public.delete_all_student_data() to authenticated;

-- 3. Access rules (row level security) -------------------------------------

alter table public.classes    enable row level security;
alter table public.profiles   enable row level security;
alter table public.workspaces enable row level security;
alter table public.ai_usage   enable row level security;  -- no policies: only the coach function can use it

drop policy if exists "teacher manages classes" on public.classes;
create policy "teacher manages classes" on public.classes
  for all using (public.is_teacher()) with check (public.is_teacher());

drop policy if exists "see own profile, teacher sees all" on public.profiles;
create policy "see own profile, teacher sees all" on public.profiles
  for select using (id = auth.uid() or public.is_teacher());

drop policy if exists "update own name" on public.profiles;
create policy "update own name" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid() and role = 'student');

drop policy if exists "see own work, teacher sees all" on public.workspaces;
create policy "see own work, teacher sees all" on public.workspaces
  for select using (user_id = auth.uid() or public.is_teacher());

drop policy if exists "create own work" on public.workspaces;
create policy "create own work" on public.workspaces
  for insert with check (user_id = auth.uid());

drop policy if exists "save own work" on public.workspaces;
create policy "save own work" on public.workspaces
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- A student may only change their own name, never their role or class.
revoke update on public.profiles from authenticated;
grant update (name) on public.profiles to authenticated;

-- 4. First class code ----------------------------------------------------------
-- Use this code to create your own account, then make yourself teacher (see README).
-- Afterwards create real class codes in the teacher view and switch this one off.
insert into public.classes (code, name) values ('PILOT2026', 'Pilot') on conflict do nothing;
