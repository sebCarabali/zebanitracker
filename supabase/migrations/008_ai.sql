-- IA: idioma preferido (por defecto español), gustos en texto libre, caché de recomendaciones
-- y caché de traducciones de sinopsis (por usuario, para que nadie pueda envenenar la de otro).
alter table public.profiles
  add column language       text not null default 'es' check (language ~ '^[a-z]{2}$'),
  add column ai_preferences text check (char_length(ai_preferences) <= 1000),
  add column ai_recs        jsonb,
  add column ai_recs_at     timestamptz;

create table public.ai_translations (
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  anilist_id integer not null,
  lang       text not null check (lang ~ '^[a-z]{2}$'),
  text       text not null check (char_length(text) <= 20000),
  created_at timestamptz not null default now(),
  primary key (user_id, anilist_id, lang)
);
alter table public.ai_translations enable row level security;
create policy "ai_translations_select_own" on public.ai_translations for select using ((select auth.uid()) = user_id);
create policy "ai_translations_insert_own" on public.ai_translations for insert with check ((select auth.uid()) = user_id);
create policy "ai_translations_update_own" on public.ai_translations for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
