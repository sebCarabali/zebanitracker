'use client';

/** Puntuación 1-10. Tocar la nota actual la quita. */
export function Stars({ value, onChange, disabled }: { value: number | null; onChange: (v: number | null) => void; disabled?: boolean }) {
  return (
    <div className="stars" role="radiogroup" aria-label="Tu puntuación del 1 al 10">
      {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
        <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} de 10`}
          className={value !== null && n <= value ? 'on' : ''} disabled={disabled}
          onClick={() => onChange(value === n ? null : n)}>
          {n}
        </button>
      ))}
    </div>
  );
}
