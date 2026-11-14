'use client';

import { useState } from 'react';
import { Anime, AnimeInput, AnimeStatus, STATUS_LABELS } from '@/lib/api';

export function AnimeForm({ initial, submitLabel, onSubmit }: {
  initial?: Partial<Anime>;
  submitLabel: string;
  onSubmit: (input: AnimeInput) => Promise<void>;
}) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [total, setTotal] = useState(initial?.total_episodes?.toString() ?? '');
  const [watched, setWatched] = useState(initial?.watched_episodes?.toString() ?? '0');
  const [status, setStatus] = useState<AnimeStatus>(initial?.status ?? 'watching');
  const [favorite, setFavorite] = useState(initial?.is_favorite ?? false);
  const [cover, setCover] = useState(initial?.cover_url ?? '');
  const [source, setSource] = useState(initial?.source_url ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handle(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSubmit({
        title: title.trim(),
        total_episodes: total === '' ? null : Number(total),
        watched_episodes: Number(watched || 0),
        status,
        is_favorite: favorite,
        cover_url: cover.trim() || null,
        source_url: source.trim() || null,
        notes: notes.trim() || null,
      });
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  }

  return (
    <form className="form" onSubmit={handle}>
      <label>Título*
        <input required maxLength={300} value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <div className="grid2">
        <label>Capítulos vistos
          <input type="number" min={0} max={total || undefined} value={watched} onChange={(e) => setWatched(e.target.value)} />
        </label>
        <label>Total de capítulos
          <input type="number" min={0} placeholder="Desconocido" value={total} onChange={(e) => setTotal(e.target.value)} />
        </label>
      </div>
      <div className="grid2">
        <label>Estado
          <select value={status} onChange={(e) => setStatus(e.target.value as AnimeStatus)}>
            {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label className="check">
          <input type="checkbox" checked={favorite} onChange={(e) => setFavorite(e.target.checked)} /> Favorito ★
        </label>
      </div>
      <label>URL de portada
        <input type="url" placeholder="https://…" value={cover} onChange={(e) => setCover(e.target.value)} />
      </label>
      <label>Dónde lo ves (URL)
        <input type="url" placeholder="https://…" value={source} onChange={(e) => setSource(e.target.value)} />
      </label>
      <label>Notas
        <textarea rows={3} maxLength={5000} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
      {error && <p className="error">{error}</p>}
      <button className="btn primary" disabled={saving}>{saving ? 'Guardando…' : submitLabel}</button>
    </form>
  );
}
