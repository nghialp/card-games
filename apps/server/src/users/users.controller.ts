import { Controller, Get, Headers } from '@nestjs/common';
import type { LeaderboardResponse, ProfileResponse } from '@card-games/types';
import { AuthService } from '../auth/auth.service';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(
    private readonly auth: AuthService,
    private readonly users: UsersService,
  ) {}

  @Get('me/profile')
  profile(@Headers('authorization') authorization?: string): Promise<ProfileResponse> {
    const { userId } = this.auth.verifyBearer(authorization);
    return this.users.getProfile(userId);
  }
}

@Controller('leaderboard')
export class LeaderboardController {
  constructor(private readonly users: UsersService) {}

  /** Công khai — khách cũng xem được */
  @Get('weekly')
  weekly(): Promise<LeaderboardResponse> {
    return this.users.weeklyLeaderboard();
  }
}
