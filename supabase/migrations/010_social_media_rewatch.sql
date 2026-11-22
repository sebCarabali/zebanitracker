-- 010: manga/novelas, "Planeo ver" con prioridad, etiquetas, rewatch, recordatorios de series abandonadas,
-- marcado por rango, amigos, "ver juntos" y caché compartida de IA.

-- ---------- Animes: nuevas columnas ----------
alter table public.animes
  add column media_type             text not null default 'anime' check (media_type in ('anime', 'manga', 'novel')),
  add column total_volumes          integer check (total_volumes is null or total_volumes >= 0),
  add column watched_volumes        integer not null default 0 check (watched_volumes >= 0),
  add column duration               integer check (duration is null or duration between 1 and 1000),
  add column priority               integer,
  add column tags                   text[] not null default '{}' check (cardinality(tags) <= 20),
  add column rewatching             boolean not null default false,
  add column reminder_snoozed_until timestamptz,
  add column last_reminded_at       timestamptz;

create index animes_user_tags_idx on public.animes using gin (tags);
create index animes_user_plan_idx on public.animes (user_id, priority) where status = 'plan_to_watch';

alter table public.profiles
  add column stale_weeks smallint not null default 3 check (stale_weeks between 1 and 52);

-- ---------- Rewatch: cada vez que terminas de nuevo un anime ----------
create table public.rewatches (
  id          bigint generated always as identity primary key,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  anime_id    uuid not null references public.animes(id) on delete cascade,
  finished_at timestamptz not null default now(),
  note        text check (char_length(note) <= 500)
);
create index rewatches_anime_idx on public.rewatches (anime_id);
create index rewatches_user_idx on public.rewatches (user_id);
alter table public.rewatches enable row level security;
create policy "rewatches_select_own" on public.rewatches for select using ((select auth.uid()) = user_id);
create policy "rewatches_insert_own" on public.rewatches for insert
  with check ((select auth.uid()) = user_id and exists (select 1 from public.animes a where a.id = anime_id and a.user_id = (select auth.uid())));
create policy "rewatches_delete_own" on public.rewatches for delete using ((select auth.uid()) = user_id);

-- ---------- Marcado por rango ("vi del 5 al 12") ----------
-- El trigger normal registra hasta 5 capítulos por cambio; el marcado por rango registra los suyos y lo desactiva.
create or replace function public.log_watch_events() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  delta integer := new.watched_episodes - old.watched_episodes;
begin
  if coalesce(current_setting('zt.bulk', true), '') = 'on' then
    return new;
  end if;
  if delta between 1 and 5 then
    insert into public.watch_events (user_id, anime_id, episode)
    select new.user_id, new.id, g from generate_series(old.watched_episodes + 1, new.watched_episodes) g;
  end if;
  return new;
end $$;
revoke execute on function public.log_watch_events() from anon, authenticated, public;

create or replace function public.mark_episode_range(p_anime uuid, p_from integer, p_to integer, p_watched_at timestamptz default now())
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  a public.animes;
  n integer;
begin
  select * into a from public.animes where id = p_anime and user_id = (select auth.uid()) for update;
  if not found then raise exception 'Anime no encontrado' using errcode = 'P0002'; end if;
  if p_from < 1 or p_to < p_from or p_to - p_from >= 2000 then
    raise exception 'Rango inválido' using errcode = '22023';
  end if;
  if a.total_episodes is not null and p_to > a.total_episodes then
    raise exception 'El anime tiene % capítulos', a.total_episodes using errcode = '22023';
  end if;
  if p_watched_at > now() + interval '1 hour' then p_watched_at := now(); end if;

  perform set_config('zt.bulk', 'on', true);
  update public.animes set
    watched_episodes = greatest(watched_episodes, p_to),
    last_watched_at  = greatest(coalesce(last_watched_at, p_watched_at), p_watched_at),
    status = case
      when a.total_episodes is not null and a.total_episodes > 0 and greatest(watched_episodes, p_to) = a.total_episodes then 'completed'::public.anime_status
      when status in ('plan_to_watch', 'completed') then 'watching'::public.anime_status
      else status end
  where id = p_anime;
  perform set_config('zt.bulk', 'off', true);

  -- Un minuto entre capítulos para que el historial conserve el orden
  insert into public.watch_events (user_id, anime_id, episode, watched_at)
  select a.user_id, a.id, g, p_watched_at - make_interval(mins => p_to - g)
  from generate_series(p_from, p_to) g;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.mark_episode_range(uuid, integer, integer, timestamptz) from anon, public;
