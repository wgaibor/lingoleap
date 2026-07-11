import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { AUTH_VERIFIER, type AuthenticatedUser, type AuthVerifier } from '../application/ports/auth-verifier.port';

export interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(@Inject(AUTH_VERIFIER) private readonly verifier: AuthVerifier) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    const user = token ? await this.verifier.verifyToken(token) : null;
    if (user === null) {
      throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: 'Token requerido o inválido' });
    }
    request.user = user;
    return true;
  }
}
