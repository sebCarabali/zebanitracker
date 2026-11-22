import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { Transform } from 'class-transformer';

export class UpdateProfileDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @Matches(/^[a-z0-9_]{3,24}$/, { message: 'El usuario debe tener 3-24 caracteres: letras, números o _' })
  username?: string;

  @IsOptional() @IsBoolean()
  is_public?: boolean;

  @IsOptional() @IsBoolean()
  notify_email?: boolean;

  /** Idioma para sinopsis traducidas y textos de la IA. */
  @IsOptional() @IsIn(['es', 'en', 'pt', 'fr', 'it', 'de', 'ja', 'ko'])
  language?: string;

  /** Gustos en texto libre para la IA ("me encantan los isekai cortos, odio el fanservice"). */
  @IsOptional() @IsString() @MaxLength(1000)
  ai_preferences?: string | null;

  /** Semanas sin avanzar para preguntar "¿Lo retomas o lo dejas?". */
  @IsOptional() @IsInt() @Min(1) @Max(52)
  stale_weeks?: number;
}

export class ConnectAniListDto {
  @IsString() @MaxLength(4000)
  token: string;
}
