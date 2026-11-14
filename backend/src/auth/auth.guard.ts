import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { SupabaseService } from '../supabase/supabase.service.js';

export interface AuthedRequest extends Request {
  user: { id: string; email?: string };
  accessToken: string;
}

@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  constructor(private readonly supabase: SupabaseService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const header = req.headers.authorization ?? '';
    const [type, token] = header.split(' ');
    if (type !== 'Bearer' || !token) throw new UnauthorizedException('Falta el token Bearer');

    const user = await this.supabase.getUser(token);
    if (!user) throw new UnauthorizedException('Token inválido o expirado');

    req.user = { id: user.id, email: user.email };
    req.accessToken = token;
    return true;
  }
}
