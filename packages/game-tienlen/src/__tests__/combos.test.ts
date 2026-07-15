import { describe, expect, it } from 'vitest';
import type { Card, Rank, Suit } from '@card-games/types';
import { createDeck, deal, findStartingSeat, shuffle } from '../cards';
import { canBeat, ComboType, detectCombo } from '../combos';
import { findBeatingCombos, validatePlay } from '../play';

const c = (rank: number, suit: number): Card => ({
  rank: rank as Rank,
  suit: suit as Suit,
});

// ♠=0 ♣=1 ♦=2 ♥=3 — 2 (heo) = rank 15, A = 14

describe('detectCombo', () => {
  it('nhận diện lá lẻ, đôi, ba, tứ quý', () => {
    expect(detectCombo([c(5, 0)])?.type).toBe(ComboType.Single);
    expect(detectCombo([c(5, 0), c(5, 3)])?.type).toBe(ComboType.Pair);
    expect(detectCombo([c(5, 0), c(5, 1), c(5, 2)])?.type).toBe(
      ComboType.Triple,
    );
    expect(detectCombo([c(5, 0), c(5, 1), c(5, 2), c(5, 3)])?.type).toBe(
      ComboType.Quad,
    );
  });

  it('nhận diện sảnh, từ chối sảnh chứa heo', () => {
    expect(detectCombo([c(3, 0), c(4, 1), c(5, 2)])?.type).toBe(
      ComboType.Straight,
    );
    // Q K A hợp lệ
    expect(detectCombo([c(12, 0), c(13, 1), c(14, 2)])?.type).toBe(
      ComboType.Straight,
    );
    // K A 2 không hợp lệ
    expect(detectCombo([c(13, 0), c(14, 1), c(15, 2)])).toBeNull();
  });

  it('nhận diện 3 đôi thông, từ chối đôi không liên tiếp', () => {
    const threePairSeq = [c(6, 0), c(6, 1), c(7, 0), c(7, 2), c(8, 1), c(8, 3)];
    expect(detectCombo(threePairSeq)?.type).toBe(ComboType.DoubleSeq);
    expect(detectCombo(threePairSeq)?.length).toBe(3);

    const gapped = [c(6, 0), c(6, 1), c(8, 0), c(8, 2), c(9, 1), c(9, 3)];
    expect(detectCombo(gapped)).toBeNull();
  });

  it('từ chối nhóm lá rác', () => {
    expect(detectCombo([c(4, 0), c(9, 1)])).toBeNull();
    expect(detectCombo([])).toBeNull();
  });
});

