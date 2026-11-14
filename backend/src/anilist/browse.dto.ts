import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min,
} from 'class-validator';

export enum MediaSeason { Winter = 'WINTER', Spring = 'SPRING', Summer = 'SUMMER', Fall = 'FALL' }

export enum MediaFormat {
  TV = 'TV', TVShort = 'TV_SHORT', Movie = 'MOVIE', Special = 'SPECIAL', OVA = 'OVA', ONA = 'ONA', Music = 'MUSIC',
}

export enum MediaStatus {
  Releasing = 'RELEASING', Finished = 'FINISHED', NotYetReleased = 'NOT_YET_RELEASED',
  Cancelled = 'CANCELLED', Hiatus = 'HIATUS',
}

export enum MediaSort {
  Popularity = 'POPULARITY_DESC', Trending = 'TRENDING_DESC', Score = 'SCORE_DESC',
  Newest = 'START_DATE_DESC', Title = 'TITLE_ROMAJI', SearchMatch = 'SEARCH_MATCH',
}

/** "a,b,c" o ?x=a&x=b → ['a','b','c'] */
const csv = ({ value }: { value: unknown }) =>
  (Array.isArray(value) ? value : String(value ?? '').split(','))
    .map((v) => String(v).trim())
    .filter(Boolean);

export class BrowseQuery {
  @IsOptional() @IsString() @MaxLength(100)
  search?: string;

  @IsOptional() @Transform(csv) @IsArray() @ArrayMaxSize(10) @IsString({ each: true }) @MaxLength(50, { each: true })
  genres?: string[];

  @IsOptional() @Transform(csv) @IsArray() @ArrayMaxSize(10) @IsString({ each: true }) @MaxLength(80, { each: true })
  tags?: string[];

  @IsOptional() @Type(() => Number) @IsInt() @Min(1940) @Max(2100)
  year?: number;

  @IsOptional() @IsEnum(MediaSeason)
  season?: MediaSeason;

  @IsOptional() @Transform(csv) @IsArray() @IsEnum(MediaFormat, { each: true })
  formats?: MediaFormat[];

  @IsOptional() @IsEnum(MediaStatus)
  status?: MediaStatus;

  @IsOptional() @IsEnum(MediaSort)
  sort?: MediaSort;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  page?: number;
}
