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
- Extensión: detecta el anime y el capítulo desde el título de la pestaña (p. ej. `Frieren Episodio 12 - AnimeFLV`). Si ya está en tu lista lo marca visto con un clic; si no, lo agrega con el enlace de la página.

## 1. Supabase

1. Crea un proyecto en [supabase.com](https://supabase.com).
2. En **SQL Editor** ejecuta `supabase/migrations/001_init.sql` (o `supabase db push` con la CLI).
3. En **Authentication → URL Configuration** agrega `http://localhost:3000` a *Redirect URLs* (necesario para el enlace mágico y la confirmación de correo).
4. Copia la *Project URL* y la *anon/publishable key* de **Project Settings → API**.

La seguridad vive en Postgres: la API usa la anon key + el JWT del usuario, así que las políticas RLS garantizan que cada usuario solo vea y edite sus animes.

## 2. Backend (NestJS)

```bash
cd backend
cp .env.example .env   # completa SUPABASE_URL y SUPABASE_ANON_KEY
npm install
npm run start:dev      # http://localhost:4000/api
```

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
| GET | `/api/health` | Healthcheck (público) |

Estados: `watching`, `completed`, `plan_to_watch`, `on_hold`, `dropped`.

## 3. Frontend (Next.js)

```bash
cd frontend
cp .env.example .env.local   # Supabase URL, anon key y NEXT_PUBLIC_API_URL
npm install
npm run dev                  # http://localhost:3000
```

## 4. Extensión de Chrome

1. Edita `extension/config.js` con tu `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `API_URL` y `WEB_URL`.
2. Si la API no está en `localhost:4000`, agrega su dominio en `host_permissions` del `manifest.json`.
3. Abre `chrome://extensions`, activa **Modo desarrollador** → **Cargar descomprimida** → selecciona la carpeta `extension/`.
4. Inicia sesión en el popup con tu correo y contraseña (las cuentas se crean desde la web).

Pestañas del popup:
- **Esta página**: detecta título y capítulo de la pestaña activa. Si coincide con un anime de tu lista, puedes marcar el capítulo visto; si no, lo agregas.
- **Mis animes**: lista con búsqueda, favorito, `+1` y campo para fijar un capítulo.

## Despliegue

- **Frontend** → Vercel (configura las tres variables `NEXT_PUBLIC_*`).
- **Backend** → Railway, Render, Fly.io, etc. Define `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `PORT` y `CORS_ORIGINS` con el dominio del frontend (los orígenes `chrome-extension://` se permiten siempre).
- Actualiza `extension/config.js` y `host_permissions` con las URLs de producción.
