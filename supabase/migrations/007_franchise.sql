-- Temporadas: cada anime sabe a qué franquicia pertenece (ID de AniList de la primera entrega)
-- y qué número de temporada es. Lo completa el backend recorriendo precuelas/secuelas en AniList.
alter table public.animes
  add column franchise_id integer,
  add column season_number smallint,
  add column franchise_synced_at timestamptz;
create index animes_user_franchise_idx on public.animes (user_id, franchise_id);
