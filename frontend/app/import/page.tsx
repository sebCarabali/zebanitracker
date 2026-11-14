'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ANILIST_STATUS_LABELS, AniListStatus, api, ImportResult } from '@/lib/api';

const ALL = Object.keys(ANILIST_STATUS_LABELS) as AniListStatus[];
const STORAGE_KEY = 'anilist-username';

export default function ImportPage() {
  const [username, setUsername] = useState('');
  const [statuses, setStatuses] = useState<AniListStatus[]>(ALL);
  const [favorites, setFavorites] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  useEffect(() => {
    try { setUsername(localStorage.getItem(STORAGE_KEY) ?? ''); } catch {}
  }, []);

  function toggle(s: AniListStatus) {
    setStatuses((list) => (list.includes(s) ? list.filter((x) => x !== s) : [...list, s]));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const name = username.trim();
      const r = await api.importAniList({
        username: name,
        statuses: statuses.length === ALL.length ? undefined : statuses,
        include_favorites: favorites,
      });
      setResult(r);
      try { localStorage.setItem(STORAGE_KEY, name); } catch {}
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="narrow">
      <h1>Importar desde AniList</h1>
      <p className="muted">
        Trae tu lista pública de <a href="https://anilist.co" target="_blank" rel="noreferrer">AniList</a> con estados,
        progreso y favoritos. Puedes repetirlo cuando quieras para sincronizar: no crea duplicados, no retrocede tu
        progreso y conserva tus notas y enlaces.
      </p>
      <form className="form" onSubmit={submit}>
        <label>Usuario de AniList
          <input
            required minLength={2} maxLength={20} pattern="[A-Za-z0-9_\-]+"
            placeholder="p. ej. tu_usuario" value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </label>
        <fieldset className="chips">
          <legend className="muted small">Listas a importar</legend>
          {ALL.map((s) => (
            <label key={s} className={`chip ${statuses.includes(s) ? 'on' : ''}`}>
              <input type="checkbox" checked={statuses.includes(s)} onChange={() => toggle(s)} />
              {ANILIST_STATUS_LABELS[s]}
            </label>
          ))}
        </fieldset>
        <label className="check">
          <input type="checkbox" checked={favorites} onChange={(e) => setFavorites(e.target.checked)} />
          Marcar como ★ mis favoritos de AniList
        </label>
        {error && <p className="error">{error}</p>}
        <button className="btn primary" disabled={busy || statuses.length === 0}>
          {busy ? 'Importando…' : 'Importar'}
        </button>
      </form>

      {result && (
        <div className="result">
          <p className="ok">✓ Importación completada para <strong>{result.username}</strong></p>
          <ul>
            <li>{result.found} animes en su lista ({result.selected} seleccionados)</li>
            <li>{result.created} nuevos agregados</li>
            <li>{result.updated} existentes actualizados</li>
            {favorites && <li>{result.favorites} favoritos en AniList</li>}
          </ul>
          <Link href="/" className="btn primary">Ver mi lista</Link>
        </div>
      )}
    </div>
  );
}
