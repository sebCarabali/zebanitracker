'use client';

import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useAuth } from './AuthProvider';

export function Header() {
  const { session } = useAuth();
  return (
    <header className="header">
      <Link href="/" className="brand">📺 ZebaniTracker</Link>
      {session && (
        <nav className="row">
          <Link href="/import" className="btn">Importar de AniList</Link>
          <Link href="/animes/new" className="btn primary">+ Nuevo anime</Link>
          <span className="muted small">{session.user.email}</span>
          <button className="btn ghost" onClick={() => supabase.auth.signOut()}>Salir</button>
        </nav>
      )}
    </header>
  );
}
