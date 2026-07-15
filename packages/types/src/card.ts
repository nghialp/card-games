/** Chất bài, thứ tự Tiến lên miền Nam: ♠ < ♣ < ♦ < ♥ */
export type Suit = 0 | 1 | 2 | 3;

/** 3–10 giữ nguyên, J=11, Q=12, K=13, A=14, 2(heo)=15 */
export type Rank = 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15;

export interface Card {
  rank: Rank;
  suit: Suit;
}

export const RANK_PIG: Rank = 15;

export const SUIT_LABELS = ['♠', '♣', '♦', '♥'] as const;
