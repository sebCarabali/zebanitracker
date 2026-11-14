import { PartialType } from '@nestjs/mapped-types';
import { Transform } from 'class-transformer';
import {
  IsBoolean, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, IsUrl, MaxLength, Min,
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
}

export class UpdateAnimeDto extends PartialType(CreateAnimeDto) {}

export class SetProgressDto {
  /** Número del último capítulo visto (0 = ninguno). */
  @IsInt() @Min(0)
  episode: number;
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
