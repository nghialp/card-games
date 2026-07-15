import { Module } from '@nestjs/common';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { HealthController } from './health.controller';
import { GameGateway } from './game/game.gateway';
import { RoomService } from './game/room.service';
import { MetricsController } from './metrics/metrics.controller';
import { MetricsService } from './metrics/metrics.service';
import { MatchPersistenceService } from './persistence/match-persistence.service';
import { PrismaService } from './persistence/prisma.service';
import { RedisService } from './persistence/redis.service';

@Module({
  controllers: [HealthController, MetricsController, AuthController],
  providers: [
    AuthService,
    GameGateway,
    RoomService,
    RedisService,
    PrismaService,
    MatchPersistenceService,
    MetricsService,
  ],
})
export class AppModule {}
