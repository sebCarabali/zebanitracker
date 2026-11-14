import { PartialType } from '@nestjs/mapped-types';
import { Transform } from 'class-transformer';
import {
  ArrayUnique, IsArray, IsBoolean, Matches, Length, Max, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, IsUrl, MaxLength, Min,
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
