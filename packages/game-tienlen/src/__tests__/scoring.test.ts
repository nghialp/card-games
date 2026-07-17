import { describe, expect, it } from 'vitest';
import type { Card, Rank, Suit } from '@card-games/types';
import { checkInstantWin, pigPenalty } from '../scoring';

const c = (rank: number, suit: number): Card => ({
  rank: rank as Rank,
  suit: suit as Suit,
});

// tay 13 lá "thường" để làm nền
const filler = (n: number): Card[] =>
  [c(3, 0), c(5, 1), c(7, 2), c(9, 3), c(11, 0), c(13, 1), c(4, 2), c(6, 3), c(8, 0)].slice(0, n);

describe('checkInstantWin', () => {
  it('tứ quý heo', () => {
    const hand = [c(15, 0), c(15, 1), c(15, 2), c(15, 3), ...filler(9)];
    expect(checkInstantWin(hand)).toBe('four-pigs');
  });

  it('sảnh rồng 3→A', () => {
    const hand: Card[] = [];
    for (let rank = 3; rank <= 14; rank++) hand.push(c(rank, rank % 4));
    hand.push(c(3, 3)); // lá 13
    expect(checkInstantWin(hand)).toBe('dragon-straight');
  });

  it('4 đôi thông', () => {
    const hand = [
      c(6, 0), c(6, 1), c(7, 0), c(7, 1), c(8, 0), c(8, 1), c(9, 0), c(9, 1),
      c(3, 0), c(12, 1), c(13, 2), c(14, 3), c(15, 0),
    ];
    expect(checkInstantWin(hand)).toBe('four-pair-seq');
  });

  it('6 đôi bất kỳ', () => {
    const hand = [
      c(3, 0), c(3, 1), c(5, 0), c(5, 1), c(8, 0), c(8, 1),
      c(10, 0), c(10, 1), c(12, 0), c(12, 1), c(14, 0), c(14, 1),
      c(7, 2),
    ];
    expect(checkInstantWin(hand)).toBe('six-pairs');
  });

  it('bài thường → null', () => {
    // thiếu rank 4 (không sảnh rồng), chỉ 2 đôi, 1 heo
    const hand = [
      c(3, 0), c(3, 1), c(6, 2), c(7, 3), c(9, 0), c(9, 1), c(11, 2),
      c(12, 3), c(13, 0), c(14, 1), c(15, 2), c(5, 0), c(8, 1),
    ];
    expect(checkInstantWin(hand)).toBeNull();
  });

  it('tứ quý heo được ưu tiên hơn 6 đôi', () => {
    const hand = [
      c(15, 0), c(15, 1), c(15, 2), c(15, 3),
      c(3, 0), c(3, 1), c(5, 0), c(5, 1), c(8, 0), c(8, 1), c(10, 0), c(10, 1),
      c(7, 2),
    ];
    expect(checkInstantWin(hand)).toBe('four-pigs');
  });
});

describe('pigPenalty', () => {
  it('heo đen 1×, heo đỏ 2× mức cược', () => {
    expect(pigPenalty([c(15, 0), c(4, 1)], 10)).toBe(10); // heo ♠
    expect(pigPenalty([c(15, 3)], 10)).toBe(20); // heo ♥
    expect(pigPenalty([c(15, 0), c(15, 1), c(15, 2)], 10)).toBe(40); // ♠+♣+♦
    expect(pigPenalty([c(9, 0), c(13, 2)], 10)).toBe(0);
    expect(pigPenalty([c(15, 3)], 0)).toBe(0); // phòng chơi vui không phạt
  });
});
