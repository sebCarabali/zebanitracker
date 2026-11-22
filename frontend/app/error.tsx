'use client';

import Link from 'next/link';
import { useEffect } from 'react';

/** Error inesperado en una página: mensaje claro y opción de reintentar sin perder la sesión. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <main className="container">
      <div className="empty" style={{ maxWidth: 560, margin: '10vh auto' }}>
        <h1 style={{ fontSize: '1.6rem', marginBottom: 8 }}>Algo salió mal</h1>
        <p style={{ margin: 0 }}>Esta página tuvo un problema al cargar. Tus datos están a salvo.</p>
        <div className="row">
          <button className="btn primary" onClick={reset}>Reintentar</button>
          <Link href="/" className="btn">Ir a Mi lista</Link>
        </div>
      </div>
    </main>
  );
}
