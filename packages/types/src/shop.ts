export interface CoinPackage {
  id: string;
  label: string;
  coins: number;
  priceVnd: number;
}

export type PaymentProvider = 'dev' | 'stripe' | 'momo';

export interface CreateOrderResponse {
  orderId: string;
  status: 'pending' | 'paid';
  /** Có khi provider cần chuyển hướng (Stripe/MoMo) */
  payUrl?: string;
  /** Số dư mới — chỉ có khi thanh toán hoàn tất ngay (dev) */
  balance?: number;
}

export interface RewardsStatus {
  checkedInToday: boolean;
  /** Chuỗi ngày điểm danh liên tiếp hiện tại */
  streak: number;
  /** Phần thưởng nếu điểm danh hôm nay/ngày mai */
  nextReward: number;
  adsWatchedToday: number;
  adDailyLimit: number;
  adReward: number;
}

export interface ClaimResponse {
  reward: number;
  balance: number;
  streak?: number;
}
