-- Anime Tracker: esquema inicial
create type public.anime_status as enum ('watching', 'completed', 'plan_to_watch', 'on_hold', 'dropped');

create table public.animes (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title            text not null check (char_length(title) between 1 and 300),
  total_episodes   integer check (total_episodes is null or total_episodes >= 0),
  watched_episodes integer not null default 0 check (watched_episodes >= 0),
  status           public.anime_status not null default 'watching',
  is_favorite      boolean not null default false,
  cover_url        text,
  source_url       text,
  notes            text,
  last_watched_at  timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint watched_le_total check (total_episodes is null or watched_episodes <= total_episodes)
);

create index animes_user_idx on public.animes (user_id, updated_at desc);
create index animes_user_fav_idx on public.animes (user_id) where is_favorite;

-- updated_at automático
create or replace function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger animes_updated_at before update on public.animes
for each row execute function public.set_updated_at();

-- Row Level Security: cada usuario solo ve/modifica sus animes
alter table public.animes enable row level security;

create policy "animes_select_own" on public.animes for select using ((select auth.uid()) = user_id);
create policy "animes_insert_own" on public.animes for insert with check ((select auth.uid()) = user_id);
create policy "animes_update_own" on public.animes for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "animes_delete_own" on public.animes for delete using ((select auth.uid()) = user_id);
