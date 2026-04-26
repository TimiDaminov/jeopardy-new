create extension if not exists pgcrypto;

create table if not exists public.jeopardy_sessions (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique default 'default',
  session jsonb not null default '{}'::jsonb,
  teams jsonb not null default '[{"id":"team-mercury","name":"РњРµСЂРєСѓСЂРёР№","color":"#B7B7B7","score":0},{"id":"team-mars","name":"РњР°СЂСЃ","color":"#C34A36","score":0},{"id":"team-jupiter","name":"Р®РїРёС‚РµСЂ","color":"#D39C6A","score":0},{"id":"team-saturn","name":"РЎР°С‚СѓСЂРЅ","color":"#D8C37A","score":0},{"id":"team-uranus","name":"РЈСЂР°РЅ","color":"#7AD8E8","score":0},{"id":"team-neptune","name":"РќРµРїС‚СѓРЅ","color":"#426DFF","score":0}]'::jsonb,
  version bigint not null default 0,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint jeopardy_sessions_session_is_object check (jsonb_typeof(session) = 'object'),
  constraint jeopardy_sessions_teams_is_array check (jsonb_typeof(teams) = 'array')
);

alter table public.jeopardy_sessions
alter column teams set default '[{"id":"team-mercury","name":"РњРµСЂРєСѓСЂРёР№","color":"#B7B7B7","score":0},{"id":"team-mars","name":"РњР°СЂСЃ","color":"#C34A36","score":0},{"id":"team-jupiter","name":"Р®РїРёС‚РµСЂ","color":"#D39C6A","score":0},{"id":"team-saturn","name":"РЎР°С‚СѓСЂРЅ","color":"#D8C37A","score":0},{"id":"team-uranus","name":"РЈСЂР°РЅ","color":"#7AD8E8","score":0},{"id":"team-neptune","name":"РќРµРїС‚СѓРЅ","color":"#426DFF","score":0}]'::jsonb;

alter table public.jeopardy_sessions
add column if not exists version bigint not null default 0;

update public.jeopardy_sessions
set version = 0
where version is null;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_jeopardy_sessions_updated_at on public.jeopardy_sessions;

create trigger set_jeopardy_sessions_updated_at
before update on public.jeopardy_sessions
for each row
execute function public.set_updated_at();

alter table public.jeopardy_sessions enable row level security;

drop policy if exists jeopardy_sessions_select_public on public.jeopardy_sessions;
drop policy if exists jeopardy_sessions_insert_public on public.jeopardy_sessions;
drop policy if exists jeopardy_sessions_update_public on public.jeopardy_sessions;

create policy jeopardy_sessions_select_public
on public.jeopardy_sessions
for select
to anon, authenticated
using (true);

create policy jeopardy_sessions_insert_public
on public.jeopardy_sessions
for insert
to anon, authenticated
with check (true);

create policy jeopardy_sessions_update_public
on public.jeopardy_sessions
for update
to anon, authenticated
using (true)
with check (true);

grant usage on schema public to anon, authenticated;
grant select, insert, update on public.jeopardy_sessions to anon, authenticated;

alter table public.jeopardy_sessions replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'jeopardy_sessions'
  ) then
    alter publication supabase_realtime add table public.jeopardy_sessions;
  end if;
end;
$$;

insert into public.jeopardy_sessions (slug, session, teams, version, updated_by)
values (
  'default',
  '{}'::jsonb,
  '[{"id":"team-mercury","name":"РњРµСЂРєСѓСЂРёР№","color":"#B7B7B7","score":0},{"id":"team-mars","name":"РњР°СЂСЃ","color":"#C34A36","score":0},{"id":"team-jupiter","name":"Р®РїРёС‚РµСЂ","color":"#D39C6A","score":0},{"id":"team-saturn","name":"РЎР°С‚СѓСЂРЅ","color":"#D8C37A","score":0},{"id":"team-uranus","name":"РЈСЂР°РЅ","color":"#7AD8E8","score":0},{"id":"team-neptune","name":"РќРµРїС‚СѓРЅ","color":"#426DFF","score":0}]'::jsonb,
  0,
  'sql-seed'
)
on conflict (slug) do update
set teams = excluded.teams,
    version = excluded.version,
    updated_by = excluded.updated_by
where public.jeopardy_sessions.teams = '[]'::jsonb;
