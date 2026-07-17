import type { Card } from '@card-games/types';
import { RANK_PIG } from '@card-games/types';

/** Các kiểu tới trắng, xếp theo độ mạnh giảm dần */
export const INSTANT_WIN_PRIORITY = [
  'four-pigs', // tứ quý heo
  'dragon-straight', // sảnh rồng 3→A
  'four-pair-seq', // 4 đôi thông
  'six-pairs', // 6 đôi bất kỳ
] as const;

export type InstantWinType = (typeof INSTANT_WIN_PRIORITY)[number];

export const INSTANT_WIN_LABELS: Record<InstantWinType, string> = {
  'four-pigs': 'Tứ quý heo',
  'dragon-straight': 'Sảnh rồng',
  'four-pair-seq': '4 đôi thông',
  'six-pairs': '6 đôi',
};

/** Kiểm tra bài 13 lá có tới trắng không (trả về kiểu mạnh nhất) */
export function checkInstantWin(hand: readonly Card[]): InstantWinType | null {
  const countByRank = new Map<number, number>();
  for (const c of hand) {
    countByRank.set(c.rank, (countByRank.get(c.rank) ?? 0) + 1);
  }

  if ((countByRank.get(RANK_PIG) ?? 0) === 4) return 'four-pigs';

  // Sảnh rồng: đủ 12 rank từ 3 tới A
  let dragon = true;
  for (let rank = 3; rank <= 14; rank++) {
    if (!countByRank.has(rank)) {
      dragon = false;
      break;
    }
  }
  if (dragon) return 'dragon-straight';

  // 4 đôi thông: 4 rank liên tiếp (không tính heo) mỗi rank có đủ đôi
  for (let start = 3; start <= 11; start++) {
    let ok = true;
    for (let rank = start; rank < start + 4; rank++) {
      if ((countByRank.get(rank) ?? 0) < 2) {
        ok = false;
        break;
      }
    }
    if (ok) return 'four-pair-seq';
  }

  // 6 đôi bất kỳ
  let pairs = 0;
  for (const count of countByRank.values()) {
    pairs += Math.floor(count / 2);
  }
  if (pairs >= 6) return 'six-pairs';

  return null;
}

/**
 * Thối heo: kết ván mà còn heo trên tay thì bị phạt —
 * heo đen (♠/♣) đền 1× mức cược, heo đỏ (♦/♥) đền 2×.
 */
export function pigPenalty(hand: readonly Card[], betAmount: number): number {
  return hand
    .filter((c) => c.rank === RANK_PIG)
    .reduce((sum, c) => sum + (c.suit >= 2 ? 2 : 1) * betAmount, 0);
}
