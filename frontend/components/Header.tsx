'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from './AuthProvider';
import {
  CalendarIcon, ChartIcon, CompassIcon, HomeIcon, PlayIcon, PlusIcon, QueueIcon, SettingsIcon, TogetherIcon, UsersIcon,
} from './Icons';

const NAV = [
  { href: '/', label: 'Mi lista', icon: HomeIcon },
  { href: '/plan', label: 'Planeo ver', icon: QueueIcon },
  { href: '/explore', label: 'Explorar', icon: CompassIcon },
  { href: '/calendar', label: 'Calendario', icon: CalendarIcon },
  { href: '/friends', label: 'Amigos', icon: UsersIcon },
  { href: '/together', label: 'Ver juntos', icon: TogetherIcon },
  { href: '/stats', label: 'Estadísticas', icon: ChartIcon },
];
/** En el celular: barra inferior con lo más usado; el resto va en el menú de la cuenta. */
const MOBILE = ['/', '/explore', '/plan', '/stats'];

export function Brand() {
  return (
    <Link href="/" className="brand" aria-label="ZebaniTracker, inicio">
      <span className="brand-mark"><PlayIcon size={14} /></span>
      <span className="brand-name">Zebani</span>
    </Link>
  );
}

export function Header() {
  const { session } = useAuth();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  useEffect(() => { setTheme(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'); }, []);
  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.dataset.theme = next;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', next === 'dark' ? '#0A1322' : '#F9F5EB');
    try { localStorage.setItem('zt-theme', next); } catch {}
  }
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  useEffect(() => setOpen(false), [pathname]);

  if (!session) return null;
  const email = session.user.email ?? '';
  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));
  const mobile = NAV.filter((n) => MOBILE.includes(n.href));
  const more = NAV.filter((n) => !MOBILE.includes(n.href));

  return (
    <>
      <header className="header">
        <Brand />
        <nav className="nav" aria-label="Principal">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className={isActive(n.href) ? 'active' : ''} aria-current={isActive(n.href) ? 'page' : undefined}>
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="header-actions">
          <Link href="/animes/new" className="btn primary add-btn" aria-label="Agregar a mi lista"><PlusIcon /> <span className="label">Agregar</span></Link>
          <div className="menu" ref={menuRef}>
            <button className="avatar" aria-label="Cuenta y más secciones" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
              {email.slice(0, 1)}
            </button>
            {open && (
              <div className="menu-pop">
                <p className="muted small">{email}</p>
                <div className="menu-more">
                  {more.map((n) => (
                    <Link key={n.href} href={n.href} className={`menu-item ${isActive(n.href) ? 'active' : ''}`}><n.icon size={18} /> {n.label}</Link>
                  ))}
                  <hr />
                </div>
                <button className="menu-item theme-toggle" role="switch" aria-checked={theme === 'dark'} onClick={toggleTheme}>
                  {theme === 'dark' ? '☾' : '☀'} Modo oscuro <span className="knob">{theme === 'dark' ? 'Activado' : 'Desactivado'}</span>
                </button>
                <Link href="/settings" className="menu-item"><SettingsIcon /> Ajustes</Link>
                <Link href="/import" className="menu-item"><QueueIcon size={18} /> Importar y exportar</Link>
                <button className="menu-item" onClick={() => supabase.auth.signOut()}>Cerrar sesión</button>
              </div>
            )}
          </div>
        </div>
      </header>

      <nav className="tabbar" aria-label="Navegación rápida">
        {mobile.slice(0, 2).map((n) => (
          <Link key={n.href} href={n.href} className={isActive(n.href) ? 'active' : ''} aria-current={isActive(n.href) ? 'page' : undefined}>
            <n.icon /><span>{n.label}</span>
          </Link>
        ))}
        <Link href="/animes/new" className="tabbar-add" aria-label="Agregar a mi lista"><PlusIcon size={22} /></Link>
        {mobile.slice(2).map((n) => (
          <Link key={n.href} href={n.href} className={isActive(n.href) ? 'active' : ''} aria-current={isActive(n.href) ? 'page' : undefined}>
            <n.icon /><span>{n.label === 'Estadísticas' ? 'Stats' : n.label}</span>
          </Link>
        ))}
      </nav>
    </>
  );
}
