'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from './AuthProvider';
import { PlayIcon, PlusIcon } from './Icons';

const NAV = [
  { href: '/', label: 'Mi lista' },
  { href: '/explore', label: 'Explorar' },
  { href: '/import', label: 'Importar' },
];

export function Brand() {
  return (
    <Link href="/" className="brand">
      <span className="brand-mark" style={{ color: 'var(--on-accent)' }}><PlayIcon size={16} /></span>
      Zebani
    </Link>
  );
}

export function Header() {
  const { session } = useAuth();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  if (!session) return null;
  const email = session.user.email ?? '';

  return (
    <header className="header">
      <Brand />
      <nav className="nav" aria-label="Principal">
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} className={pathname === n.href ? 'active' : ''} aria-current={pathname === n.href ? 'page' : undefined}>
            {n.label}
          </Link>
        ))}
      </nav>
      <div className="header-actions">
        <Link href="/animes/new" className="btn primary"><PlusIcon /> <span className="label">Agregar anime</span></Link>
        <div className="menu" ref={menuRef}>
          <button className="avatar" aria-label="Cuenta" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            {email.slice(0, 1)}
          </button>
          {open && (
            <div className="menu-pop">
              <p className="muted small">{email}</p>
              <button className="btn ghost" onClick={() => supabase.auth.signOut()}>Cerrar sesión</button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
