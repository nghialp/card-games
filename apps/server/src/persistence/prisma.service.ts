import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Kết nối PostgreSQL. Không đặt DATABASE_URL thì server vẫn chạy
 * (dev nhanh, không lưu gì) — enabled=false và mọi ghi DB bị bỏ qua.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);
  readonly enabled = Boolean(process.env.DATABASE_URL);

  async onModuleInit(): Promise<void> {
    if (!this.enabled) {
      this.logger.warn('DATABASE_URL chưa đặt — không lưu kết quả trận vào DB');
      return;
    }
    await this.$connect();
    this.logger.log('connected to PostgreSQL');
  }

  async onModuleDestroy(): Promise<void> {
    if (this.enabled) await this.$disconnect();
  }
}
