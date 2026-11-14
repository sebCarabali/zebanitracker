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
  const [malBusy, setMalBusy] = useState(false);
  const [malMsg, setMalMsg] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);
  const [malResult, setMalResult] = useState<ImportResult | null>(null);

  async function importMal(file: File) {
    setMalBusy(true);
    setMalMsg(null);
    setMalResult(null);
    try {
      let text: string;
      if (file.name.endsWith('.gz')) {
        // MyAnimeList entrega el export comprimido (.xml.gz)
        const stream = file.stream().pipeThrough(new DecompressionStream('gzip'));
        text = await new Response(stream).text();
      } else {
        text = await file.text();
      }
      setMalResult(await api.importMal(text));
    } catch (e) {
      setMalMsg({ type: 'error', text: (e as Error).message });
    } finally {
      setMalBusy(false);
    }
  }

  async function exportMal() {
    setMalBusy(true);
    setMalMsg(null);
    try {
      const { blob, exported, skipped } = await api.exportMal();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'zebanitracker-mal.xml';
      a.click();
      URL.revokeObjectURL(a.href);
      setMalMsg({ type: 'ok', text: `Exportados ${exported} animes${skipped ? ` (${skipped} sin ID de MyAnimeList quedaron fuera)` : ''}.` });
    } catch (e) {
      setMalMsg({ type: 'error', text: (e as Error).message });
    } finally {
      setMalBusy(false);
    }
  }

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
    <main className="container">
    <div className="narrow" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <span className="eyebrow">Importar y exportar</span>
        <h1 style={{ marginTop: 8 }}>Trae tu lista</h1>
      </div>
      <div>
        <h2 style={{ fontSize: '1.3rem' }}>Desde AniList</h2>
      </div>
      <p className="muted" style={{ margin: 0 }}>
        Trae tu lista pública de <a href="https://anilist.co" target="_blank" rel="noreferrer">AniList</a> con estados,
        progreso y favoritos. Puedes repetirlo cuando quieras para sincronizar: no crea duplicados, no retrocede tu
        progreso y conserva tus notas y enlaces.
      </p>
      <form className="form panel" onSubmit={submit}>
        <label>Usuario de AniList
          <input
            required minLength={2} maxLength={20} pattern="[A-Za-z0-9_\-]+"
            placeholder="p. ej. tu_usuario" value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </label>
        <fieldset className="chips">
          <legend className="section-label">Listas a importar</legend>
          {ALL.map((s) => (
            <button key={s} type="button" className="chip" aria-pressed={statuses.includes(s)} onClick={() => toggle(s)}>
              {ANILIST_STATUS_LABELS[s]}
            </button>
          ))}
        </fieldset>
        <label className="check">
          <input type="checkbox" checked={favorites} onChange={(e) => setFavorites(e.target.checked)} />
          Marcar como ★ mis favoritos de AniList
        </label>
        {error && <p className="error">{error}</p>}
        <button className="btn primary lg" disabled={busy || statuses.length === 0}>
          {busy ? 'Importando…' : 'Importar'}
        </button>
      </form>

      {result && (
        <div className="panel result-box">
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

      <div style={{ marginTop: 12 }}>
        <h2 style={{ fontSize: '1.3rem' }}>MyAnimeList</h2>
        <p className="muted" style={{ marginBottom: 0 }}>
          Exporta tu lista en <a href="https://myanimelist.net/panel.php?go=export" target="_blank" rel="noreferrer">myanimelist.net › Export</a> y
          sube el archivo aquí (.xml o .xml.gz). Para llevar tu lista a MAL, descárgala y usa su opción Import.
        </p>
      </div>
      <div className="panel form">
        <label>Archivo de MyAnimeList
          <input type="file" accept=".xml,.gz,application/xml,text/xml" disabled={malBusy}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) importMal(f); e.target.value = ''; }} />
        </label>
        <button type="button" className="btn navy" disabled={malBusy} onClick={exportMal}>
          {malBusy ? 'Procesando…' : 'Descargar mi lista en formato MAL'}
        </button>
        {malMsg && <p className={malMsg.type} style={{ margin: 0 }}>{malMsg.text}</p>}
        {malResult && (
          <div className="result-box" style={{ marginTop: 0 }}>
            <p className="ok" style={{ margin: 0 }}>✓ Importación de MyAnimeList completada</p>
            <ul>
              <li>{malResult.found} animes en el archivo ({malResult.selected} encontrados en AniList)</li>
              <li>{malResult.created} nuevos agregados</li>
              <li>{malResult.updated} existentes actualizados</li>
              {!!malResult.not_found?.length && <li>Sin equivalente en AniList: {malResult.not_found.join(', ')}</li>}
            </ul>
            <Link href="/" className="btn primary">Ver mi lista</Link>
          </div>
        )}
      </div>
    </div>
    </main>
  );
}
