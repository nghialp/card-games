import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { ClaimResponse, RewardsStatus } from '@card-games/types';
import { PrismaService } from '../persistence/prisma.service';

/** Thưởng điểm danh theo chuỗi ngày liên tiếp (ngày 7+ giữ mức cao nhất) */
const CHECKIN_REWARDS = [20, 30, 40, 50, 60, 80, 100];
const AD_REWARD = 20;
const AD_DAILY_LIMIT = 5;

const startOfToday = (): Date => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

const rewardForStreak = (streak: number): number =>
  CHECKIN_REWARDS[Math.min(streak, CHECKIN_REWARDS.length) - 1];

@Injectable()
export class RewardsService {
  constructor(private readonly prisma: PrismaService) {}

  async status(userId: string): Promise<RewardsStatus> {
    this.ensureDb();
    const today = startOfToday();
    const [todayRow, lastRow, adsWatchedToday] = await Promise.all([
      this.prisma.dailyCheckin.findUnique({
        where: { userId_day: { userId, day: today } },
      }),
      this.prisma.dailyCheckin.findFirst({
        where: { userId },
        orderBy: { day: 'desc' },
      }),
      this.countAdsToday(userId),
    ]);
    const streak = todayRow?.streak ?? this.nextStreak(lastRow?.day, lastRow?.streak);
    return {
      checkedInToday: !!todayRow,
      streak: todayRow?.streak ?? (lastRow ? lastRow.streak : 0),
      nextReward: rewardForStreak(todayRow ? Math.min(todayRow.streak + 1, 7) : streak),
      adsWatchedToday,
      adDailyLimit: AD_DAILY_LIMIT,
      adReward: AD_REWARD,
    };
  }

  /** Điểm danh hằng ngày — chuỗi liên tiếp thưởng tăng dần */
  async checkin(userId: string): Promise<ClaimResponse> {
    this.ensureDb();
    const today = startOfToday();
    const existing = await this.prisma.dailyCheckin.findUnique({
      where: { userId_day: { userId, day: today } },
    });
    if (existing) throw new BadRequestException('ALREADY_CHECKED_IN');

    const last = await this.prisma.dailyCheckin.findFirst({
      where: { userId },
      orderBy: { day: 'desc' },
    });
    const streak = this.nextStreak(last?.day, last?.streak);
    const reward = rewardForStreak(streak);

    const balance = await this.prisma.$transaction(async (tx) => {
      await tx.dailyCheckin.create({
        data: { userId, day: today, streak, reward },
      });
      const wallet = await tx.wallet.upsert({
        where: { userId },
        update: { balance: { increment: reward } },
        create: { userId, balance: reward },
      });
      await tx.transaction.create({
        data: { userId, amount: reward, type: 'daily_checkin' },
      });
      return wallet.balance;
    });
    return { reward, balance, streak };
  }

  /**
   * Thưởng xem quảng cáo, tối đa AD_DAILY_LIMIT lần/ngày.
   * MVP: client tự báo xem xong — khi tích hợp ad network thật phải chuyển
   * sang server-side verification (SSV callback) để chống gian lận.
   */
  async adReward(userId: string): Promise<ClaimResponse> {
    this.ensureDb();
    if ((await this.countAdsToday(userId)) >= AD_DAILY_LIMIT) {
      throw new BadRequestException('AD_LIMIT_REACHED');
    }
    const balance = await this.prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.upsert({
        where: { userId },
        update: { balance: { increment: AD_REWARD } },
        create: { userId, balance: AD_REWARD },
      });
      await tx.transaction.create({
        data: { userId, amount: AD_REWARD, type: 'ad_reward' },
      });
      return wallet.balance;
    });
    return { reward: AD_REWARD, balance };
  }

  private countAdsToday(userId: string): Promise<number> {
    return this.prisma.transaction.count({
      where: { userId, type: 'ad_reward', createdAt: { gte: startOfToday() } },
    });
  }

  /** Chuỗi mới nếu điểm danh hôm nay: hôm qua có điểm danh → +1, không thì 1 */
  private nextStreak(lastDay?: Date, lastStreak?: number): number {
    if (!lastDay || lastStreak === undefined) return 1;
    const yesterday = startOfToday();
    yesterday.setDate(yesterday.getDate() - 1);
    return lastDay.getTime() === yesterday.getTime() ? lastStreak + 1 : 1;
  }

  private ensureDb(): void {
    if (!this.prisma.enabled) {
      throw new ServiceUnavailableException('REQUIRES_DATABASE');
    }
  }
}
