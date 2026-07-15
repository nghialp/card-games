import type { Card, Rank, Suit } from '@card-games/types';

/**
 * Giá trị so sánh tuyệt đối của một lá: rank trước, cùng rank so chất.
 * 3♠ nhỏ nhất (12), 2♥ lớn nhất (63).
 */
export const cardValue = (c: Card): number => c.rank * 4 + c.suit;

export const compareCards = (a: Card, b: Card): number =>
  cardValue(a) - cardValue(b);

export const sortCards = (cards: readonly Card[]): Card[] =>
  [...cards].sort(compareCards);

export const sameCard = (a: Card, b: Card): boolean =>
  a.rank === b.rank && a.suit === b.suit;

export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (let rank = 3; rank <= 15; rank++) {
    for (let suit = 0; suit <= 3; suit++) {
      deck.push({ rank: rank as Rank, suit: suit as Suit });
    }
  }
  return deck;
}

/**
 * Nguồn ngẫu nhiên được inject để server dùng CSPRNG (crypto.randomInt)
 * còn test dùng seed cố định. Trả về số nguyên trong [0, maxExclusive).
 */
export type Rng = (maxExclusive: number) => number;

/** Fisher–Yates, không đụng vào mảng gốc */
export function shuffle(deck: readonly Card[], rng: Rng): Card[] {
  const cards = [...deck];
  for (let i = cards.length - 1; i > 0; i--) {
    const j = rng(i + 1);
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

/** Chia 52 lá thành 4 tay 13 lá đã sắp xếp */
export function deal(deck: readonly Card[]): [Card[], Card[], Card[], Card[]] {
  if (deck.length !== 52) throw new Error('deck must have 52 cards');
  const hands: [Card[], Card[], Card[], Card[]] = [[], [], [], []];
  deck.forEach((card, i) => hands[i % 4].push(card));
  return hands.map(sortCards) as [Card[], Card[], Card[], Card[]];
}

/** Ván đầu tiên: ai giữ 3♠ đi trước */
export function findStartingSeat(hands: readonly Card[][]): number {
  const seat = hands.findIndex((hand) =>
    hand.some((c) => c.rank === 3 && c.suit === 0),
  );
  if (seat === -1) throw new Error('no 3♠ found in any hand');
  return seat;
}
