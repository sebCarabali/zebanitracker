'use client';

import { MEDIA_LABELS, MediaType } from '@/lib/api';

/** Selector Anime / Manga / Novela ligera. */
export function MediaTabs({ value, onChange, allowAll, counts, label = 'Tipo' }: {
  value: MediaType | 'all';
  onChange: (v: MediaType | 'all') => void;
  allowAll?: boolean;
  counts?: Partial<Record<MediaType | 'all', number>>;
  label?: string;
}) {
  const options: (MediaType | 'all')[] = allowAll ? ['all', 'anime', 'manga', 'novel'] : ['anime', 'manga', 'novel'];
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o} type="button" role="radio" aria-checked={value === o} onClick={() => onChange(o)}>
          {o === 'all' ? 'Todo' : MEDIA_LABELS[o]}
          {counts?.[o] !== undefined && <span className="badge-count">{counts[o]}</span>}
        </button>
      ))}
    </div>
  );
}
