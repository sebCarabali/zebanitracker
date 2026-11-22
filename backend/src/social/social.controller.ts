import {
  BadRequestException, Body, ConflictException, Controller, Delete, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Patch, Post, UseGuards,
} from '@nestjs/common';
import { IsInt, IsOptional, IsString, IsUrl, Length, Matches, MaxLength, Min } from 'class-validator';
import { PostgrestError } from '@supabase/supabase-js';
import { SupabaseAuthGuard } from '../auth/auth.guard.js';
import { AccessToken, UserId } from '../auth/current-user.decorator.js';
import { SupabaseService } from '../supabase/supabase.service.js';
import { AniListService } from '../anilist/anilist.service.js';
import { Anime, AnimesService } from '../animes/animes.service.js';
import { compareLists, ListItem } from './compare.js';

class FollowDto {
  @IsString() @Matches(/^[A-Za-z0-9_]{3,24}$/, { message: 'Nombre de usuario inválido' })
  username: string;
}

class CreatePartyDto {
  @IsOptional() @IsInt() @Min(1)
  anilist_id?: number;

  /** Si no viene del catálogo. */
  @IsOptional() @IsString() @Length(1, 300)
  title?: string;

  @IsOptional() @IsInt() @Min(0)
  total_episodes?: number;

  @IsOptional() @IsUrl() @MaxLength(2000)
  cover_url?: string;
}

class JoinPartyDto {
  @IsString() @Length(6, 20)
  code: string;
}

class PartyProgressDto {
  @IsInt() @Min(0)
  episode: number;
}

interface PartyRow {
  id: string;
  owner_id: string;
  anilist_id: number | null;
  title: string;
  cover_url: string | null;
  total_episodes: number | null;
  invite_code: string;
  created_at: string;
}

interface PartyMember { user_id: string; name: string; watched_episodes: number; is_me: boolean; updated_at: string }

