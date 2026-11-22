import {
  BadRequestException, Body, ConflictException, Controller, Delete, Get, HttpCode, NotFoundException, Param, Patch, Put, UseGuards,
} from '@nestjs/common';
import { SupabaseAuthGuard } from '../auth/auth.guard.js';
import { AccessToken, UserId } from '../auth/current-user.decorator.js';
import { SupabaseService } from '../supabase/supabase.service.js';
import { AniListService } from '../anilist/anilist.service.js';
import { ConnectAniListDto, UpdateProfileDto } from './profile.dto.js';

interface ProfileRow {
  language: string;
  ai_preferences: string | null;
  username: string | null;
  is_public: boolean;
  notify_email: boolean;
  anilist_username: string | null;
  anilist_token: string | null;
}

@Controller('profile')
@UseGuards(SupabaseAuthGuard)
export class ProfileController {
  constructor(private readonly supabase: SupabaseService, private readonly anilist: AniListService) {}

  private async read(token: string) {
    const { data, error } = await this.supabase.forUser(token).from('profiles')
      .select('username, is_public, notify_email, anilist_username, anilist_token, language, ai_preferences').maybeSingle();
    if (error) throw new BadRequestException(error.message);
    const p = (data ?? { username: null, is_public: false, notify_email: false, anilist_username: null, anilist_token: null, language: 'es', ai_preferences: null }) as ProfileRow;
    return {
      language: p.language ?? 'es',
      ai_preferences: p.ai_preferences,
      username: p.username,
      is_public: p.is_public,
      notify_email: p.notify_email,
      anilist_username: p.anilist_username,
      anilist_connected: !!p.anilist_token, // el token nunca sale del servidor
      email_notifications_available: !!(process.env.RESEND_API_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY),
    };
  }

  private async upsert(token: string, userId: string, row: Record<string, unknown>) {
    const { error } = await this.supabase.forUser(token).from('profiles').upsert({ user_id: userId, ...row });
    if (error?.code === '23505') throw new ConflictException('Ese nombre de usuario ya está en uso');
    if (error?.code === '23514') throw new BadRequestException('Nombre de usuario inválido');
    if (error) throw new BadRequestException(error.message);
  }

  @Get()
  get(@AccessToken() token: string) {
    return this.read(token);
  }

  @Patch()
  async update(@AccessToken() token: string, @UserId() userId: string, @Body() dto: UpdateProfileDto) {
    const current = await this.read(token);
    if (dto.is_public && !(dto.username ?? current.username)) {
      throw new BadRequestException('Elige un nombre de usuario antes de hacer pública tu lista');
    }
    await this.upsert(token, userId, dto as Record<string, unknown>);
    return this.read(token);
  }

  /** Conecta AniList con el token del flujo OAuth implícito (se valida contra la API). */
  @Put('anilist')
  async connectAniList(@AccessToken() token: string, @UserId() userId: string, @Body() dto: ConnectAniListDto) {
    const viewer = await this.anilist.viewer(dto.token);
    await this.upsert(token, userId, { anilist_token: dto.token, anilist_user_id: viewer.id, anilist_username: viewer.name });
    return this.read(token);
  }

  @Delete('anilist')
  @HttpCode(200)
  async disconnectAniList(@AccessToken() token: string, @UserId() userId: string) {
    await this.upsert(token, userId, { anilist_token: null, anilist_user_id: null, anilist_username: null });
    return this.read(token);
  }
}

/** Lista pública compartida (sin sesión). Solo existe si el dueño la hizo pública. */
@Controller('public')
export class PublicController {
  constructor(private readonly supabase: SupabaseService) {}

  @Get(':username')
  async list(@Param('username') username: string) {
    if (!/^[a-zA-Z0-9_]{3,24}$/.test(username)) throw new NotFoundException('Lista no encontrada');
    const { data, error } = await this.supabase.anon().rpc('public_list', { p_username: username });
    if (error) throw new BadRequestException(error.message);
    if (!data) throw new NotFoundException('Esta lista no existe o es privada');
    return data;
  }
}
