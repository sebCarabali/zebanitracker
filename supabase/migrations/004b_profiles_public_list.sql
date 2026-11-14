-- ============ Perfiles ============
create table public.profiles (
  user_id          uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  username         text unique check (username ~ '^[a-z0-9_]{3,24}$'),
  is_public        boolean not null default false,
  notify_email     boolean not null default false,
  anilist_token    text,
  anilist_user_id  integer,
  anilist_username text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create trigger profiles_updated_at before update on public.profiles
for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
create policy "profiles_select_own" on public.profiles for select using ((select auth.uid()) = user_id);
create policy "profiles_insert_own" on public.profiles for insert with check ((select auth.uid()) = user_id);
create policy "profiles_update_own" on public.profiles for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- ============ Lista pública (solo perfiles con is_public; sin notas, reseñas ni enlaces) ============
create or replace function public.public_list(p_username text) returns json
language sql stable security definer set search_path = '' as $$
  select json_build_object(
    'username', p.username,
    'animes', coalesce((
      select json_agg(json_build_object(
        'title', a.title, 'cover_url', a.cover_url, 'status', a.status,
        'watched_episodes', a.watched_episodes, 'total_episodes', a.total_episodes,
        'is_favorite', a.is_favorite, 'score', a.score, 'anilist_id', a.anilist_id,
        'genres', a.genres, 'format', a.format, 'season_year', a.season_year
      ) order by a.is_favorite desc, a.updated_at desc)
      from public.animes a where a.user_id = p.user_id
    ), '[]'::json)
  )
  from public.profiles p
  where p.username = lower(p_username) and p.is_public
$$;

grant execute on function public.public_list(text) to anon, authenticated;
