import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { SupabaseService } from '../supabase/supabase.service.js';

export type CacheSource = 'memory' | 'shared' | 'user' | 'new';

interface Entry { text: string; hash: string; at: number }

/**
 * Caché de traducciones en tres niveles:
 *  1. Memoria de la instancia (LRU, 24 h) + deduplicación de traducciones en curso.
 *  2. Tabla compartida `translation_cache` (todos los usuarios; solo el servidor escribe, con service role).
 *  3. Si no hay service role: tabla por usuario `ai_translations` (RLS).
 * Cada entrada guarda el hash del texto original: si AniList cambia la sinopsis, se vuelve a traducir.
 */
@Injectable()
export class TranslationCacheService {
  private readonly logger = new Logger(TranslationCacheService.name);
  private readonly memory = new Map<string, Entry>();
  private readonly inflight = new Map<string, Promise<string>>();
  private static readonly MAX = 500;
  private static readonly TTL = 24 * 3600_000;

  constructor(private readonly supabase: SupabaseService) {}

  static hash(text: string) {
    return createHash('sha256').update(text).digest('hex').slice(0, 16);
  }

  private remember(key: string, text: string, hash: string) {
    this.memory.delete(key); // re-insertar = más reciente (orden LRU del Map)
    this.memory.set(key, { text, hash, at: Date.now() });
    if (this.memory.size > TranslationCacheService.MAX) this.memory.delete(this.memory.keys().next().value!);
  }

  async get(opts: {
    anilistId: number;
    lang: string;
    original: string;
    userToken: string;
    userId: string;
    model: () => string;
    translate: () => Promise<string>;
    /** Se llama solo si hay que traducir de verdad (para aplicar el límite diario). */
    beforeTranslate?: () => void;
  }): Promise<{ text: string; cache: CacheSource }> {
    const { anilistId, lang, original } = opts;
    const key = `${anilistId}:${lang}`;
    const hash = TranslationCacheService.hash(original);

    // 1. Memoria
    const mem = this.memory.get(key);
    if (mem && mem.hash === hash && Date.now() - mem.at < TranslationCacheService.TTL) {
      this.remember(key, mem.text, hash);
      return { text: mem.text, cache: 'memory' };
    }

    // 2. Compartida (service role) o 3. por usuario
    const admin = this.supabase.admin();
    if (admin) {
      const { data } = await admin.from('translation_cache').select('text, source_hash, hits')
        .eq('anilist_id', anilistId).eq('lang', lang).maybeSingle();
      const row = data as { text: string; source_hash: string; hits: number } | null;
      if (row && row.source_hash === hash) {
        this.remember(key, row.text, hash);
        void admin.from('translation_cache').update({ hits: row.hits + 1 }).eq('anilist_id', anilistId).eq('lang', lang);
        return { text: row.text, cache: 'shared' };
      }
    } else {
      const { data } = await this.supabase.forUser(opts.userToken).from('ai_translations').select('text')
        .eq('anilist_id', anilistId).eq('lang', lang).maybeSingle();
      const row = data as { text: string } | null;
      if (row) {
        this.remember(key, row.text, hash);
        return { text: row.text, cache: 'user' };
      }
    }

    // Traducción nueva; si ya hay una en curso para la misma clave, se espera esa (no se paga dos veces)
    let pending = this.inflight.get(key);
    if (!pending) {
      opts.beforeTranslate?.();
      pending = opts.translate().finally(() => this.inflight.delete(key));
      this.inflight.set(key, pending);
    }
    const text = await pending;
    this.remember(key, text, hash);

    if (admin) {
      const { error } = await admin.from('translation_cache')
        .upsert({ anilist_id: anilistId, lang, source_hash: hash, text, model: opts.model(), hits: 0, created_at: new Date().toISOString() });
      if (error) this.logger.warn(`No se pudo guardar en la caché compartida: ${error.message}`);
    } else {
      await this.supabase.forUser(opts.userToken).from('ai_translations')
        .upsert({ user_id: opts.userId, anilist_id: anilistId, lang, text });
    }
    return { text, cache: 'new' };
  }

  stats() {
    return { memory: this.memory.size, inflight: this.inflight.size, shared: !!this.supabase.admin() };
  }
}
