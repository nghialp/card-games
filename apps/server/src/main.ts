import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { RedisIoAdapter } from './redis-io.adapter';

async function bootstrap(): Promise<void> {
  // Sentry chỉ bật khi có DSN — không có thì bỏ qua, không thêm overhead
  if (process.env.SENTRY_DSN) {
    const Sentry = await import('@sentry/node');
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV ?? 'development',
    });
  }

  // rawBody: verify chữ ký webhook Stripe cần body gốc chưa parse
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.enableCors({ origin: process.env.CORS_ORIGIN ?? '*' });
  app.enableShutdownHooks(); // đóng Redis/Prisma sạch sẽ khi SIGTERM (docker stop)

  if (process.env.REDIS_URL) {
    const adapter = new RedisIoAdapter(app);
    await adapter.connectToRedis(process.env.REDIS_URL);
    app.useWebSocketAdapter(adapter);
  }

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  console.log(`server listening on :${port}`);
}

void bootstrap();