grant execute on function public.mark_episode_range(uuid, integer, integer, timestamptz) to authenticated;

-- ---------- Amigos ----------
create table public.follows (
  follower_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  followee_id uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);
create index follows_followee_idx on public.follows (followee_id);
alter table public.follows enable row level security;
create policy "follows_select_mine" on public.follows for select
  using ((select auth.uid()) = follower_id or (select auth.uid()) = followee_id);
create policy "follows_delete_mine" on public.follows for delete using ((select auth.uid()) = follower_id);
-- Insertar solo vía follow_user (verifica que el perfil sea público).

create or replace function public.follow_user(p_username text) returns json
language plpgsql security definer set search_path = '' as $$
declare
  target uuid;
begin
  select user_id into target from public.profiles where username = lower(p_username) and is_public;
  if target is null then raise exception 'No existe un perfil público con ese nombre' using errcode = 'P0002'; end if;
  if target = (select auth.uid()) then raise exception 'No puedes seguirte a ti mismo' using errcode = '22023'; end if;
  insert into public.follows (follower_id, followee_id) values ((select auth.uid()), target) on conflict do nothing;
  return json_build_object('username', lower(p_username));
end $$;
revoke execute on function public.follow_user(text) from anon, public;
grant execute on function public.follow_user(text) to authenticated;

create or replace function public.unfollow_user(p_username text) returns void
language sql security definer set search_path = '' as $$
  delete from public.follows f using public.profiles p
  where p.username = lower(p_username) and f.followee_id = p.user_id and f.follower_id = (select auth.uid());
$$;
revoke execute on function public.unfollow_user(text) from anon, public;
grant execute on function public.unfollow_user(text) to authenticated;

-- A quién sigo y quién me sigue (solo nombres de usuario; las listas se leen con public_list).
create or replace function public.my_social() returns json
language sql stable security definer set search_path = '' as $$
  select json_build_object(
    'following', coalesce((select json_agg(json_build_object('username', p.username, 'is_public', p.is_public, 'since', f.created_at) order by f.created_at desc)
      from public.follows f join public.profiles p on p.user_id = f.followee_id where f.follower_id = (select auth.uid())), '[]'::json),
    'followers', coalesce((select json_agg(json_build_object('username', p.username, 'is_public', p.is_public, 'since', f.created_at) order by f.created_at desc)
      from public.follows f join public.profiles p on p.user_id = f.follower_id where f.followee_id = (select auth.uid())), '[]'::json)
  )
$$;
revoke execute on function public.my_social() from anon, public;
grant execute on function public.my_social() to authenticated;

-- ---------- Ver juntos ----------
create table public.watch_parties (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  anilist_id     integer,
  title          text not null check (char_length(title) between 1 and 300),
  cover_url      text,
  total_episodes integer check (total_episodes is null or total_episodes >= 0),
  invite_code    text not null unique default substr(md5(gen_random_uuid()::text), 1, 10),
  created_at     timestamptz not null default now()
);
create table public.watch_party_members (
  party_id         uuid not null references public.watch_parties(id) on delete cascade,
  user_id          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  watched_episodes integer not null default 0 check (watched_episodes >= 0),
  joined_at        timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  primary key (party_id, user_id)
);
create index watch_party_members_user_idx on public.watch_party_members (user_id);
create index watch_parties_owner_idx on public.watch_parties (owner_id);

