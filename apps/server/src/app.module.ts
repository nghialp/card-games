import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { GameGateway } from './game/game.gateway';
import { RoomService } from './game/room.service';
import { MetricsController } from './metrics/metrics.controller';
import { MetricsService } from './metrics/metrics.service';
import { MatchPersistenceService } from './persistence/match-persistence.service';
import { PrismaService } from './persistence/prisma.service';
import { RedisService } from './persistence/redis.service';

@Module({
  controllers: [HealthController, MetricsController],
  providers: [
    GameGateway,
    RoomService,
    RedisService,
    PrismaService,
    MatchPersistenceService,
    MetricsService,
  ],
})
export class AppModule {}
