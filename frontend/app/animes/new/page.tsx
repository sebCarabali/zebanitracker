'use client';

import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { AnimeForm } from '@/components/AnimeForm';

export default function NewAnimePage() {
  const router = useRouter();
  return (
    <main className="container">
    <div className="narrow" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <span className="eyebrow">Agregar</span>
        <h1 style={{ marginTop: 8 }}>Agregar a tu lista</h1>
        <p className="muted" style={{ marginBottom: 0 }}>Anime, manga o novela ligera: búscalo en AniList para completar portada y capítulos automáticamente.</p>
      </div>
      <AnimeForm
        submitLabel="Crear"
        onSubmit={async (input) => {
          await api.create(input);
          router.push('/');
        }}
      />
    </div>
    </main>
  );
}
