import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

/**
 * Kết nối Redis dùng chung (room state). Không đặt REDIS_URL thì
 * client=null — room state chỉ nằm in-memory, mất khi restart.
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  readonly client: Redis | null;

  constructor() {
    const url = process.env.REDIS_URL;
    if (!url) {
      this.logger.warn('REDIS_URL chưa đặt — room state sẽ mất khi server restart');
      this.client = null;
      return;
    }
    this.client = new Redis(url, { maxRetriesPerRequest: 2 });
    this.client.on('error', (err) => this.logger.error('redis error', err.message));
  }

  async onModuleDestroy(): Promise<void> {
    await this.client?.quit();
  }
}
