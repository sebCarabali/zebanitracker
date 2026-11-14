import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthedRequest } from './auth.guard.js';

/** Inyecta el access token del usuario autenticado. */
export const AccessToken = createParamDecorator(
  (_: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest<AuthedRequest>().accessToken,
);

/** Inyecta el id (uuid) del usuario autenticado. */
export const UserId = createParamDecorator(
  (_: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest<AuthedRequest>().user.id,
);
