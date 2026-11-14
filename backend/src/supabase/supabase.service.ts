import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient, User } from '@supabase/supabase-js';

/**
 * Crea clientes de Supabase "por usuario": se usa la anon key + el JWT del usuario,
 * así las políticas RLS de Postgres se aplican en cada consulta.
 */
@Injectable()
export class SupabaseService {
  private readonly url: string;
  private readonly anonKey: string;
  private readonly authClient: SupabaseClient;

  constructor(config: ConfigService) {
    this.url = config.getOrThrow<string>('SUPABASE_URL');
    this.anonKey = config.getOrThrow<string>('SUPABASE_ANON_KEY');
    this.authClient = createClient(this.url, this.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  /** Cliente anónimo (para funciones públicas como la lista compartida). */
  anon(): SupabaseClient {
    return this.authClient;
  }

  /** Cliente con service role (solo tareas programadas). Null si la variable no está configurada. */
  admin(): SupabaseClient | null {
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!key) return null;
    return createClient(this.url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  }

  async getUser(accessToken: string): Promise<User | null> {
    const { data, error } = await this.authClient.auth.getUser(accessToken);
    if (error) return null;
    return data.user;
  }

  forUser(accessToken: string): SupabaseClient {
    return createClient(this.url, this.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });
  }
}
