import { createHmac } from 'node:crypto';
import type { CreatePaymentInput, CreatePaymentResult } from './types';

/**
 * MoMo payment gateway v2 (captureWallet).
 * ⚠️ Chưa kiểm chứng với tài khoản merchant thật — cần credentials sandbox
 * của MoMo Business để xác nhận trước khi dùng production.
 */

export interface MoMoConfig {
  partnerCode: string;
  accessKey: string;
  secretKey: string;
  /** https://test-payment.momo.vn cho sandbox, https://payment.momo.vn cho production */
  endpoint?: string;
}

export async function createMoMoPayment(
  config: MoMoConfig,
  input: CreatePaymentInput,
): Promise<CreatePaymentResult> {
  const endpoint = config.endpoint ?? 'https://test-payment.momo.vn';
  const requestId = input.orderId;
  const extraData = '';
  const requestType = 'captureWallet';

  // Chữ ký: HMAC-SHA256 các field theo thứ tự alphabet (spec MoMo v2)
  const rawSignature =
    `accessKey=${config.accessKey}&amount=${input.amountVnd}` +
    `&extraData=${extraData}&ipnUrl=${input.notifyUrl}&orderId=${input.orderId}` +
    `&orderInfo=${input.description}&partnerCode=${config.partnerCode}` +
    `&redirectUrl=${input.returnUrl}&requestId=${requestId}&requestType=${requestType}`;
  const signature = createHmac('sha256', config.secretKey)
    .update(rawSignature)
    .digest('hex');

  const res = await fetch(`${endpoint}/v2/gateway/api/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      partnerCode: config.partnerCode,
      accessKey: config.accessKey,
      requestId,
      amount: input.amountVnd,
      orderId: input.orderId,
      orderInfo: input.description,
      redirectUrl: input.returnUrl,
      ipnUrl: input.notifyUrl,
      extraData,
      requestType,
      signature,
      lang: 'vi',
    }),
  });
  const data = (await res.json()) as {
    resultCode?: number;
    payUrl?: string;
    message?: string;
  };
  if (data.resultCode !== 0 || !data.payUrl) {
    throw new Error(`momo create failed: ${data.message ?? data.resultCode}`);
  }
  return { payUrl: data.payUrl, providerRef: requestId };
}

export interface MoMoIpnBody {
  partnerCode: string;
  orderId: string;
  requestId: string;
  amount: number;
  orderInfo: string;
  orderType: string;
  transId: number;
  resultCode: number;
  message: string;
  payType: string;
  responseTime: number;
  extraData: string;
  signature: string;
}

/** Verify chữ ký IPN MoMo gọi về. resultCode === 0 nghĩa là thanh toán thành công. */
export function verifyMoMoIpn(config: MoMoConfig, body: MoMoIpnBody): boolean {
  const raw =
    `accessKey=${config.accessKey}&amount=${body.amount}&extraData=${body.extraData}` +
    `&message=${body.message}&orderId=${body.orderId}&orderInfo=${body.orderInfo}` +
    `&orderType=${body.orderType}&partnerCode=${body.partnerCode}&payType=${body.payType}` +
    `&requestId=${body.requestId}&responseTime=${body.responseTime}` +
    `&resultCode=${body.resultCode}&transId=${body.transId}`;
  const expected = createHmac('sha256', config.secretKey).update(raw).digest('hex');
  return expected === body.signature;
}
