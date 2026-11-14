// Tonos derivados de la paleta (#002B5B, #2D4059, #EA5455, #F07B3F) para portadas sin imagen
const TONES = ['#002B5B', '#2D4059', '#C73E40', '#D9662C', '#1D4473', '#3E5677', '#A8383A', '#B85A28'];

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
