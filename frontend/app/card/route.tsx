import { ImageResponse } from 'next/og';

/**
 * Tarjeta para compartir en redes (PNG 1080×1350). El cliente manda los datos ya calculados
 * (estadísticas o top 10); aquí solo se dibujan. Las portadas solo se aceptan del CDN de AniList.
 */
interface CardItem { title: string; cover_url?: string | null; score?: number | null; note?: string | null }
interface CardBody {
  kind: 'top' | 'stats';
  title: string;
  subtitle?: string;
  name?: string;
  items?: CardItem[];
  numbers?: { value: string; label: string }[];
  highlights?: string[];
}

const CREAM = '#F9F5EB', RED = '#EA5455', ORANGE = '#F07B3F', SLATE = '#2D4059', NAVY = '#002B5B';

function safeCover(url?: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && (u.hostname === 's4.anilist.co' || u.hostname.endsWith('.anilist.co')) ? u.toString() : null;
  } catch {
    return null;
  }
}
const clip = (s: unknown, n: number) => String(s ?? '').slice(0, n);

export async function POST(req: Request) {
  let body: CardBody;
  try {
    body = (await req.json()) as CardBody;
  } catch {
    return new Response('JSON inválido', { status: 400 });
  }
  const items = (Array.isArray(body.items) ? body.items : []).slice(0, 10).map((i) => ({
    title: clip(i.title, 60), cover: safeCover(i.cover_url), score: typeof i.score === 'number' ? i.score : null, note: clip(i.note, 40),
  }));
  const numbers = (Array.isArray(body.numbers) ? body.numbers : []).slice(0, 6).map((n) => ({ value: clip(n.value, 12), label: clip(n.label, 28) }));
  const highlights = (Array.isArray(body.highlights) ? body.highlights : []).slice(0, 4).map((h) => clip(h, 110));
  const title = clip(body.title, 60);
  const subtitle = clip(body.subtitle, 80);
  const name = clip(body.name, 30);

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: NAVY, color: CREAM, padding: 64, fontSize: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: RED, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30 }}>▶</div>
          <div style={{ display: 'flex', fontSize: 30, fontWeight: 700, letterSpacing: 1 }}>ZebaniTracker</div>
          {name && <div style={{ display: 'flex', marginLeft: 'auto', fontSize: 28, color: ORANGE }}>@{name}</div>}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 44 }}>
          <div style={{ display: 'flex', fontSize: 68, fontWeight: 800, lineHeight: 1.05 }}>{title}</div>
          {subtitle && <div style={{ display: 'flex', fontSize: 32, marginTop: 14, color: '#C9D3E3' }}>{subtitle}</div>}
        </div>

        {numbers.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, marginTop: 40 }}>
            {numbers.map((n) => (
              <div key={n.label} style={{ display: 'flex', flexDirection: 'column', width: 300, padding: '22px 26px', borderRadius: 24, background: SLATE }}>
                <div style={{ display: 'flex', fontSize: 56, fontWeight: 800, color: CREAM }}>{n.value}</div>
                <div style={{ display: 'flex', fontSize: 24, color: '#C9D3E3' }}>{n.label}</div>
              </div>
            ))}
          </div>
        )}

        {highlights.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 34 }}>
            {highlights.map((h) => (
              <div key={h} style={{ display: 'flex', fontSize: 28, lineHeight: 1.3 }}><span style={{ color: ORANGE, marginRight: 14 }}>●</span>{h}</div>
            ))}
          </div>
        )}

        {items.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, marginTop: 40 }}>
            {items.map((i, idx) => (
              <div key={idx} style={{ display: 'flex', flexDirection: 'column', width: 172 }}>
                <div style={{ display: 'flex', position: 'relative', width: 172, height: 244, borderRadius: 16, overflow: 'hidden', background: SLATE }}>
                  {i.cover
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={i.cover} width={172} height={244} style={{ objectFit: 'cover' }} alt="" />
                    : <div style={{ display: 'flex', margin: 'auto', fontSize: 60 }}>{i.title.slice(0, 1)}</div>}
                  <div style={{ display: 'flex', position: 'absolute', top: 10, left: 10, width: 42, height: 42, borderRadius: 21, background: idx < 3 ? RED : CREAM, color: idx < 3 ? CREAM : NAVY, alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 800 }}>{idx + 1}</div>
                  {i.score !== null && <div style={{ display: 'flex', position: 'absolute', bottom: 10, right: 10, padding: '4px 10px', borderRadius: 10, background: ORANGE, color: NAVY, fontSize: 22, fontWeight: 800 }}>{i.score}/10</div>}
                </div>
                <div style={{ display: 'flex', fontSize: 20, marginTop: 8, lineHeight: 1.2, maxHeight: 50, overflow: 'hidden' }}>{i.title}</div>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', marginTop: 'auto', fontSize: 24, color: '#9AA4B4' }}>zebanitracker-web.vercel.app</div>
      </div>
    ),
    { width: 1080, height: 1350 },
  );
}
