import { Controller, Get, Headers, Post } from '@nestjs/common';
import type { ClaimResponse, RewardsStatus } from '@card-games/types';
import { AuthService } from '../auth/auth.service';
import { RewardsService } from './rewards.service';

@Controller('rewards')
export class RewardsController {
  constructor(
    private readonly auth: AuthService,
    private readonly rewards: RewardsService,
  ) {}

  @Get('status')
  status(@Headers('authorization') authorization?: string): Promise<RewardsStatus> {
    const { userId } = this.auth.verifyBearer(authorization);
    return this.rewards.status(userId);
  }

  @Post('checkin')
  checkin(@Headers('authorization') authorization?: string): Promise<ClaimResponse> {
    const { userId } = this.auth.verifyBearer(authorization);
    return this.rewards.checkin(userId);
  }

  @Post('ad')
  ad(@Headers('authorization') authorization?: string): Promise<ClaimResponse> {
    const { userId } = this.auth.verifyBearer(authorization);
    return this.rewards.adReward(userId);
  }
}
