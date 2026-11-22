-- Caché de traducciones compartida entre usuarios. Sin políticas RLS: solo el backend (service role)
-- puede leerla y escribirla, así nadie puede envenenar la traducción que ven los demás.
create table public.translation_cache (
  anilist_id  integer not null,
  lang        text not null check (lang ~ '^[a-z]{2}$'),
  source_hash text not null,          -- hash de la sinopsis original: si AniList la cambia, se retraduce
  text        text not null check (char_length(text) <= 20000),
  model       text,
  hits        integer not null default 0,
  created_at  timestamptz not null default now(),
  primary key (anilist_id, lang)
);
alter table public.translation_cache enable row level security;
