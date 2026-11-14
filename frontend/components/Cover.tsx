const TONES = ['#3B5B7A', '#7A3B5E', '#3B6B55', '#3D3B7A', '#6B3B3B', '#7A5A2E', '#2E6A7A', '#5A3B7A'];

/** Tono estable a partir del título, para portadas sin imagen. */
export function toneFor(title: string): string {
  let h = 0;
  for (const c of title) h = (h * 31 + c.charCodeAt(0)) | 0;
  return TONES[Math.abs(h) % TONES.length];
}

export function Cover({ src, title, className = '', children }: {
  src?: string | null;
  title: string;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={`cover ${className}`} style={{ background: toneFor(title) }}>
      {src ? <img src={src} alt="" loading="lazy" /> : <span className="initial" aria-hidden="true">{title.slice(0, 1)}</span>}
      {children}
    </div>
  );
}
