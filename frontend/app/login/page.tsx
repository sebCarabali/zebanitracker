'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';

type Mode = 'login' | 'signup' | 'magic';

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: 'error' | 'ok'; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        if (!data.session) setMsg({ type: 'ok', text: 'Revisa tu correo para confirmar la cuenta.' });
      } else {
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        setMsg({ type: 'ok', text: 'Te enviamos un enlace de acceso a tu correo.' });
      }
    } catch (err) {
      setMsg({ type: 'error', text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <h1>{mode === 'signup' ? 'Crear cuenta' : 'Iniciar sesión'}</h1>
      <div className="tabs">
        <button className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>Contraseña</button>
        <button className={mode === 'magic' ? 'active' : ''} onClick={() => setMode('magic')}>Enlace mágico</button>
        <button className={mode === 'signup' ? 'active' : ''} onClick={() => setMode('signup')}>Registrarse</button>
      </div>
      <form className="form" onSubmit={submit}>
        <label>Correo
          <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        {mode !== 'magic' && (
          <label>Contraseña
            <input
              type="password" required minLength={6}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              value={password} onChange={(e) => setPassword(e.target.value)}
            />
          </label>
        )}
        {msg && <p className={msg.type === 'error' ? 'error' : 'ok'}>{msg.text}</p>}
        <button className="btn primary" disabled={busy}>
          {busy ? '…' : mode === 'login' ? 'Entrar' : mode === 'signup' ? 'Crear cuenta' : 'Enviar enlace'}
        </button>
      </form>
    </div>
  );
}
