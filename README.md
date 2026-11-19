# 📺 ZebaniTracker

Tracking de animes vistos: web en **Next.js**, API en **NestJS**, auth y base de datos en **Supabase**, y una **extensión de Chrome** para agregar animes y marcar capítulos desde la página donde los ves.

```
zebanitracker/
├── supabase/migrations/   # Esquema SQL + políticas RLS
├── backend/               # API NestJS (puerto 4000, prefijo /api)
├── frontend/              # Web Next.js (puerto 3000)
└── extension/             # Extensión Chrome (Manifest V3)
```

## Funcionalidades

- Inicio de sesión por correo con Supabase: contraseña, enlace mágico o registro.
- Listar animes con búsqueda, filtro por estado y filtro de **favoritos**.
- Crear, editar y eliminar animes (título, capítulos vistos/total, estado, portada, URL, notas).
- **Avance** de cada anime: barra de progreso, botón "Visto cap. N", −1, o fijar un capítulo exacto.
- Reglas automáticas: llegar al último capítulo → *Completado*; marcar *Completado* rellena el progreso; no se puede superar el total.
- **Calendario** (`/calendar`): estrenos de los próximos 7 días y capítulos ya emitidos que aún no ves.
- **Puntuación (1-10) y reseña** por anime; orden de la biblioteca por recientes, título, progreso, puntuación o próximo estreno.
- **Ver en JKAnime**: botones "Ver cap. N en JKAnime" y "Buscar en JKAnime", y selector "Ir al capítulo" en el detalle. El enlace usa el slug del anime (`{dominio}/{slug}/{n}/`): se aprende de la página pegada en *Dónde lo veo* o desde la que marcaste un capítulo; si no hay, se deriva del título en romaji. El dominio se cambia en Ajustes (web) y en `extension/config.js` → `WATCH_BASE`. La extensión reconoce anime y capítulo directamente de la URL de JKAnime.
- **Continuar con un clic**: al marcar desde la extensión se guarda la página del capítulo y se ofrece "Abrir cap. N+1" (adivina la URL).
- **Historial**: cada capítulo marcado queda registrado (`watch_events`) → racha diaria y mapa de actividad.
- **Descubrir**: "Para ti" (recomendaciones de AniList según tus favoritos y mejor puntuados) y **secuelas pendientes** de lo que terminaste; acceso rápido a los estrenos de la temporada.
- **Estadísticas** (`/stats`): horas, rachas, géneros, estudios, años, formatos, puntuación media y tasa de abandono.
- **Lista pública** (`/u/:usuario`), opcional desde Ajustes; nunca muestra notas, reseñas ni enlaces.
- **Sincronizar con AniList** (OAuth): cada cambio se refleja en tu lista de AniList.
- **MyAnimeList**: importar el XML exportado (.xml o .xml.gz) y descargar tu lista en formato MAL.
- **Notificaciones**: la extensión avisa de capítulos nuevos y, al terminar un video (90 %), ofrece marcarlo; correo diario opcional.
- **PWA**: instalable en el celular y con la última copia de la lista disponible sin conexión.
- **Total de capítulos automático** desde AniList: al crear, importar o abrir la lista se completan el total, los capítulos ya emitidos y la fecha del próximo (en emisión: cada 6 h; terminados: cada 7 días). Los animes agregados a mano sin total se vinculan solos si el título coincide exactamente.
- **Diseño** en tema claro con la paleta `#F9F5EB` (fondo), `#002B5B` (texto/encabezado), `#2D4059` (secundario), `#EA5455` (acento) y `#F07B3F` (en emisión / viendo); Space Grotesk + Inter. Para texto y botones se usa `#C73E40`, el mismo rojo un poco más oscuro, para cumplir contraste AA.
- **Fichas del catálogo** (`/explore/:anilistId`): sinopsis, géneros y etiquetas, estudio, duración, fechas, origen, puntuación, tráiler y animes relacionados. Tu detalle (`/animes/:id`) muestra también la sinopsis cuando está vinculado a AniList.
- **Integración con AniList** (API GraphQL pública y gratuita, sin API key):
  - Buscador con autocompletado al crear un anime (web y extensión) que rellena título, portada y total de capítulos.
  - **Explorar** (`/explore`): catálogo de AniList con filtros de búsqueda, géneros, etiquetas, año, temporada, formato, estado de emisión y orden; agrega con un clic como *Viendo* o *Pendiente*.
  - **Importar / sincronizar** tu lista pública de AniList por nombre de usuario (`/import`): estados, progreso y favoritos. Se puede repetir sin crear duplicados; nunca retrocede tu progreso ni borra notas o enlaces.
