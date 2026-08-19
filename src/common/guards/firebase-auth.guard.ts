import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import * as admin from 'firebase-admin';

export const IS_PUBLIC_KEY = 'isPublic';

@Injectable()
export class FirebaseAuthGuard implements CanActivate {
  private readonly logger = new Logger(FirebaseAuthGuard.name);

  constructor(private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const token = this.extractToken(request);

    if (!token) {
      this.logger.warn(`Requisição sem token: ${request.method} ${request.url}`);
      throw new UnauthorizedException('Token não fornecido');
    }

    try {
      const decoded = await admin.auth().verifyIdToken(token);
      request.user = decoded;

      // Routes under /auth/ set up the user/business — they don't need businessId in claims yet.
      const isAuthRoute = /^\/v1\/auth(\/|$)/.test(request.url);
      if (!isPublic && !isAuthRoute && !decoded.businessId) {
        this.logger.warn(
          `Token sem businessId nas claims: ${request.method} ${request.url} | uid=${decoded.uid}`,
        );
        throw new UnauthorizedException('Sessão desatualizada — faça login novamente');
      }

      return true;
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      this.logger.error(
        `Token inválido: ${request.method} ${request.url} | ${(err as Error).message}`,
      );
      throw new UnauthorizedException('Token inválido ou expirado');
    }
  }

  private extractToken(request: any): string | null {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : null;
  }
}
