import { Body, Controller, Get, Headers, Post } from '@nestjs/common';
import type { AuthResponse, MeResponse } from '@card-games/types';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  register(
    @Body() body: { email: string; password: string; displayName: string },
  ): Promise<AuthResponse> {
    return this.auth.register(body?.email, body?.password, body?.displayName);
  }

  @Post('login')
  login(@Body() body: { email: string; password: string }): Promise<AuthResponse> {
    return this.auth.login(body?.email, body?.password);
  }

  @Post('refresh')
  refresh(@Body() body: { refreshToken: string }): Promise<AuthResponse> {
    return this.auth.refresh(body?.refreshToken);
  }

  @Get('me')
  me(@Headers('authorization') authorization?: string): Promise<MeResponse> {
    const { userId } = this.auth.verifyBearer(authorization);
    return this.auth.me(userId);
  }
}
