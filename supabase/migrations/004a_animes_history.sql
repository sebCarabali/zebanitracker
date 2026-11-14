-- ============ Animes: puntuación, reseña, metadatos de AniList, último enlace ============
alter table public.animes
  add column score                 smallint check (score between 1 and 10),
  add column review                text check (char_length(review) <= 5000),
  add column completed_at          timestamptz,
  add column genres                text[] not null default '{}',
  add column studios               text[] not null default '{}',
  add column format                text,
  add column season_year           integer,
  add column mal_id                integer,
  add column last_episode_url      text,
  add column last_notified_episode integer;

-- (El backend vuelve a sincronizar con AniList los animes vinculados que aún no tienen formato/géneros.)

-- completed_at automático
create or replace function public.set_completed_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.status = 'completed' and (tg_op = 'INSERT' or old.status is distinct from 'completed') then
    new.completed_at := now();
  elsif new.status <> 'completed' then
    new.completed_at := null;
  end if;
  return new;
end $$;

create trigger animes_completed_at before insert or update of status on public.animes
for each row execute function public.set_completed_at();

-- ============ Historial de capítulos vistos ============
create table public.watch_events (
  id         bigint generated always as identity primary key,
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  anime_id   uuid not null references public.animes(id) on delete cascade,
  episode    integer not null check (episode > 0),
  watched_at timestamptz not null default now()
);
create index watch_events_user_time_idx on public.watch_events (user_id, watched_at desc);
create index watch_events_anime_idx on public.watch_events (anime_id);

alter table public.watch_events enable row level security;
create policy "watch_events_select_own" on public.watch_events for select using ((select auth.uid()) = user_id);

-- Registra cada capítulo marcado. Saltos de más de 5 (importaciones, ediciones masivas) no se registran
-- para no inflar el historial con capítulos que no se vieron hoy.
create or replace function public.log_watch_events() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  delta integer := new.watched_episodes - old.watched_episodes;
begin
  if delta between 1 and 5 then
    insert into public.watch_events (user_id, anime_id, episode)
    select new.user_id, new.id, g from generate_series(old.watched_episodes + 1, new.watched_episodes) g;
  end if;
  return new;
end $$;

create trigger animes_watch_events after update of watched_episodes on public.animes
for each row execute function public.log_watch_events();

