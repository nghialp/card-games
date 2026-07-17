import { createHmac, timingSafeEqual } from 'node:crypto';
import type { CreatePaymentInput, CreatePaymentResult } from './types';

/**
 * Stripe Checkout qua REST API (không cần SDK).
 * ⚠️ Chưa kiểm chứng với tài khoản thật — cần STRIPE_SECRET_KEY test mode
 * để xác nhận trước khi dùng production.
 */

export interface StripeConfig {
  secretKey: string;
}

export async function createStripeCheckout(
  config: StripeConfig,
  input: CreatePaymentInput,
): Promise<CreatePaymentResult> {
  const params = new URLSearchParams({
    mode: 'payment',
    success_url: `${input.returnUrl}?payment=success`,
    cancel_url: `${input.returnUrl}?payment=cancel`,
    client_reference_id: input.orderId,
    'metadata[orderId]': input.orderId,
    'line_items[0][quantity]': '1',
    // VND là zero-decimal currency với Stripe: unit_amount = số đồng
    'line_items[0][price_data][currency]': 'vnd',
    'line_items[0][price_data][unit_amount]': String(input.amountVnd),
    'line_items[0][price_data][product_data][name]': input.description,
  });
  const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });
  const data = (await res.json()) as { id?: string; url?: string; error?: { message: string } };
  if (!res.ok || !data.url || !data.id) {
    throw new Error(`stripe checkout failed: ${data.error?.message ?? res.status}`);
  }
  return { payUrl: data.url, providerRef: data.id };
}

/**
 * Verify chữ ký webhook Stripe (header `stripe-signature`).
 * Trả về event object nếu hợp lệ, ném lỗi nếu không.
 */
export function verifyStripeWebhook(
  rawBody: string,
  signatureHeader: string,
  webhookSecret: string,
  toleranceSeconds = 300,
): { type: string; data: { object: Record<string, unknown> } } {
  const parts = new Map(
    signatureHeader.split(',').map((p) => p.split('=') as [string, string]),
  );
  const timestamp = parts.get('t');
  const signature = parts.get('v1');
  if (!timestamp || !signature) throw new Error('malformed stripe signature');

  const expected = createHmac('sha256', webhookSecret)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex');
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new Error('invalid stripe signature');
  }
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > toleranceSeconds) {
    throw new Error('stripe signature timestamp out of tolerance');
  }
  return JSON.parse(rawBody) as { type: string; data: { object: Record<string, unknown> } };
}
