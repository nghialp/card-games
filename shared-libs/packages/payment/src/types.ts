export interface CreatePaymentInput {
  /** Mã đơn hàng nội bộ — dùng đối soát khi webhook/IPN gọi về */
  orderId: string;
  amountVnd: number;
  description: string;
  /** URL đưa người dùng quay lại sau khi thanh toán */
  returnUrl: string;
  /** URL server nhận thông báo kết quả (webhook/IPN) */
  notifyUrl: string;
}

export interface CreatePaymentResult {
  /** Chuyển hướng người dùng tới đây để thanh toán */
  payUrl: string;
  /** Mã tham chiếu phía cổng thanh toán */
  providerRef: string;
}
