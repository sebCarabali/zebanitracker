'use client';

import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { AnimeForm } from '@/components/AnimeForm';

export default function NewAnimePage() {
  const router = useRouter();
  return (
    <div className="narrow">
      <h1>Nuevo anime</h1>
      <AnimeForm
        submitLabel="Crear"
        onSubmit={async (input) => {
          await api.create(input);
          router.push('/');
        }}
      />
    </div>
  );
}
