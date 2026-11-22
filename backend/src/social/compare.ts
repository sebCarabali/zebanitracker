/** Elemento de lista (propia o pública) con lo necesario para comparar. */
export interface ListItem {
  title: string;
  cover_url: string | null;
  status: string;
  score: number | null;
  anilist_id: number | null;
  genres: string[];
  studios?: string[];
  is_favorite: boolean;
  media_type?: string;
  watched_episodes: number;
}

const counted = (s: string) => s !== 'plan_to_watch';

/** Vector de géneros ponderado: puntuación alta y favoritos pesan más; abandonados restan. */
function genreVector(list: ListItem[]) {
  const v = new Map<string, number>();
  for (const a of list) {
    if (!counted(a.status)) continue;
    const w = a.status === 'dropped' ? -0.5 : (a.score ? a.score / 7 : 1) * (a.is_favorite ? 1.5 : 1);
    for (const g of a.genres ?? []) v.set(g, (v.get(g) ?? 0) + w);
  }
  return v;
}

function cosine(a: Map<string, number>, b: Map<string, number>) {
  let dot = 0, na = 0, nb = 0;
  for (const [k, x] of a) { na += x * x; dot += x * (b.get(k) ?? 0); }
  for (const x of b.values()) nb += x * x;
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

/**
 * Compatibilidad 0-100 entre dos listas:
 * - 50 % parecido de géneros (coseno ponderado por puntuación y favoritos)
 * - 30 % acuerdo en puntuaciones de lo que ambos vieron (si hay ≥ 3 en común con nota)
 * - 20 % solapamiento de títulos (Jaccard)
 */
export function compareLists(mine: ListItem[], theirs: ListItem[]) {
  const mineById = new Map(mine.filter((a) => a.anilist_id).map((a) => [a.anilist_id!, a]));
  const theirsById = new Map(theirs.filter((a) => a.anilist_id).map((a) => [a.anilist_id!, a]));
  const commonIds = [...mineById.keys()].filter((id) => theirsById.has(id));
  const common = commonIds.map((id) => {
    const m = mineById.get(id)!, t = theirsById.get(id)!;
    return {
      anilist_id: id, title: m.title, cover_url: m.cover_url ?? t.cover_url,
      my_score: m.score, their_score: t.score, my_status: m.status, their_status: t.status,
      both_favorite: m.is_favorite && t.is_favorite,
    };
  }).sort((a, b) => Number(b.both_favorite) - Number(a.both_favorite) || ((b.my_score ?? 0) + (b.their_score ?? 0)) - ((a.my_score ?? 0) + (a.their_score ?? 0)));

  const genre = cosine(genreVector(mine), genreVector(theirs));
  const scored = common.filter((c) => c.my_score && c.their_score);
  const agreement = scored.length >= 3
    ? 1 - scored.reduce((s, c) => s + Math.abs(c.my_score! - c.their_score!), 0) / scored.length / 9
    : null;
  const watchedMine = [...mineById.values()].filter((a) => counted(a.status)).length;
  const watchedTheirs = [...theirsById.values()].filter((a) => counted(a.status)).length;
  const union = watchedMine + watchedTheirs - common.filter((c) => counted(c.my_status) && counted(c.their_status)).length;
  const jaccard = union ? common.filter((c) => counted(c.my_status) && counted(c.their_status)).length / union : 0;
  // El solapamiento suele ser bajo aunque los gustos coincidan: se escala (30 % en común ya cuenta como pleno)
  const overlap = Math.min(1, jaccard / 0.3);
  const raw = agreement === null ? 0.7 * Math.max(0, genre) + 0.3 * overlap : 0.5 * Math.max(0, genre) + 0.3 * agreement + 0.2 * overlap;
  const enough = watchedMine >= 3 && watchedTheirs >= 3;

  const topGenres = (list: ListItem[]) => [...genreVector(list)].filter(([, w]) => w > 0).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([g]) => g);
  const mineGenres = topGenres(mine), theirGenres = topGenres(theirs);

  // Lo que ellos puntuaron alto o marcaron favorito y tú no tienes
  const fromThem = theirs
    .filter((t) => t.anilist_id && !mineById.has(t.anilist_id) && t.status !== 'dropped' && t.status !== 'plan_to_watch' && (t.is_favorite || (t.score ?? 0) >= 8))
    .sort((a, b) => Number(b.is_favorite) - Number(a.is_favorite) || (b.score ?? 0) - (a.score ?? 0))
    .slice(0, 12)
    .map((t) => ({ anilist_id: t.anilist_id!, title: t.title, cover_url: t.cover_url, score: t.score, is_favorite: t.is_favorite }));

  const disagreements = scored
    .filter((c) => Math.abs(c.my_score! - c.their_score!) >= 4)
    .sort((a, b) => Math.abs(b.my_score! - b.their_score!) - Math.abs(a.my_score! - a.their_score!))
    .slice(0, 5);

  return {
    compatibility: enough ? Math.round(Math.max(0, Math.min(1, raw)) * 100) : null,
    breakdown: { genres: Math.round(Math.max(0, genre) * 100), scores: agreement === null ? null : Math.round(agreement * 100), overlap: Math.round(jaccard * 100) },
    common,
    shared_genres: mineGenres.filter((g) => theirGenres.includes(g)),
    my_top_genres: mineGenres,
    their_top_genres: theirGenres,
    recommended_from_them: fromThem,
    disagreements,
  };
}
