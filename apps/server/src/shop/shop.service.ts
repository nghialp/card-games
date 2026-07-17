import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  createMoMoPayment,
  createStripeCheckout,
  verifyMoMoIpn,
  verifyStripeWebhook,
  type MoMoConfig,
  type MoMoIpnBody,
} from '@shared-libs/payment';
import type {
  CoinPackage,
  CreateOrderResponse,
  PaymentProvider,
} from '@card-games/types';
import { PrismaService } from '../persistence/prisma.service';

export const COIN_PACKAGES: CoinPackage[] = [
  { id: 'cu-1k', label: 'Gói khởi động', coins: 1_000, priceVnd: 20_000 },
  { id: 'cu-6k', label: 'Gói phổ thông', coins: 6_000, priceVnd: 100_000 },
  { id: 'cu-15k', label: 'Gói cao thủ', coins: 15_000, priceVnd: 200_000 },
];

/** Cổng "dev" nạp thử tức thì — TẮT ở production (ALLOW_DEV_TOPUP=0) */
const devTopupAllowed = (): boolean =>
  process.env.ALLOW_DEV_TOPUP === '1' || process.env.NODE_ENV !== 'production';

const APP_URL = (): string => process.env.APP_URL ?? 'http://localhost:5173';

@Injectable()
export class ShopService {
  private readonly logger = new Logger(ShopService.name);

  constructor(private readonly prisma: PrismaService) {}

  listPackages(): CoinPackage[] {
    return COIN_PACKAGES;
  }

  async createOrder(
    userId: string,
    packageId: string,
    provider: PaymentProvider,
  ): Promise<CreateOrderResponse> {
    this.ensureDb();
    const pkg = COIN_PACKAGES.find((p) => p.id === packageId);
    if (!pkg) throw new BadRequestException('PACKAGE_NOT_FOUND');

    const order = await this.prisma.coinOrder.create({
      data: {
        userId,
        packageId: pkg.id,
        coins: pkg.coins,
        priceVnd: pkg.priceVnd,
        provider,
      },
    });

    if (provider === 'dev') {
      if (!devTopupAllowed()) throw new BadRequestException('PROVIDER_NOT_CONFIGURED');
      const balance = await this.creditOrder(order.id);
      return { orderId: order.id, status: 'paid', balance };
    }

    const input = {
      orderId: order.id,
      amountVnd: pkg.priceVnd,
      description: `Card Games - ${pkg.label} (${pkg.coins} cu)`,
      returnUrl: APP_URL(),
      notifyUrl: `${APP_URL()}/shop/webhooks/${provider}`,
    };

    if (provider === 'stripe') {
      const secretKey = process.env.STRIPE_SECRET_KEY;
      if (!secretKey) throw new BadRequestException('PROVIDER_NOT_CONFIGURED');
      const result = await createStripeCheckout({ secretKey }, input);
      await this.prisma.coinOrder.update({
        where: { id: order.id },
        data: { providerRef: result.providerRef },
      });
      return { orderId: order.id, status: 'pending', payUrl: result.payUrl };
    }

    if (provider === 'momo') {
      const config = this.momoConfig();
      if (!config) throw new BadRequestException('PROVIDER_NOT_CONFIGURED');
      const result = await createMoMoPayment(config, input);
      await this.prisma.coinOrder.update({
        where: { id: order.id },
        data: { providerRef: result.providerRef },
      });
      return { orderId: order.id, status: 'pending', payUrl: result.payUrl };
    }

    throw new BadRequestException('UNKNOWN_PROVIDER');
  }

  /** Webhook Stripe: checkout.session.completed → cộng củ */
  async handleStripeWebhook(rawBody: string, signature: string): Promise<void> {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) throw new BadRequestException('PROVIDER_NOT_CONFIGURED');
    const event = verifyStripeWebhook(rawBody, signature, secret);
    if (event.type !== 'checkout.session.completed') return;
    const orderId = (event.data.object.metadata as { orderId?: string })?.orderId;
    if (orderId) await this.creditOrder(orderId);
  }

  /** IPN MoMo gọi về sau khi người dùng thanh toán */
  async handleMoMoIpn(body: MoMoIpnBody): Promise<void> {
    const config = this.momoConfig();
    if (!config) throw new BadRequestException('PROVIDER_NOT_CONFIGURED');
    if (!verifyMoMoIpn(config, body)) {
      throw new BadRequestException('INVALID_SIGNATURE');
    }
    if (body.resultCode === 0) await this.creditOrder(body.orderId);
    else await this.markFailed(body.orderId);
  }

  /**
   * Cộng củ cho đơn — idempotent: chỉ đơn `pending` mới được chuyển
   * sang `paid` (webhook gọi trùng không cộng đôi). Trả về số dư mới.
   */
  private async creditOrder(orderId: string): Promise<number> {
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.coinOrder.updateMany({
        where: { id: orderId, status: 'pending' },
        data: { status: 'paid', paidAt: new Date() },
      });
      if (updated.count === 0) {
        const existing = await tx.coinOrder.findUnique({ where: { id: orderId } });
        if (!existing) throw new BadRequestException('ORDER_NOT_FOUND');
        const wallet = await tx.wallet.findUnique({
          where: { userId: existing.userId },
        });
        return wallet?.balance ?? 0; // đã xử lý trước đó
      }
      const order = (await tx.coinOrder.findUnique({ where: { id: orderId } }))!;
      const wallet = await tx.wallet.upsert({
        where: { userId: order.userId },
        update: { balance: { increment: order.coins } },
        create: { userId: order.userId, balance: order.coins },
      });
      await tx.transaction.create({
        data: {
          userId: order.userId,
          amount: order.coins,
          type: 'topup',
          refId: order.id,
        },
      });
      this.logger.log(`order ${orderId} paid: +${order.coins} cu`);
      return wallet.balance;
    });
  }

  private async markFailed(orderId: string): Promise<void> {
    await this.prisma.coinOrder.updateMany({
      where: { id: orderId, status: 'pending' },
      data: { status: 'failed' },
    });
  }

  private momoConfig(): MoMoConfig | null {
    const { MOMO_PARTNER_CODE, MOMO_ACCESS_KEY, MOMO_SECRET_KEY, MOMO_ENDPOINT } =
      process.env;
    if (!MOMO_PARTNER_CODE || !MOMO_ACCESS_KEY || !MOMO_SECRET_KEY) return null;
    return {
      partnerCode: MOMO_PARTNER_CODE,
      accessKey: MOMO_ACCESS_KEY,
      secretKey: MOMO_SECRET_KEY,
      endpoint: MOMO_ENDPOINT,
    };
  }

  private ensureDb(): void {
    if (!this.prisma.enabled) {
      throw new ServiceUnavailableException('REQUIRES_DATABASE');
    }
  }
}
