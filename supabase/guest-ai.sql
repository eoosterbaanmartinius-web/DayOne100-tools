-- DayOne100 Tools · let the Prompt Coach AI check work without logging in
-- Run once in Supabase > SQL Editor. Safe to run again.
-- Guests are counted per network per day with a one-way code (no IP address is stored).

alter table public.ai_usage alter column user_id drop not null;
alter table public.ai_usage add column if not exists guest_key text;
create index if not exists ai_usage_guest_time on public.ai_usage (guest_key, created_at);
create index if not exists ai_usage_guests_today on public.ai_usage (created_at) where user_id is null;
