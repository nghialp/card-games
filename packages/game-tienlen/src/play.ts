import type { Card } from '@card-games/types';
import { sameCard, sortCards } from './cards';
import { canBeat, detectCombo, type Combo } from './combos';

export function isSubsetOfHand(
  hand: readonly Card[],
  cards: readonly Card[],
): boolean {
  return cards.every((c) => hand.some((h) => sameCard(h, c)));
}

/**
 * Kiểm tra một nước đi: bài phải nằm trong tay, tạo thành tổ hợp hợp lệ,
 * và chặt được bài trên bàn (nếu có). Trả về Combo khi hợp lệ, null khi không.
 *
 * `mustContain` dùng cho lượt đầu ván đầu tiên (bắt buộc có 3♠).
 */
export function validatePlay(
  hand: readonly Card[],
  cards: readonly Card[],
  prev: Combo | null,
  mustContain?: Card,
): Combo | null {
  if (cards.length === 0) return null;
  if (!isSubsetOfHand(hand, cards)) return null;
  if (mustContain && !cards.some((c) => sameCard(c, mustContain))) return null;

  const combo = detectCombo(cards);
  if (!combo) return null;
  if (prev && !canBeat(combo, prev)) return null;
  return combo;
}

/** Người chơi còn nước chặt `prev` không — dùng cho gợi ý và auto-pass */
export function hasPlayableCombo(
  hand: readonly Card[],
  prev: Combo | null,
): boolean {
  if (!prev) return hand.length > 0;
  // Duyệt tổ hợp con là quá đắt (2^13); kiểm tra theo từng loại đủ dùng:
  // cùng loại cùng độ dài giá trị cao hơn, hoặc hàng chặt.
  return findBeatingCombos(hand, prev).length > 0;
}

/** Liệt kê các tổ hợp trong tay chặt được `prev` (client dùng để highlight) */
export function findBeatingCombos(
  hand: readonly Card[],
  prev: Combo,
): Combo[] {
  const results: Combo[] = [];
  const seen = new Set<string>();

  const tryCombo = (cards: Card[]): void => {
    const key = cards
      .map((c) => `${c.rank}.${c.suit}`)
      .sort()
      .join(',');
    if (seen.has(key)) return;
    seen.add(key);
    const combo = detectCombo(cards);
    if (combo && canBeat(combo, prev)) results.push(combo);
  };

  // Nhóm theo rank (mỗi nhóm sắp theo chất tăng dần) để sinh đôi/ba/tứ quý
  const byRank = new Map<number, Card[]>();
  for (const c of sortCards(hand)) {
    byRank.set(c.rank, [...(byRank.get(c.rank) ?? []), c]);
  }

  for (const c of hand) tryCombo([c]);
  for (const group of byRank.values()) {
    for (let size = 2; size <= group.length; size++) {
      tryCombo(group.slice(0, size));
    }
  }

  // Sảnh và đôi thông: sinh các dãy rank liên tiếp có trong tay
  const ranks = [...byRank.keys()].filter((r) => r !== 15).sort((a, b) => a - b);
  for (let start = 0; start < ranks.length; start++) {
    for (let end = start + 1; end < ranks.length; end++) {
      if (ranks[end] !== ranks[end - 1] + 1) break;
      const run = ranks.slice(start, end + 1);
      if (run.length >= 3) {
        // Lá cuối sảnh quyết định hơn thua → lấy chất cao nhất của rank đó
        tryCombo(
          run.map((r, i) => {
            const group = byRank.get(r)!;
            return i === run.length - 1 ? group[group.length - 1] : group[0];
          }),
        );
        if (run.every((r) => byRank.get(r)!.length >= 2)) {
          tryCombo(run.flatMap((r) => byRank.get(r)!.slice(0, 2)));
        }
      }
    }
  }

  return results;
}