create or replace function public.is_party_member(p_party uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.watch_party_members where party_id = p_party and user_id = (select auth.uid()))
$$;
revoke execute on function public.is_party_member(uuid) from anon, public;
grant execute on function public.is_party_member(uuid) to authenticated;

alter table public.watch_parties enable row level security;
create policy "parties_select_member" on public.watch_parties for select
  using ((select auth.uid()) = owner_id or (select public.is_party_member(id)));
create policy "parties_insert_own" on public.watch_parties for insert with check ((select auth.uid()) = owner_id);
create policy "parties_update_owner" on public.watch_parties for update using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "parties_delete_owner" on public.watch_parties for delete using ((select auth.uid()) = owner_id);

alter table public.watch_party_members enable row level security;
create policy "party_members_select" on public.watch_party_members for select using ((select public.is_party_member(party_id)));
create policy "party_members_insert_owner" on public.watch_party_members for insert
  with check ((select auth.uid()) = user_id and exists (select 1 from public.watch_parties w where w.id = party_id and w.owner_id = (select auth.uid())));
create policy "party_members_update_self" on public.watch_party_members for update
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "party_members_delete" on public.watch_party_members for delete
  using ((select auth.uid()) = user_id or exists (select 1 from public.watch_parties w where w.id = party_id and w.owner_id = (select auth.uid())));

create trigger watch_party_members_updated_at before update on public.watch_party_members
for each row execute function public.set_updated_at();

create or replace function public.join_party(p_code text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  pid uuid;
begin
  select id into pid from public.watch_parties where invite_code = lower(trim(p_code));
  if pid is null then raise exception 'Código de invitación inválido' using errcode = 'P0002'; end if;
  if (select count(*) from public.watch_party_members where party_id = pid) >= 8 then
    raise exception 'El grupo ya tiene 8 personas' using errcode = '22023';
  end if;
  insert into public.watch_party_members (party_id, user_id) values (pid, (select auth.uid())) on conflict do nothing;
  return pid;
end $$;
revoke execute on function public.join_party(text) from anon, public;
grant execute on function public.join_party(text) to authenticated;

-- Miembros con nombre visible (usuario o la parte local del correo), solo para miembros del grupo.
create or replace function public.party_members(p_party uuid) returns table (user_id uuid, name text, watched_episodes integer, is_me boolean, updated_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select m.user_id,
         coalesce(p.username, split_part(u.email, '@', 1)),
         m.watched_episodes,
         m.user_id = (select auth.uid()),
         m.updated_at
  from public.watch_party_members m
  join auth.users u on u.id = m.user_id
  left join public.profiles p on p.user_id = m.user_id
  where m.party_id = p_party and public.is_party_member(p_party)
  order by m.joined_at
$$;
revoke execute on function public.party_members(uuid) from anon, public;
grant execute on function public.party_members(uuid) to authenticated;

-- ---------- Caché compartida de IA (resúmenes para retomar, etc.). Solo service role. ----------
create table public.ai_cache (
  key        text primary key check (char_length(key) <= 200),
  value      jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.ai_cache enable row level security;

-- La lista pública incluye ahora el tipo de medio y las etiquetas (para comparar con amigos).
create or replace function public.public_list(p_username text) returns json
language sql stable security definer set search_path = '' as $$
  select json_build_object(
    'username', p.username,
    'animes', coalesce((
      select json_agg(json_build_object(
        'title', a.title, 'cover_url', a.cover_url, 'status', a.status,
        'watched_episodes', a.watched_episodes, 'total_episodes', a.total_episodes,
        'is_favorite', a.is_favorite, 'score', a.score, 'anilist_id', a.anilist_id,
        'genres', a.genres, 'format', a.format, 'season_year', a.season_year,
        'media_type', a.media_type, 'studios', a.studios, 'duration', a.duration
      ) order by a.is_favorite desc, a.updated_at desc)
      from public.animes a where a.user_id = p.user_id
    ), '[]'::json)
  )
  from public.profiles p
  where p.username = lower(p_username) and p.is_public
$$;
grant execute on function public.public_list(text) to anon, authenticated;
