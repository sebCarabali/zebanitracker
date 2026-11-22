'use client';

import { useId, useState } from 'react';

export const SUGGESTED_TAGS = ['Para ver con amigos', 'Clásicos', 'Rewatch', 'Comfort', 'Joyas ocultas', 'Para maratonear'];

/** Etiquetas / listas personalizadas con sugerencias y autocompletado de las que ya usas. */
export function TagEditor({ value, onChange, known = [], disabled }: {
  value: string[];
  onChange: (tags: string[]) => void;
  known?: string[];
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState('');
  const listId = useId();
  const has = (t: string) => value.some((v) => v.toLowerCase() === t.toLowerCase());
  const add = (raw: string) => {
    const t = raw.trim().replace(/\s+/g, ' ').slice(0, 30);
    if (!t || has(t) || value.length >= 20) return;
    onChange([...value, t]);
    setDraft('');
  };
  const suggestions = [...new Set([...known, ...SUGGESTED_TAGS])].filter((t) => !has(t)).slice(0, 8);

  return (
    <div className="tag-editor">
      <div className="chips">
        {value.map((t) => (
          <span key={t} className="chip on">
            {t}
            <button type="button" aria-label={`Quitar ${t}`} disabled={disabled} onClick={() => onChange(value.filter((x) => x !== t))}>×</button>
          </span>
        ))}
        {!value.length && <span className="muted small">Sin listas todavía</span>}
      </div>
      <div className="row">
        <input list={listId} placeholder="Nueva lista o etiqueta…" maxLength={30} value={draft} disabled={disabled}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(draft); } }} />
        <button type="button" className="btn" disabled={disabled || !draft.trim()} onClick={() => add(draft)}>Agregar</button>
        <datalist id={listId}>{known.map((t) => <option key={t} value={t} />)}</datalist>
      </div>
      {suggestions.length > 0 && (
        <div className="chips">
          {suggestions.map((t) => (
            <button key={t} type="button" className="chip" disabled={disabled} onClick={() => add(t)}>+ {t}</button>
          ))}
        </div>
      )}
    </div>
  );
}
