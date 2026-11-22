import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service.js';

/**
 * Caché clave → JSON para respuestas de IA (resúmenes para retomar, resumen del mes…).
 * Memoria (LRU) + tabla `ai_cache` con service role, con deduplicación de peticiones simultáneas.
 */
@Injectable()
export class AiCacheService {
  private readonly logger = new Logger(AiCacheService.name);
  private readonly memory = new Map<string, { at: number; value: unknown }>();
  private readonly inflight = new Map<string, Promise<unknown>>();
  private static readonly MAX = 500;

  constructor(private readonly supabase: SupabaseService) {}

  private remember(key: string, value: unknown) {
    this.memory.delete(key);
    this.memory.set(key, { at: Date.now(), value });
    if (this.memory.size > AiCacheService.MAX) this.memory.delete(this.memory.keys().next().value!);
  }

  /** Devuelve lo guardado (si no venció) o genera, guarda y devuelve. `produce` puede devolver null (no se guarda). */
  async get<T>(key: string, ttlMs: number, produce: () => Promise<T | null>): Promise<{ value: T | null; cached: boolean }> {
    const hit = this.memory.get(key);
    if (hit && Date.now() - hit.at < ttlMs) return { value: hit.value as T, cached: true };

    const admin = this.supabase.admin();
    if (admin) {
      const { data } = await admin.from('ai_cache').select('value, created_at').eq('key', key).maybeSingle();
      const row = data as { value: T; created_at: string } | null;
      if (row && Date.now() - new Date(row.created_at).getTime() < ttlMs) {
        this.remember(key, row.value);
        return { value: row.value, cached: true };
      }
    }

    const running = this.inflight.get(key) as Promise<T | null> | undefined;
    if (running) return { value: await running, cached: true };
    const p = produce();
    this.inflight.set(key, p);
    try {
      const value = await p;
      if (value !== null) {
        this.remember(key, value);
        if (admin) {
          const { error } = await admin.from('ai_cache').upsert({ key, value, created_at: new Date().toISOString() });
          if (error) this.logger.warn(`No se pudo guardar ${key}: ${error.message}`);
        }
      }
      return { value, cached: false };
    } finally {
      this.inflight.delete(key);
    }
  }

  /** Sin pasar por la IA: solo lo que ya está guardado. */
  async peek<T>(key: string, ttlMs: number): Promise<T | null> {
    const hit = this.memory.get(key);
    if (hit && Date.now() - hit.at < ttlMs) return hit.value as T;
    const admin = this.supabase.admin();
    if (!admin) return null;
    const { data } = await admin.from('ai_cache').select('value, created_at').eq('key', key).maybeSingle();
    const row = data as { value: T; created_at: string } | null;
    return row && Date.now() - new Date(row.created_at).getTime() < ttlMs ? row.value : null;
  }
}
