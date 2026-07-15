import type { Card } from '@card-games/types';
import { RANK_PIG } from '@card-games/types';
import { cardValue, sortCards } from './cards';

export enum ComboType {
  Single = 'single',
  Pair = 'pair',
  Triple = 'triple',
  Quad = 'quad', // tứ quý
  Straight = 'straight', // sảnh
  DoubleSeq = 'double-seq', // đôi thông
}

export interface Combo {
  type: ComboType;
  cards: Card[];
  /**
   * Với Straight: số lá. Với DoubleSeq: số đôi. Còn lại: 1.
   * Hai combo cùng type chỉ so được khi cùng length.
   */
  length: number;
  /** Giá trị lá cao nhất — dùng để so hơn thua */
  value: number;
}

const ranksConsecutive = (ranks: number[]): boolean =>
  ranks.every((r, i) => i === 0 || r === ranks[i - 1] + 1);

/**
 * Nhận diện tổ hợp hợp lệ từ một nhóm lá bất kỳ.
 * Trả về null nếu không phải tổ hợp nào.
 */
export function detectCombo(cards: readonly Card[]): Combo | null {
  const n = cards.length;
  if (n === 0) return null;

  const sorted = sortCards(cards);
  const ranks = sorted.map((c) => c.rank);
  const value = cardValue(sorted[n - 1]);
  const allSameRank = ranks.every((r) => r === ranks[0]);

  if (n === 1) return { type: ComboType.Single, cards: sorted, length: 1, value };
  if (allSameRank) {
    if (n === 2) return { type: ComboType.Pair, cards: sorted, length: 1, value };
    if (n === 3) return { type: ComboType.Triple, cards: sorted, length: 1, value };
    if (n === 4) return { type: ComboType.Quad, cards: sorted, length: 1, value };
    return null;
  }

  // Sảnh: ≥3 lá liên tiếp khác rank, không chứa heo
  if (n >= 3 && !ranks.includes(RANK_PIG) && ranksConsecutive(ranks)) {
    return { type: ComboType.Straight, cards: sorted, length: n, value };
  }

  // Đôi thông: ≥3 đôi liên tiếp, không chứa heo
  if (n >= 6 && n % 2 === 0 && !ranks.includes(RANK_PIG)) {
    const pairRanks: number[] = [];
    for (let i = 0; i < n; i += 2) {
      if (ranks[i] !== ranks[i + 1]) return null;
      pairRanks.push(ranks[i]);
    }
    if (ranksConsecutive(pairRanks)) {
      return { type: ComboType.DoubleSeq, cards: sorted, length: n / 2, value };
    }
  }

  return null;
}

/**
 * Sức mạnh "hàng chặt": 3 đôi thông < tứ quý < 4 đôi thông trở lên.
 * 0 = không phải hàng.
 */
function bombTier(c: Combo): number {
  if (c.type === ComboType.DoubleSeq && c.length === 3) return 1;
  if (c.type === ComboType.Quad) return 2;
  if (c.type === ComboType.DoubleSeq && c.length >= 4) return 3;
  return 0;
}

const isPig = (c: Combo): boolean =>
  c.cards.length > 0 && c.cards[0].rank === RANK_PIG;

/** `next` có chặt được `prev` không */
export function canBeat(next: Combo, prev: Combo): boolean {
  // Cùng loại cùng độ dài: so lá cao nhất
  if (next.type === prev.type && next.length === prev.length) {
    return next.value > prev.value;
  }

  const nextTier = bombTier(next);
  if (nextTier === 0) return false;

  // Chặt heo: 3 đôi thông trở lên chặt 1 heo; tứ quý trở lên chặt đôi heo
  if (prev.type === ComboType.Single && isPig(prev)) return true;
  if (prev.type === ComboType.Pair && isPig(prev)) return nextTier >= 2;

  // Hàng đè hàng: tier cao hơn thắng (cùng tier cùng loại đã xử lý ở trên)
  const prevTier = bombTier(prev);
  return prevTier > 0 && nextTier > prevTier;
}
