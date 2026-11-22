'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, LANGUAGES, Profile } from '@/lib/api';
import { useAuth } from '@/components/AuthProvider';
import { DEFAULT_WATCH_BASE, getWatchBase, setWatchBase } from '@/lib/watch';

const ANILIST_CLIENT_ID = process.env.NEXT_PUBLIC_ANILIST_CLIENT_ID;

function Switch({ checked, onChange, disabled, label }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} className="switch" disabled={disabled} onClick={() => onChange(!checked)} />;
}

export default function SettingsPage() {
  const { session } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [watchBase, setWatchBaseState] = useState(DEFAULT_WATCH_BASE);
  const [prefs, setPrefs] = useState('');
  useEffect(() => setWatchBaseState(getWatchBase()), []);

  useEffect(() => {
    if (!session) return;
    // Vuelta del OAuth de AniList: el token llega en el fragmento (#access_token=…)
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const anilistToken = hash.get('access_token');
    if (anilistToken) {
      history.replaceState(null, '', window.location.pathname);
      setBusy(true);
      api.connectAniList(anilistToken)
        .then((p) => { setProfile(p); setUsername(p.username ?? ''); setMsg({ type: 'ok', text: `AniList conectado como ${p.anilist_username}` }); })
        .catch((e) => setMsg({ type: 'error', text: e.message }))
        .finally(() => setBusy(false));
      return;
    }
    api.profile().then((p) => { setProfile(p); setUsername(p.username ?? ''); setPrefs(p.ai_preferences ?? ''); }).catch((e) => setMsg({ type: 'error', text: e.message }));
  }, [session]);

  async function save(patch: Parameters<typeof api.updateProfile>[0], okText: string) {
    setBusy(true);
    setMsg(null);
    try {
      const p = await api.updateProfile(patch);
      setProfile(p);
      setUsername(p.username ?? '');
      setMsg({ type: 'ok', text: okText });
    } catch (e) {
      setMsg({ type: 'error', text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  if (!session) return null;
  if (!profile) return <main className="container"><p className="muted">{msg?.text ?? 'Cargando…'}</p></main>;

  const publicUrl = profile.username ? `${window.location.origin}/u/${profile.username}` : null;

  return (
    <main className="container">
      <div className="narrow" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div>
          <span className="eyebrow">Ajustes</span>
          <h1 style={{ marginTop: 8 }}>Tu cuenta</h1>
          <p className="muted" style={{ marginBottom: 0 }}>{session.user.email}</p>
        </div>
        {msg && <p className={msg.type} role="status" style={{ margin: 0 }}>{msg.text}</p>}

        <section className="panel">
          <h2 className="section-label">Idioma e IA</h2>
          <div className="setting">
            <label className="grow" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <strong>Idioma de las sinopsis y recomendaciones</strong>
              <span className="muted small">Las sinopsis de AniList (en inglés) se traducen con IA a este idioma.</span>
              <select value={profile.language} disabled={busy}
                onChange={(e) => save({ language: e.target.value }, `Idioma: ${LANGUAGES[e.target.value]}`)}>
                {Object.entries(LANGUAGES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
          </div>
          <form className="setting" onSubmit={(e) => { e.preventDefault(); save({ ai_preferences: prefs.trim() || null }, 'Preferencias guardadas: la IA las usará en tus próximas recomendaciones'); }}>
            <label className="grow" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <strong>Tus gustos, en tus palabras</strong>
              <span className="muted small">La IA los tiene en cuenta además de tu historial. Ej.: “me encantan los isekai cortos y el misterio; no me gusta el fanservice ni lo muy largo”.</span>
              <textarea rows={3} maxLength={1000} value={prefs} onChange={(e) => setPrefs(e.target.value)} placeholder="¿Qué te gusta y qué no?" />
            </label>
            <button className="btn navy" disabled={busy || prefs.trim() === (profile.ai_preferences ?? '')}>Guardar</button>
          </form>
        </section>

        <section className="panel">
          <h2 className="section-label">Perfil público</h2>
          <form className="setting" onSubmit={(e) => { e.preventDefault(); save({ username: username.trim().toLowerCase() }, 'Nombre de usuario guardado'); }}>
            <label className="grow" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <strong>Nombre de usuario</strong>
              <span className="muted small">3-24 caracteres: letras minúsculas, números o _</span>
              <input value={username} onChange={(e) => setUsername(e.target.value)} pattern="[a-zA-Z0-9_]{3,24}" placeholder="tu_usuario" required />
            </label>
            <button className="btn navy" disabled={busy || username.trim().toLowerCase() === (profile.username ?? '')}>Guardar</button>
          </form>
          <div className="setting">
            <div className="grow">
              <strong>Compartir mi lista</strong>
              <p className="muted small">Cualquiera con el enlace verá tus animes, progreso, puntuaciones y favoritos. Nunca tus notas, reseñas ni enlaces.</p>
            </div>
            <Switch label="Compartir mi lista" checked={profile.is_public} disabled={busy || !profile.username}
              onChange={(v) => save({ is_public: v }, v ? 'Tu lista ahora es pública' : 'Tu lista ahora es privada')} />
          </div>
          {profile.is_public && publicUrl && (
            <div className="setting">
              <a href={publicUrl} target="_blank" rel="noreferrer" className="grow" style={{ wordBreak: 'break-all' }}>{publicUrl}</a>
              <button className="btn" onClick={() => { navigator.clipboard.writeText(publicUrl); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
                {copied ? '✓ Copiado' : 'Copiar enlace'}
              </button>
            </div>
          )}
        </section>

        <section className="panel">
          <h2 className="section-label">Notificaciones</h2>
          <div className="setting">
            <div className="grow">
              <strong>Correo cuando salga un capítulo</strong>
              <p className="muted small">
                {profile.email_notifications_available
                  ? 'Un resumen diario con los capítulos nuevos de lo que estás viendo.'
                  : 'Aún no disponible: falta configurar el envío de correos en el servidor.'}
              </p>
            </div>
            <Switch label="Correo de capítulos nuevos" checked={profile.notify_email} disabled={busy || !profile.email_notifications_available}
              onChange={(v) => save({ notify_email: v }, v ? 'Te avisaremos por correo' : 'Correos desactivados')} />
          </div>
          <div className="setting">
            <div className="grow">
              <strong>Avisos en el navegador</strong>
              <p className="muted small">La extensión de Chrome muestra una notificación cuando sale un capítulo nuevo.</p>
            </div>
          </div>
        </section>

        <section className="panel">
          <h2 className="section-label">AniList</h2>
          <div className="setting">
            <div className="grow">
              <strong>{profile.anilist_connected ? `Conectado como ${profile.anilist_username}` : 'Sincronizar con mi cuenta de AniList'}</strong>
              <p className="muted small">
                Cada capítulo, estado y puntuación que marques aquí se refleja en tu lista de AniList.
                {!ANILIST_CLIENT_ID && ' Aún no disponible: falta configurar el Client ID de AniList.'}
              </p>
            </div>
            {profile.anilist_connected ? (
              <button className="btn" disabled={busy} onClick={async () => {
                setBusy(true);
                try { setProfile(await api.disconnectAniList()); setMsg({ type: 'ok', text: 'AniList desconectado' }); }
                catch (e) { setMsg({ type: 'error', text: (e as Error).message }); }
                finally { setBusy(false); }
              }}>Desconectar</button>
            ) : (
              <a className={`btn primary ${ANILIST_CLIENT_ID ? '' : 'disabled'}`} aria-disabled={!ANILIST_CLIENT_ID}
                href={ANILIST_CLIENT_ID ? `https://anilist.co/api/v2/oauth/authorize?client_id=${ANILIST_CLIENT_ID}&response_type=token` : undefined}>
                Conectar AniList
              </a>
            )}
          </div>
        </section>

        <section className="panel">
          <h2 className="section-label">Dónde ver</h2>
          <form className="setting" onSubmit={(e) => {
            e.preventDefault();
            setWatchBase(watchBase);
            setWatchBaseState(getWatchBase());
            setMsg({ type: 'ok', text: `Los enlaces de “Ver en JKAnime” usarán ${getWatchBase()}` });
          }}>
            <label className="grow" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <strong>Dominio de JKAnime</strong>
              <span className="muted small">Cambia si el sitio se muda (por ejemplo a jkanime.org). Se guarda en este navegador.</span>
              <input type="url" required value={watchBase} onChange={(e) => setWatchBaseState(e.target.value)} placeholder={DEFAULT_WATCH_BASE} />
            </label>
            <div className="row">
              <button className="btn navy">Guardar</button>
              {watchBase !== DEFAULT_WATCH_BASE && (
                <button type="button" className="btn ghost" onClick={() => { setWatchBase(DEFAULT_WATCH_BASE); setWatchBaseState(DEFAULT_WATCH_BASE); }}>
                  Restablecer
                </button>
              )}
            </div>
          </form>
        </section>

        <section className="panel">
          <h2 className="section-label">Datos</h2>
          <div className="setting">
            <div className="grow">
              <strong>Importar y exportar</strong>
              <p className="muted small">Desde AniList o MyAnimeList, y descarga tu lista en formato MAL.</p>
            </div>
            <Link href="/import" className="btn">Abrir</Link>
          </div>
        </section>
      </div>
    </main>
  );
}
