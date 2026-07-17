import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Post,
  RawBodyRequest,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import type { MoMoIpnBody } from '@shared-libs/payment';
import type {
  CoinPackage,
  CreateOrderResponse,
  PaymentProvider,
} from '@card-games/types';
import { AuthService } from '../auth/auth.service';
import { ShopService } from './shop.service';

@Controller('shop')
export class ShopController {
  constructor(
    private readonly auth: AuthService,
    private readonly shop: ShopService,
  ) {}

  @Get('packages')
  packages(): CoinPackage[] {
    return this.shop.listPackages();
  }

  @Post('orders')
  createOrder(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: { packageId: string; provider: PaymentProvider },
  ): Promise<CreateOrderResponse> {
    const { userId } = this.auth.verifyBearer(authorization);
    return this.shop.createOrder(userId, body?.packageId, body?.provider ?? 'dev');
  }

  /** Stripe gọi về — cần raw body để verify chữ ký */
  @Post('webhooks/stripe')
  @HttpCode(200)
  async stripeWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature = '',
  ): Promise<{ received: boolean }> {
    await this.shop.handleStripeWebhook(req.rawBody?.toString() ?? '', signature);
    return { received: true };
  }

  /** MoMo IPN gọi về */
  @Post('webhooks/momo')
  @HttpCode(204)
  async momoIpn(@Body() body: MoMoIpnBody): Promise<void> {
    await this.shop.handleMoMoIpn(body);
  }
}
