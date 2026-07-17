import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import type {
  LeaderboardEntry,
  LeaderboardResponse,
  ProfileResponse,
} from '@card-games/types';
import { PrismaService } from '../persistence/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getProfile(userId: string): Promise<ProfileResponse> {
    this.ensureDb();
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { wallet: true },
    });
    if (!user) throw new UnauthorizedException();

    const [totalMatches, wins, history] = await Promise.all([
      this.prisma.matchPlayer.count({ where: { userId } }),
      this.prisma.matchPlayer.count({ where: { userId, rank: 0 } }),
      this.prisma.matchPlayer.findMany({
        where: { userId },
        orderBy: { match: { endedAt: 'desc' } },
        take: 20,
        include: {
          match: {
            include: {
              players: { include: { user: true }, orderBy: { rank: 'asc' } },
            },
          },
        },
      }),
    ]);

    return {
      user: { id: user.id, email: user.email, displayName: user.displayName },
      balance: user.wallet?.balance ?? 0,
      stats: { totalMatches, wins },
      matches: history.map((mp) => ({
        matchId: mp.matchId,
        gameType: mp.match.gameType,
        betAmount: mp.match.betAmount,
        endedAt: mp.match.endedAt.toISOString(),
        rank: mp.rank,
        coinDelta: mp.coinDelta,
        players: mp.match.players.map((p) => ({
          displayName: p.user.displayName,
          rank: p.rank,
          coinDelta: p.coinDelta,
        })),
      })),
    };
  }

  /** Top 10 tuần hiện tại (từ 00:00 thứ Hai), tính theo tổng củ thắng/thua */
  async weeklyLeaderboard(): Promise<LeaderboardResponse> {
    this.ensureDb();
    const weekStart = mondayOfCurrentWeek();
    const rows = await this.prisma.$queryRaw<
      Array<{
        user_id: string;
        display_name: string;
        points: bigint;
        matches: bigint;
        wins: bigint;
      }>
    >`
      SELECT mp.user_id, u.display_name,
             SUM(mp.coin_delta)                    AS points,
             COUNT(*)                              AS matches,
             COUNT(*) FILTER (WHERE mp.rank = 0)   AS wins
      FROM match_players mp
      JOIN matches m ON m.id = mp.match_id
      JOIN users u   ON u.id = mp.user_id
      WHERE m.ended_at >= ${weekStart}
      GROUP BY mp.user_id, u.display_name
      ORDER BY points DESC
      LIMIT 10
    `;
    const entries: LeaderboardEntry[] = rows.map((r) => ({
      userId: r.user_id,
      displayName: r.display_name,
      points: Number(r.points),
      matches: Number(r.matches),
      wins: Number(r.wins),
    }));
    return { weekStart: weekStart.toISOString(), entries };
  }

  private ensureDb(): void {
    if (!this.prisma.enabled) {
      throw new ServiceUnavailableException('REQUIRES_DATABASE');
    }
  }
}

function mondayOfCurrentWeek(): Date {
  const now = new Date();
  const day = now.getDay(); // 0 = CN
  const diffToMonday = day === 0 ? 6 : day - 1;
  const monday = new Date(now);
  monday.setDate(now.getDate() - diffToMonday);
  monday.setHours(0, 0, 0, 0);
  return monday;
}
