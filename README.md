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
- **Integración con AniList** (API GraphQL pública y gratuita, sin API key):
  - Buscador con autocompletado al crear un anime (web y extensión) que rellena título, portada y total de capítulos.
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
| GET | `/api/catalog/search?q=frieren` | Buscar en el catálogo de AniList |
| POST | `/api/animes/import/anilist` `{ "username": "...", "statuses"?: ["CURRENT","COMPLETED"], "include_favorites"?: true }` | Importar/sincronizar lista de AniList |
| GET | `/api/health` | Healthcheck (público) |
| GET | `/api/health/anilist` | Verifica la conexión con AniList (público) |

Estados: `watching`, `completed`, `plan_to_watch`, `on_hold`, `dropped`.

**AniList:** límite de 90 peticiones/min (a veces reducido temporalmente a 30). Las búsquedas se cachean 10 minutos en el backend y la web espera 400 ms antes de buscar. Estados de AniList → app: `CURRENT`/`REPEATING` → Viendo, `PLANNING` → Pendiente, `COMPLETED` → Completado, `PAUSED` → En pausa, `DROPPED` → Abandonado. La lista de AniList del usuario debe ser pública.

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
