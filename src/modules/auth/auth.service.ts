import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { AuthUser } from '../../common/auth/auth-user.js';
import {
  InvalidCredentialsError,
  UnauthenticatedError,
} from '../../common/errors/domain-errors.js';
import type { Env } from '../../config/env.js';
import { UsersService } from '../users/users.service.js';
import type { LoginResponseDto } from './dto/login.dto.js';
import { hashPassword, verifyPassword } from './password.js';

/** The token only says who the caller claims to be. Everything else is read from the database. */
interface AccessTokenPayload {
  sub: string;
}

@Injectable()
export class AuthService {
  /** Stands in for the stored hash when the email is unknown, see login(). */
  private readonly decoyHash = hashPassword(crypto.randomUUID());

  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async login(email: string, password: string): Promise<LoginResponseDto> {
    const found = await this.users.findWithPasswordHash(email);

    // An unknown email costs one hash verification too, and fails with the same error, so
    // neither the response nor its timing reveals which addresses have an account.
    const passwordMatches = await verifyPassword(
      found?.passwordHash ?? (await this.decoyHash),
      password,
    );
    if (!found || !passwordMatches) throw new InvalidCredentialsError();

    const payload: AccessTokenPayload = { sub: found.id };
    return {
      accessToken: await this.jwt.signAsync(payload),
      expiresIn: this.config.get('JWT_TTL_SECONDS', { infer: true }),
      user: { id: found.id, name: found.name, email: found.email, role: found.role },
    };
  }

  /**
   * Resolves a bearer token to the user it belongs to. The user is read on every request, so
   * a deleted account or a changed role takes effect at once, not when the token expires.
   * The price is one primary key lookup per authenticated request.
   */
  async authenticate(token: string): Promise<AuthUser> {
    const payload = await this.jwt.verifyAsync<AccessTokenPayload>(token).catch(() => null);
    const user = payload && (await this.users.findById(payload.sub));
    if (!user) {
      throw new UnauthenticatedError(
        'The access token is invalid, has expired or belongs to an account that no longer exists.',
      );
    }
    return user;
  }
}
