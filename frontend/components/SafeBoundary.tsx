'use client';

import { Component, type ReactNode } from 'react';

/** Aísla secciones opcionales (IA, temporadas…): si fallan, el resto de la página sigue funcionando. */
export class SafeBoundary extends Component<{ children: ReactNode; fallback?: ReactNode; name?: string }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error(`[${this.props.name ?? 'sección'}]`, error);
  }

  render() {
    return this.state.failed ? (this.props.fallback ?? null) : this.props.children;
  }
}
