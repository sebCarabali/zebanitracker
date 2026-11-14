import { IsBoolean, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
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
}

export class ConnectAniListDto {
  @IsString() @MaxLength(4000)
  token: string;
}
