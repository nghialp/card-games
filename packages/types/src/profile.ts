import type { AuthUser } from './auth';

export interface MatchHistoryPlayer {
  displayName: string;
  rank: number;
  coinDelta: number;
}

export interface MatchHistoryEntry {
  matchId: string;
  gameType: string;
  betAmount: number;
  /** ISO datetime */
  endedAt: string;
  /** Hạng của mình trong trận, 0 = thắng */
  rank: number;
  coinDelta: number;
  players: MatchHistoryPlayer[];
}

export interface ProfileStats {
  totalMatches: number;
  wins: number;
}

export interface ProfileResponse {
  user: AuthUser;
  balance: number;
  stats: ProfileStats;
  /** 20 trận gần nhất, mới nhất trước */
  matches: MatchHistoryEntry[];
}

export interface LeaderboardEntry {
  userId: string;
  displayName: string;
  /** Tổng củ thắng/thua trong tuần */
  points: number;
  matches: number;
  wins: number;
}

export interface LeaderboardResponse {
  /** ISO datetime — 00:00 thứ Hai của tuần hiện tại */
  weekStart: string;
  entries: LeaderboardEntry[];
}
