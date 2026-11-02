-- 7. Growth Experiment Board ------------------------------------------------------
-- Run this once in Supabase: SQL Editor > paste > Run. Safe to run again.
-- One board per student (or per team, when one team member logs in).
-- Students see and save only their own board. The teacher can read every board.
-- Boards are deleted with the student account (on delete cascade), so
-- "Delete all student data" in the teacher view also removes them.

create table if not exists public.growth_boards (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  data        jsonb not null default '{}'::jsonb,
  summary     jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);
alter table public.growth_boards enable row level security;

drop policy if exists "see own board, teacher sees all" on public.growth_boards;
create policy "see own board, teacher sees all" on public.growth_boards
  for select using (user_id = auth.uid() or public.is_teacher());

drop policy if exists "create own board" on public.growth_boards;
create policy "create own board" on public.growth_boards
  for insert with check (user_id = auth.uid());

drop policy if exists "save own board" on public.growth_boards;
create policy "save own board" on public.growth_boards
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
