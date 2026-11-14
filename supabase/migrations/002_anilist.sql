-- Vincula animes con su entrada en AniList para buscar e importar listas sin duplicados
alter table public.animes add column anilist_id integer check (anilist_id is null or anilist_id > 0);

-- NULL no choca con NULL, así que los animes manuales (sin anilist_id) no se ven afectados
alter table public.animes add constraint animes_user_anilist_key unique (user_id, anilist_id);
