import { Module } from '@nestjs/common';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { HealthController } from './health.controller';
import { GameGateway } from './game/game.gateway';
import { RoomService } from './game/room.service';
import { TuSacService } from './tusac/tusac.service';
import { MetricsController } from './metrics/metrics.controller';
import { MetricsService } from './metrics/metrics.service';
import { RewardsController } from './shop/rewards.controller';
import { RewardsService } from './shop/rewards.service';
import { ShopController } from './shop/shop.controller';
import { ShopService } from './shop/shop.service';
import { LeaderboardController, UsersController } from './users/users.controller';
import { UsersService } from './users/users.service';
import { MatchPersistenceService } from './persistence/match-persistence.service';
import { PrismaService } from './persistence/prisma.service';
import { RedisService } from './persistence/redis.service';

@Module({
  controllers: [
    HealthController,
    MetricsController,
    AuthController,
    UsersController,
    LeaderboardController,
    ShopController,
    RewardsController,
  ],
  providers: [
    AuthService,
    UsersService,
    ShopService,
    RewardsService,
    GameGateway,
    RoomService,
    TuSacService,
    RedisService,
    PrismaService,
    MatchPersistenceService,
    MetricsService,
  ],
})
export class AppModule {}