- Extensión: detecta el anime y el capítulo desde el título de la pestaña (p. ej. `Frieren Episodio 12 - AnimeFLV`). Si ya está en tu lista lo marca visto con un clic; si no, lo agrega con el enlace de la página.

## Configuración: variables de entorno en Vercel

No se usan archivos `.env`. Toda la configuración vive en las **Environment Variables** de cada proyecto de Vercel (equipo *sebastin-carabalis-projects*), y el backend arranca con `ignoreEnvFile: true`.

| Proyecto Vercel | Root | Variable | Production / Preview | Development |
|---|---|---|---|---|
| `zebanitracker-api` | `backend/` | `SUPABASE_URL` | `https://ccztpoqpgplnknhsrbbp.supabase.co` | igual |
| | | `SUPABASE_ANON_KEY` | publishable key de Supabase | igual |
| | | `CORS_ORIGINS` | `https://zebanitracker-web.vercel.app,https://zebanitracker-web-*.vercel.app` | `http://localhost:3000` |
| `zebanitracker-web` | `frontend/` | `NEXT_PUBLIC_SUPABASE_URL` | igual que arriba | igual |
| | | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | publishable key | igual |
| | | `NEXT_PUBLIC_API_URL` | `https://zebanitracker-api.vercel.app/api` | `http://localhost:4000/api` |

**Opcionales** (activan funciones; sin ellas la app funciona y la opción aparece como "no disponible"):

