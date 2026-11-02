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

-- 5. Values Gap Finder -----------------------------------------------------------
-- Answers are private to the student. The teacher only sees whether they started and finished.

create table if not exists public.values_results (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  data         jsonb not null default '{}'::jsonb,
  consent_at   timestamptz,
  completed_at timestamptz,
  updated_at   timestamptz not null default now()
);
alter table public.values_results enable row level security;

drop policy if exists "own values only" on public.values_results;
create policy "own values only" on public.values_results
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- The teacher progress function values_status() is defined in section 6.

-- 6. Purpose Finder: strengths feedback from other people --------------------------
-- A student creates one private link. People with the link can leave feedback without an account.
-- Only the student reads the feedback. The teacher sees only counts.

create table if not exists public.strength_requests (
  token      uuid primary key default gen_random_uuid(),
  user_id    uuid not null unique references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table if not exists public.strength_feedback (
  id          bigserial primary key,
  token       uuid not null references public.strength_requests(token) on delete cascade,
  rater_name  text not null default '',
  relation    text not null default '',
  ratings     jsonb not null default '{}'::jsonb,
  best_moment text not null default '',
  created_at  timestamptz not null default now()
);
alter table public.strength_requests enable row level security;
alter table public.strength_feedback enable row level security;

drop policy if exists "own request" on public.strength_requests;
create policy "own request" on public.strength_requests
  for select using (user_id = auth.uid());
drop policy if exists "create own request" on public.strength_requests;
create policy "create own request" on public.strength_requests
  for insert with check (user_id = auth.uid());
drop policy if exists "read own feedback" on public.strength_feedback;
create policy "read own feedback" on public.strength_feedback
  for select using (exists (select 1 from public.strength_requests r where r.token = strength_feedback.token and r.user_id = auth.uid()));

-- Anyone with the link: the student's first name, nothing else.
create or replace function public.strength_request_info(t uuid)
returns text
language sql stable security definer set search_path = public
as $$
  select split_part(coalesce(p.name, ''), ' ', 1)
  from public.strength_requests r join public.profiles p on p.id = r.user_id
  where r.token = t;
$$;
revoke all on function public.strength_request_info(uuid) from public;
grant execute on function public.strength_request_info(uuid) to anon, authenticated;

-- Anyone with the link: leave feedback. At most 12 responses per link.
create or replace function public.submit_strength_feedback(t uuid, rater text, rel text, ratings jsonb, best text)
returns boolean
language plpgsql security definer set search_path = public
as $$
begin
  if not exists (select 1 from public.strength_requests where token = t) then
    raise exception 'UNKNOWN_LINK';
  end if;
  if (select count(*) from public.strength_feedback where token = t) >= 12 then
    raise exception 'TOO_MANY';
  end if;
  if jsonb_typeof(ratings) <> 'object' or (select count(*) from jsonb_object_keys(ratings)) > 30 then
    raise exception 'BAD_RATINGS';
  end if;
  insert into public.strength_feedback (token, rater_name, relation, ratings, best_moment)
  values (t, left(coalesce(rater, ''), 60), left(coalesce(rel, ''), 40), ratings, left(coalesce(best, ''), 1200));
  return true;
end;
$$;
revoke all on function public.submit_strength_feedback(uuid, text, text, jsonb, text) from public;
grant execute on function public.submit_strength_feedback(uuid, text, text, jsonb, text) to anon, authenticated;

-- Teacher only: progress per part. Never the answers themselves.
drop function if exists public.values_status();
create function public.values_status()
returns table (user_id uuid, started_at timestamptz, completed_at timestamptz, updated_at timestamptz,
               strengths_rated integer, feedback_count integer, interests_with_market integer, sweet_spot_chosen boolean)
language sql stable security definer set search_path = public
as $$
  select v.user_id, v.consent_at, v.completed_at, v.updated_at,
    (select count(*)::int from jsonb_object_keys(case when jsonb_typeof(v.data->'p'->'self') = 'object' then v.data->'p'->'self' else '{}'::jsonb end)),
    (select count(*)::int from public.strength_feedback f join public.strength_requests r on r.token = f.token where r.user_id = v.user_id),
    (select count(*)::int from jsonb_array_elements(case when jsonb_typeof(v.data->'p'->'interests') = 'array' then v.data->'p'->'interests' else '[]'::jsonb end) i
       where coalesce(i->>'who', '') <> '' and coalesce(i->>'price', '') <> ''),
    coalesce(v.data->'p'->>'pick', '') <> ''
  from public.values_results v
  where public.is_teacher();
$$;
revoke all on function public.values_status() from public, anon;
grant execute on function public.values_status() to authenticated;

-- 7. Check-in: attendance by rotating QR code -----------------------------------
-- The teacher opens a session for one class and projects a QR code that changes every 15 seconds.
-- A student scans it, logs in, and is marked present. A photo of the QR sent to a friend stops
-- working within about 30 seconds. Students can never read the session secret or anyone else's rows.

create table if not exists public.attendance_sessions (
  id          uuid primary key default gen_random_uuid(),
  class_code  text not null references public.classes(code) on update cascade on delete cascade,
  label       text not null default '',
  secret      text not null default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  opened_at   timestamptz not null default now(),
  closed_at   timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists attendance_sessions_class on public.attendance_sessions (class_code, opened_at desc);

create table if not exists public.attendance (
  session_id  uuid not null references public.attendance_sessions(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  checked_at  timestamptz not null default now(),
  method      text not null default 'qr' check (method in ('qr', 'teacher')),
  device      text not null default '',
  primary key (session_id, user_id)
);

alter table public.attendance_sessions enable row level security;
alter table public.attendance          enable row level security;

drop policy if exists "teacher manages sessions" on public.attendance_sessions;
create policy "teacher manages sessions" on public.attendance_sessions
  for all using (public.is_teacher()) with check (public.is_teacher());

drop policy if exists "teacher manages attendance" on public.attendance;
create policy "teacher manages attendance" on public.attendance
  for all using (public.is_teacher()) with check (public.is_teacher());

drop policy if exists "see own attendance" on public.attendance;
create policy "see own attendance" on public.attendance
  for select using (user_id = auth.uid());

-- A session counts as open until the teacher closes it, and never longer than 3 hours.
create or replace function public.checkin_is_open(s public.attendance_sessions)
returns boolean language sql stable as $$
  select s.closed_at is null and s.opened_at > now() - interval '3 hours';
$$;

-- 15-second windows. The QR shows a short token for the current window.
create or replace function public.checkin_window()
returns bigint language sql volatile as $$
  select floor(extract(epoch from clock_timestamp()) / 15)::bigint;
$$;

create or replace function public.checkin_token(secret text, w bigint)
returns text language sql immutable as $$
  select substr(md5(secret || ':qr:' || w::text), 1, 10);
$$;

create or replace function public.checkin_ticket_for(secret text, w bigint)
returns text language sql immutable as $$
  select md5(secret || ':ticket:' || w::text);
$$;

revoke all on function public.checkin_token(text, bigint) from public, anon, authenticated;
revoke all on function public.checkin_ticket_for(text, bigint) from public, anon, authenticated;

-- Teacher only: the token to put in the QR right now, and how long it stays.
create or replace function public.checkin_current_token(sid uuid)
returns table (token text, seconds_left integer)
language plpgsql security definer set search_path = public
as $$
declare s public.attendance_sessions; w bigint := public.checkin_window();
begin
  if not public.is_teacher() then raise exception 'NOT_ALLOWED'; end if;
  select * into s from public.attendance_sessions where id = sid;
  if s.id is null or not public.checkin_is_open(s) then raise exception 'SESSION_CLOSED'; end if;
  return query select public.checkin_token(s.secret, w),
    greatest(1, ((w + 1) * 15 - extract(epoch from clock_timestamp()))::int);
end;
$$;
revoke all on function public.checkin_current_token(uuid) from public, anon;
grant execute on function public.checkin_current_token(uuid) to authenticated;

-- Anyone who scans: swaps a fresh QR token for a ticket that stays valid for 10 minutes,
-- so a student who still has to log in or sign up does not lose the scan.
create or replace function public.checkin_scan(sid uuid, tok text)
returns table (w bigint, ticket text, label text)
language plpgsql security definer set search_path = public
as $$
declare s public.attendance_sessions; now_w bigint := public.checkin_window(); i int;
begin
  select * into s from public.attendance_sessions where id = sid;
  if s.id is null or not public.checkin_is_open(s) then raise exception 'SESSION_CLOSED'; end if;
  for i in 0..1 loop  -- the current window, or the one just before it
    if public.checkin_token(s.secret, now_w - i) = lower(coalesce(tok, '')) then
      return query select now_w - i, public.checkin_ticket_for(s.secret, now_w - i), s.label;
      return;
    end if;
  end loop;
  raise exception 'QR_EXPIRED';
end;
$$;
revoke all on function public.checkin_scan(uuid, text) from public;
grant execute on function public.checkin_scan(uuid, text) to anon, authenticated;

-- Logged-in student: check in with the ticket. Only for students of that class.
create or replace function public.check_in(sid uuid, w bigint, ticket text, device text)
returns timestamptz
language plpgsql security definer set search_path = public
as $$
declare s public.attendance_sessions; p public.profiles; t timestamptz;
begin
  if auth.uid() is null then raise exception 'NOT_LOGGED_IN'; end if;
  select * into s from public.attendance_sessions where id = sid;
  if s.id is null or not public.checkin_is_open(s) then raise exception 'SESSION_CLOSED'; end if;
  if w is null or w > public.checkin_window() or w < public.checkin_window() - 40
     or coalesce(ticket, '') <> public.checkin_ticket_for(s.secret, w) then
    raise exception 'QR_EXPIRED';
  end if;
  select * into p from public.profiles where id = auth.uid();
  if p.id is null then raise exception 'NO_PROFILE'; end if;
  if p.role <> 'teacher' and coalesce(p.class_code, '') <> s.class_code then raise exception 'WRONG_CLASS'; end if;
  insert into public.attendance (session_id, user_id, method, device)
  values (sid, auth.uid(), 'qr', left(coalesce(device, ''), 40))
  on conflict (session_id, user_id) do nothing;
  select checked_at into t from public.attendance where session_id = sid and user_id = auth.uid();
  return t;
end;
$$;
revoke all on function public.check_in(uuid, bigint, text, text) from public, anon;
grant execute on function public.check_in(uuid, bigint, text, text) to authenticated;