/** Amigos (seguir listas públicas y comparar gustos) y "ver juntos". */
@Controller()
@UseGuards(SupabaseAuthGuard)
export class SocialController {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly animes: AnimesService,
    private readonly anilist: AniListService,
  ) {}

  private fail(error: PostgrestError): never {
    if (error.code === 'P0002') throw new NotFoundException(error.message);
    if (error.code === '22023') throw new BadRequestException(error.message);
    if (error.code === '23505') throw new ConflictException(error.message);
    throw new BadRequestException(error.message);
  }

  private async publicList(username: string): Promise<{ username: string; animes: ListItem[] } | null> {
    const { data, error } = await this.supabase.anon().rpc('public_list', { p_username: username.toLowerCase() });
    if (error) this.fail(error);
    return (data as { username: string; animes: ListItem[] } | null) ?? null;
  }

  // -------------------------------------------------------------------------------------------
  // Amigos
  // -------------------------------------------------------------------------------------------

  /** A quién sigues (con tu compatibilidad con cada uno) y quién te sigue. */
  @Get('social')
  async social(@AccessToken() token: string) {
    const { data, error } = await this.supabase.forUser(token).rpc('my_social');
    if (error) this.fail(error);
    const s = (data ?? { following: [], followers: [] }) as {
      following: { username: string | null; is_public: boolean; since: string }[];
      followers: { username: string | null; is_public: boolean; since: string }[];
    };
    const mine = (await this.animes.list(token, {})) as unknown as ListItem[];
    const following = await Promise.all(s.following.filter((f) => f.username).slice(0, 50).map(async (f) => {
      const theirs = f.is_public ? await this.publicList(f.username!).catch(() => null) : null;
      if (!theirs) return { username: f.username!, since: f.since, available: false, compatibility: null, common: 0, total: 0 };
      const c = compareLists(mine, theirs.animes);
      return { username: f.username!, since: f.since, available: true, compatibility: c.compatibility, common: c.common.length, total: theirs.animes.length };
    }));
    const followingSet = new Set(following.map((f) => f.username));
    return {
      following,
      followers: s.followers.filter((f) => f.username).map((f) => ({ ...f, follows_back: followingSet.has(f.username!) })),
    };
  }

  @Post('social/follow')
  async follow(@AccessToken() token: string, @Body() dto: FollowDto) {
    const { data, error } = await this.supabase.forUser(token).rpc('follow_user', { p_username: dto.username });
    if (error) this.fail(error);
    return data;
  }

  @Delete('social/follow/:username')
  @HttpCode(204)
  async unfollow(@AccessToken() token: string, @Param('username') username: string) {
    const { error } = await this.supabase.forUser(token).rpc('unfollow_user', { p_username: username });
    if (error) this.fail(error);
  }

  /** Compara tu lista con la lista pública de otra persona. */
  @Get('social/compare/:username')
  async compare(@AccessToken() token: string, @Param('username') username: string) {
    if (!/^[A-Za-z0-9_]{3,24}$/.test(username)) throw new BadRequestException('Nombre de usuario inválido');
    const theirs = await this.publicList(username);
    if (!theirs) throw new NotFoundException('Esa lista no existe o es privada');
    const mine = (await this.animes.list(token, {})) as unknown as ListItem[];
    const { data } = await this.supabase.forUser(token).rpc('my_social');
    const following = ((data as { following?: { username: string }[] } | null)?.following ?? []).some((f) => f.username === theirs.username);
    return { username: theirs.username, following, ...compareLists(mine, theirs.animes) };
  }

  // -------------------------------------------------------------------------------------------
  // Ver juntos
  // -------------------------------------------------------------------------------------------

  private async members(token: string, partyId: string): Promise<PartyMember[]> {
    const { data, error } = await this.supabase.forUser(token).rpc('party_members', { p_party: partyId });
    if (error) this.fail(error);
    return (data ?? []) as PartyMember[];
  }

  /**
   * Una "watch party" con su avance compartido: el capítulo que TODOS ya vieron.
   * Si el anime está en tu lista y el avance compartido supera el tuyo, tu lista se actualiza.
   */
  private async shape(token: string, userId: string, p: PartyRow, myList?: Anime[]) {
    const members = await this.members(token, p.id);
    const shared = members.length ? Math.min(...members.map((m) => m.watched_episodes)) : 0;
    const me = members.find((m) => m.is_me);
    let synced = false;
    const entry = p.anilist_id ? (myList ?? await this.animes.list(token, {})).find((a) => a.anilist_id === p.anilist_id) : undefined;
    if (entry && shared > entry.watched_episodes && (entry.total_episodes === null || shared <= entry.total_episodes)) {
      await this.animes.markRange(token, entry.id, entry.watched_episodes + 1, shared).catch(() => null);
      synced = true;
    }
    return {
      ...p,
      is_owner: p.owner_id === userId,
      members,
      shared_progress: shared,
      my_progress: me?.watched_episodes ?? 0,
      waiting_for: members.filter((m) => m.watched_episodes === shared && members.some((o) => o.watched_episodes > shared)).map((m) => m.name),
      in_my_list: !!entry,
      list_synced: synced,
    };
  }

  @Get('parties')
  async parties(@AccessToken() token: string, @UserId() userId: string) {
    const { data, error } = await this.supabase.forUser(token).from('watch_parties').select('*').order('created_at', { ascending: false });
    if (error) this.fail(error);
    const list = await this.animes.list(token, {});
    return Promise.all(((data ?? []) as PartyRow[]).map((p) => this.shape(token, userId, p, list)));
  }

  @Post('parties')
  async createParty(@AccessToken() token: string, @UserId() userId: string, @Body() dto: CreatePartyDto) {
    let row: Partial<PartyRow> = { title: dto.title, total_episodes: dto.total_episodes ?? null, cover_url: dto.cover_url ?? null };
    if (dto.anilist_id) {
      const m = (await this.anilist.byIds([dto.anilist_id])).get(dto.anilist_id);
      if (!m) throw new NotFoundException('Anime no encontrado en AniList');
      row = { anilist_id: m.anilist_id, title: m.title, total_episodes: m.total_episodes, cover_url: m.cover_url };
    }
    if (!row.title) throw new BadRequestException('Elige un anime o escribe un título');
    const db = this.supabase.forUser(token);
    const { data, error } = await db.from('watch_parties').insert({ ...row, owner_id: userId }).select().single();
    if (error) this.fail(error);
    const party = data as PartyRow;
    // Empiezas desde donde vas en tu lista (si lo tienes)
    const mine = party.anilist_id ? (await this.animes.list(token, {})).find((a) => a.anilist_id === party.anilist_id) : undefined;
    const { error: mErr } = await db.from('watch_party_members').insert({ party_id: party.id, user_id: userId, watched_episodes: mine?.watched_episodes ?? 0 });
    if (mErr) this.fail(mErr);
    return this.shape(token, userId, party);
  }

  @Post('parties/join')
  async join(@AccessToken() token: string, @UserId() userId: string, @Body() dto: JoinPartyDto) {
    const { data, error } = await this.supabase.forUser(token).rpc('join_party', { p_code: dto.code });
    if (error) this.fail(error);
    return this.party(token, userId, data as string);
  }

  @Get('parties/:id')
  async party(@AccessToken() token: string, @UserId() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    const { data, error } = await this.supabase.forUser(token).from('watch_parties').select('*').eq('id', id).maybeSingle();
    if (error) this.fail(error);
    if (!data) throw new NotFoundException('Grupo no encontrado');
    return this.shape(token, userId, data as PartyRow);
  }

  /** Tu avance dentro del grupo (el compartido es el mínimo de todos). */
  @Patch('parties/:id/progress')
  async progress(@AccessToken() token: string, @UserId() userId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PartyProgressDto) {
    const { data: p } = await this.supabase.forUser(token).from('watch_parties').select('total_episodes').eq('id', id).maybeSingle();
    if (!p) throw new NotFoundException('Grupo no encontrado');
    const total = (p as { total_episodes: number | null }).total_episodes;
    if (total !== null && dto.episode > total) throw new BadRequestException(`El anime tiene ${total} capítulos`);
    const { error, count } = await this.supabase.forUser(token).from('watch_party_members')
      .update({ watched_episodes: dto.episode }, { count: 'exact' }).eq('party_id', id).eq('user_id', userId);
    if (error) this.fail(error);
    if (!count) throw new NotFoundException('No eres miembro de este grupo');
    return this.party(token, userId, id);
  }

  /** El dueño borra el grupo; los demás lo abandonan. */
  @Delete('parties/:id')
  @HttpCode(204)
  async leave(@AccessToken() token: string, @UserId() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    const db = this.supabase.forUser(token);
    const { data } = await db.from('watch_parties').select('owner_id').eq('id', id).maybeSingle();
    if (!data) throw new NotFoundException('Grupo no encontrado');
    const { error } = (data as { owner_id: string }).owner_id === userId
      ? await db.from('watch_parties').delete().eq('id', id)
      : await db.from('watch_party_members').delete().eq('party_id', id).eq('user_id', userId);
    if (error) this.fail(error);
  }
}
