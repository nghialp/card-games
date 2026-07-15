import { Controller, Get } from '@nestjs/common';
import { PrismaService } from './persistence/prisma.service';
import { RedisService } from './persistence/redis.service';

type DepStatus = 'ok' | 'off' | 'error';

@Controller('health')
export class HealthController {
  constructor(
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  async health(): Promise<{ status: string; redis: DepStatus; db: DepStatus }> {
    const redis: DepStatus = this.redis.client
      ? await this.redis.client
          .ping()
          .then((): DepStatus => 'ok')
          .catch((): DepStatus => 'error')
      : 'off';
    const db: DepStatus = this.prisma.enabled
      ? await this.prisma.$queryRaw`SELECT 1`
          .then((): DepStatus => 'ok')
          .catch((): DepStatus => 'error')
      : 'off';
    return { status: redis !== 'error' && db !== 'error' ? 'ok' : 'degraded', redis, db };
  }
}
