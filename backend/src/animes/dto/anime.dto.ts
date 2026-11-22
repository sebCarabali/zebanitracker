import { PartialType } from '@nestjs/mapped-types';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayUnique, ValidateNested, IsArray, IsBoolean, Matches, Length, Max, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, IsUrl, MaxLength, Min,
} from 'class-validator';

export enum AnimeStatus {
  Watching = 'watching',
  Completed = 'completed',
  PlanToWatch = 'plan_to_watch',
  OnHold = 'on_hold',
  Dropped = 'dropped',
}

export class CreateAnimeDto {
  @IsString() @IsNotEmpty() @MaxLength(300)
  title: string;

  @IsOptional() @IsInt() @Min(0)
  total_episodes?: number | null;

  @IsOptional() @IsInt() @Min(0)
  watched_episodes?: number;

  @IsOptional() @IsEnum(AnimeStatus)
  status?: AnimeStatus;

  @IsOptional() @IsBoolean()
  is_favorite?: boolean;

  @IsOptional() @IsUrl()
  cover_url?: string | null;

  @IsOptional() @IsUrl({ require_tld: false })
  source_url?: string | null;

  @IsOptional() @IsString() @MaxLength(5000)
  notes?: string | null;

  /** Puntuación personal 1-10. */
  @IsOptional() @IsInt() @Min(1) @Max(10)
  score?: number | null;

  @IsOptional() @IsString() @MaxLength(5000)
  review?: string | null;

  /** URL del último capítulo visto (para "abrir siguiente"). */
  @IsOptional() @IsUrl({ require_tld: false }) @MaxLength(2000)
  last_episode_url?: string | null;

  /** ID del anime en AniList (si se eligió del catálogo). */
  @IsOptional() @IsInt() @Min(1)
  anilist_id?: number | null;

  /** anime, manga o novel (para manga y novelas los "capítulos" son capítulos del libro). */
  @IsOptional() @IsEnum(['anime', 'manga', 'novel'])
  media_type?: 'anime' | 'manga' | 'novel';

  @IsOptional() @IsInt() @Min(0)
  total_volumes?: number | null;

  @IsOptional() @IsInt() @Min(0)
  watched_volumes?: number;

  /** Etiquetas / listas personalizadas: "Para ver con amigos", "Clásicos"… */
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) @Length(1, 30, { each: true })
  tags?: string[];

  /** Orden en "Planeo ver" (menor = primero). */
  @IsOptional() @IsInt() @Min(0) @Max(100000)
  priority?: number | null;
}

export class UpdateAnimeDto extends PartialType(CreateAnimeDto) {}

export class SetProgressDto {
  /** Número del último capítulo visto (0 = ninguno). */
  @IsInt() @Min(0)
  episode: number;

  /** Página donde se vio (la extensión la envía). */
  @IsOptional() @IsUrl({ require_tld: false }) @MaxLength(2000)
  url?: string;
}

export class ListAnimesQuery {
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  favorite?: boolean;

  @IsOptional() @IsEnum(AnimeStatus)
  status?: AnimeStatus;

  @IsOptional() @IsString() @MaxLength(100)
  search?: string;

  @IsOptional() @IsEnum(['anime', 'manga', 'novel'])
  media?: 'anime' | 'manga' | 'novel';

  @IsOptional() @IsString() @MaxLength(30)
  tag?: string;
}

export class MarkRangeDto {
  @IsInt() @Min(1) @Max(5000)
  from: number;

  @IsInt() @Min(1) @Max(5000)
  to: number;

  /** Cuándo los viste (ISO). Por defecto, ahora. */
  @IsOptional() @IsString() @Matches(/^\d{4}-\d{2}-\d{2}/)
  watched_at?: string;
}

export class ReorderDto {
  /** IDs de "Planeo ver" en el orden deseado. */
  @IsArray() @ArrayMaxSize(1000) @IsString({ each: true })
  ids: string[];
}

export class StaleActionDto {
  @IsEnum(['resume', 'drop', 'snooze'])
  action: 'resume' | 'drop' | 'snooze';
}

export class RewatchDto {
  /** Fecha en que terminaste ese rewatch (ISO). Por defecto, ahora. */
  @IsOptional() @IsString() @Matches(/^\d{4}-\d{2}-\d{2}/)
  finished_at?: string;

  @IsOptional() @IsString() @MaxLength(500)
  note?: string;
}

export enum AniListStatus {
  Current = 'CURRENT',
  Planning = 'PLANNING',
  Completed = 'COMPLETED',
  Dropped = 'DROPPED',
  Paused = 'PAUSED',
  Repeating = 'REPEATING',
}

export class ImportAniListDto {
  @IsString() @Length(2, 20) @Matches(/^[A-Za-z0-9_-]+$/, { message: 'Nombre de usuario de AniList inválido' })
  username: string;

  /** Estados a importar; por defecto todos. */
  @IsOptional() @IsArray() @ArrayUnique() @IsEnum(AniListStatus, { each: true })
  statuses?: AniListStatus[];

  /** Marcar como favoritos los favoritos de AniList (por defecto sí). */
  @IsOptional() @IsBoolean()
  include_favorites?: boolean;
}

export class SyncEpisodesDto {
  @IsOptional() @IsBoolean()
  force?: boolean;
}

export class ImportMalDto {
  /** Contenido del XML exportado desde MyAnimeList. */
  @IsString() @MaxLength(5_000_000)
  xml: string;
}

export class AddManyItem {
  @IsInt() @Min(1)
  anilist_id: number;

  @IsEnum(AnimeStatus)
  status: AnimeStatus;
}

export class AddManyDto {
  @IsArray() @ArrayMaxSize(30) @ValidateNested({ each: true }) @Type(() => AddManyItem)
  items: AddManyItem[];
}
