-- Datos de emisión traídos de AniList
alter table public.animes
  add column airing_status      text check (airing_status in ('RELEASING','FINISHED','NOT_YET_RELEASED','CANCELLED','HIATUS')),
  add column aired_episodes     integer check (aired_episodes is null or aired_episodes >= 0),
  add column next_episode_at    timestamptz,
  add column episodes_synced_at timestamptz;