describe('canBeat', () => {
  const combo = (cards: Card[]) => detectCombo(cards)!;

  it('cùng loại: lá cao hơn thắng, tính cả chất', () => {
    expect(canBeat(combo([c(10, 3)]), combo([c(10, 0)]))).toBe(true);
    expect(canBeat(combo([c(9, 3)]), combo([c(10, 0)]))).toBe(false);
    // sảnh cùng độ dài
    expect(
      canBeat(combo([c(4, 0), c(5, 0), c(6, 3)]), combo([c(4, 1), c(5, 1), c(6, 2)])),
    ).toBe(true);
    // sảnh khác độ dài không so được
    expect(
      canBeat(
        combo([c(4, 0), c(5, 0), c(6, 0), c(7, 0)]),
        combo([c(4, 1), c(5, 1), c(6, 2)]),
      ),
    ).toBe(false);
  });

  it('3 đôi thông chặt 1 heo nhưng không chặt đôi heo', () => {
    const threePairSeq = combo([c(6, 0), c(6, 1), c(7, 0), c(7, 2), c(8, 1), c(8, 3)]);
    expect(canBeat(threePairSeq, combo([c(15, 3)]))).toBe(true);
    expect(canBeat(threePairSeq, combo([c(15, 0), c(15, 3)]))).toBe(false);
  });

  it('tứ quý chặt heo, đôi heo và 3 đôi thông', () => {
    const quad = combo([c(5, 0), c(5, 1), c(5, 2), c(5, 3)]);
    const threePairSeq = combo([c(6, 0), c(6, 1), c(7, 0), c(7, 2), c(8, 1), c(8, 3)]);
    expect(canBeat(quad, combo([c(15, 0)]))).toBe(true);
    expect(canBeat(quad, combo([c(15, 0), c(15, 3)]))).toBe(true);
    expect(canBeat(quad, threePairSeq)).toBe(true);
    // nhưng không chặt được lá thường
    expect(canBeat(quad, combo([c(14, 0)]))).toBe(false);
  });

  it('tứ quý cao đè tứ quý thấp, 4 đôi thông đè tứ quý', () => {
    const quad5 = combo([c(5, 0), c(5, 1), c(5, 2), c(5, 3)]);
    const quad9 = combo([c(9, 0), c(9, 1), c(9, 2), c(9, 3)]);
    const fourPairSeq = combo([
      c(6, 0), c(6, 1), c(7, 0), c(7, 2), c(8, 1), c(8, 3), c(9, 0), c(9, 1),
    ]);
    expect(canBeat(quad9, quad5)).toBe(true);
    expect(canBeat(quad5, quad9)).toBe(false);
    expect(canBeat(fourPairSeq, quad9)).toBe(true);
  });
});

describe('validatePlay', () => {
  it('từ chối bài không có trong tay', () => {
    const hand = [c(5, 0), c(6, 1)];
    expect(validatePlay(hand, [c(7, 0)], null)).toBeNull();
    expect(validatePlay(hand, [c(5, 0)], null)?.type).toBe(ComboType.Single);
  });

  it('bắt buộc chứa 3♠ ở lượt mở ván đầu', () => {
    const hand = [c(3, 0), c(5, 0), c(6, 1)];
    expect(validatePlay(hand, [c(5, 0)], null, c(3, 0))).toBeNull();
    expect(validatePlay(hand, [c(3, 0)], null, c(3, 0))).not.toBeNull();
  });

  it('phải chặt được bài trên bàn', () => {
    const hand = [c(9, 0), c(11, 3)];
    const prev = detectCombo([c(10, 2)])!;
    expect(validatePlay(hand, [c(9, 0)], prev)).toBeNull();
    expect(validatePlay(hand, [c(11, 3)], prev)).not.toBeNull();
  });
});

describe('findBeatingCombos', () => {
  it('tìm được nước chặt heo bằng tứ quý trong tay', () => {
    const hand = [c(5, 0), c(5, 1), c(5, 2), c(5, 3), c(8, 0)];
    const prev = detectCombo([c(15, 3)])!;
    const beats = findBeatingCombos(hand, prev);
    expect(beats.some((b) => b.type === ComboType.Quad)).toBe(true);
  });

  it('trả về rỗng khi hết nước', () => {
    const hand = [c(4, 0), c(6, 1)];
    const prev = detectCombo([c(15, 3)])!;
    expect(findBeatingCombos(hand, prev)).toHaveLength(0);
  });
});

describe('deck & deal', () => {
  it('bộ bài đủ 52 lá không trùng', () => {
    const deck = createDeck();
    expect(deck).toHaveLength(52);
    const keys = new Set(deck.map((card) => `${card.rank}.${card.suit}`));
    expect(keys.size).toBe(52);
  });

  it('chia đủ 4 tay 13 lá, tìm đúng người giữ 3♠', () => {
    // rng giả lập seed cố định
    let seed = 42;
    const rng = (max: number) => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed % max;
    };
    const hands = deal(shuffle(createDeck(), rng));
    expect(hands.every((h) => h.length === 13)).toBe(true);
    const seat = findStartingSeat(hands);
    expect(hands[seat].some((card) => card.rank === 3 && card.suit === 0)).toBe(
      true,
    );
  });
});
