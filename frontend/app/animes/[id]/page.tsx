'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, Anime } from '@/lib/api';
import { useAuth } from '@/components/AuthProvider';
import { AnimeForm } from '@/components/AnimeForm';
import { ProgressBar } from '@/components/AnimeCard';

export default function EditAnimePage() {
  const { id } = useParams<{ id: string }>();
  const { session } = useAuth();
  const router = useRouter();
  const [anime, setAnime] = useState<Anime | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (session) api.get(id).then(setAnime).catch((e) => setError(e.message));
  }, [id, session]);

  if (error) return <p className="error">{error}</p>;
  if (!anime) return <p className="muted">Cargando…</p>;

  return (
    <div className="narrow">
      <h1>Editar: {anime.title}</h1>
      <ProgressBar watched={anime.watched_episodes} total={anime.total_episodes} />
      {anime.last_watched_at && (
        <p className="muted small">Último capítulo marcado: {new Date(anime.last_watched_at).toLocaleString('es')}</p>
      )}
      <AnimeForm
        initial={anime}
        submitLabel="Guardar cambios"
        onSubmit={async (input) => {
          await api.update(anime.id, input);
          router.push('/');
        }}
      />
    </div>
  );
}
