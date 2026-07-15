import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  generateRefreshToken,
  hashPassword,
  hashRefreshToken,
  REFRESH_TOKEN_TTL_MS,
  signAccessToken,
  verifyAccessToken,
  verifyPassword,
} from '@shared-libs/auth';
import type { AuthResponse, MeResponse } from '@card-games/types';
import { PrismaService } from '../persistence/prisma.service';

/** Số "củ" 🍠 tặng khi mở tài khoản */
const STARTING_BALANCE = 1000;
const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret';

const EMAIL_RE = /^\S+@\S+\.\S+$/;

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async register(
    email: string,
    password: string,
    displayName: string,
  ): Promise<AuthResponse> {
    this.ensureDb();
    if (!EMAIL_RE.test(email ?? '')) throw new BadRequestException('INVALID_EMAIL');
    if ((password ?? '').length < 6) throw new BadRequestException('PASSWORD_TOO_SHORT');
    const name = (displayName ?? '').trim();
    if (name.length < 2 || name.length > 20) {
      throw new BadRequestException('INVALID_DISPLAY_NAME');
    }

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new BadRequestException('EMAIL_TAKEN');

    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash: await hashPassword(password),
        displayName: name,
        wallet: { create: { balance: STARTING_BALANCE } },
      },
    });
    return this.issueTokens(user.id, name, email, STARTING_BALANCE);
  }

  async login(email: string, password: string): Promise<AuthResponse> {
    this.ensureDb();
    const user = await this.prisma.user.findUnique({
      where: { email: email ?? '' },
      include: { wallet: true },
    });
    if (!user?.passwordHash || !(await verifyPassword(password ?? '', user.passwordHash))) {
      throw new UnauthorizedException('INVALID_CREDENTIALS');
    }
    return this.issueTokens(
      user.id,
      user.displayName,
      user.email,
      user.wallet?.balance ?? 0,
    );
  }

  /** Rotate: refresh token dùng một lần, cấp cặp token mới */
  async refresh(refreshToken: string): Promise<AuthResponse> {
    this.ensureDb();
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashRefreshToken(refreshToken ?? '') },
      include: { user: { include: { wallet: true } } },
    });
    if (!stored || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('INVALID_REFRESH_TOKEN');
    }
    await this.prisma.refreshToken.delete({ where: { id: stored.id } });
    return this.issueTokens(
      stored.user.id,
      stored.user.displayName,
      stored.user.email,
      stored.user.wallet?.balance ?? 0,
    );
  }

  async me(userId: string): Promise<MeResponse> {
    this.ensureDb();
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { wallet: true },
    });
    if (!user) throw new UnauthorizedException();
    return {
      user: { id: user.id, email: user.email, displayName: user.displayName },
      balance: user.wallet?.balance ?? 0,
    };
  }

  verifyBearer(authHeader: string | undefined): { userId: string; displayName: string } {
    if (!authHeader?.startsWith('Bearer ')) throw new UnauthorizedException();
    try {
      const payload = verifyAccessToken(authHeader.slice(7), JWT_SECRET);
      return { userId: payload.sub, displayName: payload.name };
    } catch {
      throw new UnauthorizedException('INVALID_TOKEN');
    }
  }

  private async issueTokens(
    userId: string,
    displayName: string,
    email: string | null,
    balance: number,
  ): Promise<AuthResponse> {
    const refreshToken = generateRefreshToken();
    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: hashRefreshToken(refreshToken),
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      },
    });
    return {
      user: { id: userId, email, displayName },
      balance,
      accessToken: signAccessToken({ sub: userId, name: displayName }, JWT_SECRET),
      refreshToken,
    };
  }

  private ensureDb(): void {
    if (!this.prisma.enabled) {
      throw new ServiceUnavailableException('AUTH_REQUIRES_DATABASE');
    }
  }
}
