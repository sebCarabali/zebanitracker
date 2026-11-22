'use client';

import { useState } from 'react';

export interface CardPayload {
  kind: 'top' | 'stats';
  title: string;
  subtitle?: string;
  name?: string;
  items?: { title: string; cover_url?: string | null; score?: number | null }[];
  numbers?: { value: string; label: string }[];
  highlights?: string[];
}

/** Genera una imagen para redes (servidor de la web) y permite compartirla o descargarla. */
export function ShareCard({ payload, label = 'Compartir imagen', filename = 'zebanitracker.png' }: { payload: () => CardPayload; label?: string; filename?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function make() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/card', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload()) });
      if (!res.ok) throw new Error(`No se pudo generar la imagen (${res.status})`);
      const b = await res.blob();
      setBlob(b);
      setUrl((old) => { if (old) URL.revokeObjectURL(old); return URL.createObjectURL(b); });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function share() {
    if (!blob) return;
    const file = new File([blob], filename, { type: 'image/png' });
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: 'Mi ZebaniTracker' }); } catch { /* cancelado */ }
    } else {
      const a = document.createElement('a');
      a.href = url!; a.download = filename; a.click();
    }
  }

  return (
    <div className="share-card">
      <button className="btn navy" disabled={busy} onClick={make}>{busy ? 'Generando…' : url ? 'Regenerar' : `🖼 ${label}`}</button>
      {error && <p className="error small">{error}</p>}
      {url && (
        <div className="share-preview">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="Vista previa de la imagen para compartir" />
          <div className="row">
            <button className="btn primary" onClick={share}>Compartir</button>
            <a className="btn" href={url} download={filename}>Descargar PNG</a>
            <button className="btn ghost" onClick={() => setUrl(null)}>Cerrar</button>
          </div>
        </div>
      )}
    </div>
  );
}