| Proyecto | Variable | Para qué |
|---|---|---|
| `zebanitracker-web` | `NEXT_PUBLIC_ANILIST_CLIENT_ID` | Botón "Conectar AniList". Crea un cliente en [anilist.co/settings/developer](https://anilist.co/settings/developer) con Redirect URL `https://zebanitracker-web.vercel.app/settings` |
| `zebanitracker-api` | `CRON_SECRET` | Protege la tarea diaria `/api/cron/notify` (Vercel la envía sola) |
| `zebanitracker-api` | `SUPABASE_SERVICE_ROLE_KEY` | La tarea diaria lee los animes de todos los usuarios que activaron correos |
| `zebanitracker-api` | `RESEND_API_KEY`, `MAIL_FROM` | Envío de correos con [Resend](https://resend.com) |

`CORS_ORIGINS` admite comodines (`*`) para cubrir los despliegues de vista previa. Los orígenes `chrome-extension://` se permiten siempre.

Cada push a `main` despliega ambos proyectos automáticamente.

### Desarrollo local (sin archivos .env)

Con la [CLI de Vercel](https://vercel.com/docs/cli) se usan las variables del entorno *Development* directamente:

```bash
npm i -g vercel
cd backend  && vercel link --project zebanitracker-api && npm install && vercel dev --listen 4000
cd frontend && vercel link --project zebanitracker-web && npm install && vercel dev --listen 3000
```

## Supabase

Proyecto `ccztpoqpgplnknhsrbbp`. La migración `supabase/migrations/001_init.sql` ya está aplicada. La seguridad vive en Postgres: la API usa la publishable key + el JWT del usuario, así que las políticas RLS garantizan que cada usuario solo vea y edite sus animes.

En **Authentication → URL Configuration** deben estar como Site URL / Redirect URLs `https://zebanitracker-web.vercel.app` (y `http://localhost:3000` para desarrollo), necesarios para el enlace mágico y la confirmación de correo.

## Backend (NestJS)

Se despliega en Vercel con el preset **NestJS** (entrada `src/main.ts`).

> Nota: Nest CLI todavía no soporta TypeScript 7, por eso el proyecto fija `typescript@^6`.

### Endpoints (todos requieren `Authorization: Bearer <access_token de Supabase>`)

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/animes?favorite=true&status=watching&search=texto` | Listar con filtros |
| GET | `/api/animes/:id` | Detalle |
| POST | `/api/animes` | Crear |
| PATCH | `/api/animes/:id` | Editar |
| DELETE | `/api/animes/:id` | Eliminar |
| POST | `/api/animes/:id/favorite` | Alternar favorito |
| PATCH | `/api/animes/:id/progress` `{ "episode": 12 }` | Fijar último capítulo visto |
| POST | `/api/animes/:id/progress/next` | +1 capítulo |
| POST | `/api/animes/:id/progress/prev` | −1 capítulo |
| POST | `/api/animes/sync-episodes` `{ "force"?: false }` | Completa total, emitidos y próximo capítulo desde AniList |
| POST | `/api/animes/:id/sync` | Igual, para un anime |
| GET | `/api/catalog/search?q=frieren` | Autocompletado en el catálogo de AniList |
| GET | `/api/catalog/browse?search=&genres=Action,Fantasy&tags=Magic&year=2023&season=FALL&formats=TV,MOVIE&status=FINISHED&sort=SCORE_DESC&page=1` | Explorar con filtros (24 por página) |
| GET | `/api/catalog/anime/:anilistId` | Ficha completa (sinopsis, estudio, relaciones…) |
| GET | `/api/catalog/filters` | Géneros y etiquetas disponibles |
| POST | `/api/animes/import/anilist` `{ "username": "...", "statuses"?: ["CURRENT","COMPLETED"], "include_favorites"?: true }` | Importar/sincronizar lista de AniList |
| GET | `/api/animes/activity?days=365` | Capítulos marcados (historial, racha, mapa) |
| GET | `/api/animes/discover` | Recomendaciones y secuelas pendientes |
| GET | `/api/animes/export/mal` | Descarga XML de MyAnimeList |
| POST | `/api/animes/import/mal` `{ "xml": "…" }` | Importa el XML de MyAnimeList |
| GET / PATCH | `/api/profile` | Usuario, lista pública, correos |
| PUT / DELETE | `/api/profile/anilist` `{ "token" }` | Conectar / desconectar AniList |
| GET | `/api/public/:username` | Lista pública (sin sesión) |
| GET | `/api/cron/notify` | Tarea diaria de correos (Vercel Cron, `CRON_SECRET`) |
| GET | `/api/health` | Healthcheck (público) |
| GET | `/api/health/anilist` | Verifica la conexión con AniList (público) |

Estados: `watching`, `completed`, `plan_to_watch`, `on_hold`, `dropped`.

**AniList:** límite de 90 peticiones/min (a veces reducido temporalmente a 30). Las búsquedas se cachean 10 minutos en el backend y la web espera 400 ms antes de buscar. Valores de filtros: `season` = `WINTER`/`SPRING`/`SUMMER`/`FALL`; `formats` = `TV`, `TV_SHORT`, `MOVIE`, `SPECIAL`, `OVA`, `ONA`, `MUSIC`; `status` = `RELEASING`, `FINISHED`, `NOT_YET_RELEASED`, `CANCELLED`, `HIATUS`; `sort` = `POPULARITY_DESC`, `TRENDING_DESC`, `SCORE_DESC`, `START_DATE_DESC`, `TITLE_ROMAJI`, `SEARCH_MATCH`. Estados de AniList → app: `CURRENT`/`REPEATING` → Viendo, `PLANNING` → Pendiente, `COMPLETED` → Completado, `PAUSED` → En pausa, `DROPPED` → Abandonado. La lista de AniList del usuario debe ser pública.

## Frontend (Next.js)

Se despliega en Vercel con el preset Next.js. Las variables `NEXT_PUBLIC_*` se incrustan en el build, así que tras cambiarlas hay que redesplegar.

## Extensión de Chrome

1. `extension/config.js` ya apunta a producción (`zebanitracker-api.vercel.app`). Una extensión no tiene variables de entorno, por eso esos valores públicos van en ese archivo; para desarrollo cámbialos a `localhost`.
2. Si usas otro dominio para la API, agrégalo en `host_permissions` del `manifest.json`.
3. Abre `chrome://extensions`, activa **Modo desarrollador** → **Cargar descomprimida** → selecciona la carpeta `extension/`.
4. Inicia sesión en el popup con tu correo y contraseña (las cuentas se crean desde la web).

Pestañas del popup:
- **Esta página**: detecta título y capítulo de la pestaña activa. Si coincide con un anime de tu lista, puedes marcar el capítulo visto; si no, lo agregas.
- **Mis animes**: lista con búsqueda, favorito, `+1` y campo para fijar un capítulo.

## Tests

```bash
cd frontend
npx playwright install chromium   # una vez
npm run test:e2e                  # compila, levanta la web y prueba con API y Supabase simulados
```

GitHub Actions (`.github/workflows/ci.yml`) compila backend, revisa la extensión y corre los e2e en cada push y PR.
