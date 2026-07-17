import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from './prisma.service';

const STARTING_BALANCE = 1000;

export interface FinishedPlayer {
  userId: string;
  displayName: string;
  rank: number;
  coinDelta: number;
}

export interface FinishedMatch {
  matchId: string;
  gameType: string;
  betAmount: number;
  startedAt: Date;
  players: FinishedPlayer[];
}

@Injectable()
export class MatchPersistenceService {
  private readonly logger = new Logger(MatchPersistenceService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Số dư ví, null nếu user chưa có ví (guest mới) hoặc không có DB.
   * null = "không xác định" — caller quyết định cho qua (guest chơi thử).
   */
  async getBalance(userId: string): Promise<number | null> {
    if (!this.prisma.enabled) return null;
    const wallet = await this.prisma.wallet.findUnique({ where: { userId } });
    return wallet?.balance ?? null;
  }

  /**
   * Ghi kết quả trận + cập nhật ví trong một transaction:
   * upsert user, cộng/trừ ví, ghi transaction đối soát, lưu match.
   */
  async recordMatch(result: FinishedMatch): Promise<void> {
    if (!this.prisma.enabled) return;
    await this.prisma.$transaction(async (tx) => {
      await tx.match.create({
        data: {
          id: result.matchId,
          gameType: result.gameType,
          betAmount: result.betAmount,
          startedAt: result.startedAt,
        },
      });
      for (const p of result.players) {
        await tx.user.upsert({
          where: { id: p.userId },
          update: { displayName: p.displayName },
          create: { id: p.userId, displayName: p.displayName },
        });
        await tx.wallet.upsert({
          where: { userId: p.userId },
          update: { balance: { increment: p.coinDelta } },
          create: { userId: p.userId, balance: STARTING_BALANCE + p.coinDelta },
        });
        await tx.transaction.create({
          data: {
            userId: p.userId,
            amount: p.coinDelta,
            type: p.rank === 0 ? 'match_win' : 'match_loss',
            refId: result.matchId,
          },
        });
        await tx.matchPlayer.create({
          data: {
            matchId: result.matchId,
            userId: p.userId,
            rank: p.rank,
            coinDelta: p.coinDelta,
          },
        });
      }
    });
    this.logger.log(`match ${result.matchId} persisted (${result.players.length} players)`);
  }
}
