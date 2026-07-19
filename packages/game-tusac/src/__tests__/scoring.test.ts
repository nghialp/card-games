import { describe, expect, it } from 'vitest';
import { Color, Piece, type Tile } from '../tiles';
import type { MatchResult } from '../match';
import { scoreMatch } from '../scoring';

const t = (piece: Piece, color: Color): Tile => ({ piece, color });
const win = (winner: number, quan = false): MatchResult => ({ kind: 'win', winner, quan });
const draw: MatchResult = { kind: 'draw' };

describe('scoreMatch — cơ bản', () => {
  it('tới trơn: mỗi người thua trả 1× cược', () => {
    const r = scoreMatch({ result: win(0), numPlayers: 4, betAmount: 10 });
    expect(r.coinDelta).toEqual({ 0: 30, 1: -10, 2: -10, 3: -10 });
    expect(r.detail.perLoser).toBe(10);
  });

  it('tới quan: 2× cược', () => {
    const r = scoreMatch({ result: win(1, true), numPlayers: 4, betAmount: 10 });
    expect(r.coinDelta).toEqual({ 0: -20, 1: 60, 2: -20, 3: -20 });
  });

  it('hoà: không ai thắng thua', () => {
    const r = scoreMatch({ result: draw, numPlayers: 3, betAmount: 10 });
    expect(r.coinDelta).toEqual({ 0: 0, 1: 0, 2: 0 });
  });
});

describe('scoreMatch — tướng vàng', () => {
  it('mỗi lá tướng vàng = +0.5× cược / người thua (cả tới trơn)', () => {
    const winnerTiles = [t(Piece.General, Color.Yellow), t(Piece.General, Color.Yellow)];
    const r = scoreMatch({ result: win(0), numPlayers: 3, betAmount: 10, winnerTiles });
    // perLoser = 10 + 5*2 = 20
    expect(r.detail.tuongVang).toBe(2);
    expect(r.detail.perLoser).toBe(20);
    expect(r.coinDelta).toEqual({ 0: 40, 1: -20, 2: -20 });
  });

  it('tướng đỏ không tính', () => {
    const r = scoreMatch({
      result: win(0),
      numPlayers: 2,
      betAmount: 10,
      winnerTiles: [t(Piece.General, Color.Red)],
    });
    expect(r.detail.tuongVang).toBe(0);
    expect(r.coinDelta).toEqual({ 0: 10, 1: -10 });
  });
});

describe('scoreMatch — đậu heo', () => {
  it('mọi người đóng heo mỗi ván; tới quan hốt heo', () => {
    const r = scoreMatch({
      result: win(0, true),
      numPlayers: 3,
      betAmount: 10,
      heo: { enabled: true, ante: 5, pot: 20 },
    });
    // đóng: mỗi người -5, pot = 20 + 15 = 35; tới quan perLoser 20; winner hốt 35
    // winner: -5 + 20*2 + 35 = 70; loser: -5 - 20 = -25
    expect(r.coinDelta).toEqual({ 0: 70, 1: -25, 2: -25 });
    expect(r.heoPot).toBe(0); // heo reset sau tới quan
    expect(r.detail.heoTaken).toBe(35);
  });

  it('tới trơn: đóng heo nhưng KHÔNG hốt (heo tích luỹ)', () => {
    const r = scoreMatch({
      result: win(0),
      numPlayers: 3,
      betAmount: 10,
      heo: { enabled: true, ante: 5, pot: 20 },
    });
    // đóng -5 mỗi người, pot 35 (giữ); winner: -5 + 10*2 = 15; loser -5 -10 = -15
    expect(r.coinDelta).toEqual({ 0: 15, 1: -15, 2: -15 });
    expect(r.heoPot).toBe(35);
    expect(r.detail.heoTaken).toBe(0);
  });

  it('hoà có heo: chỉ đóng heo, tích luỹ', () => {
    const r = scoreMatch({
      result: draw,
      numPlayers: 4,
      betAmount: 10,
      heo: { enabled: true, ante: 5, pot: 10 },
    });
    expect(r.coinDelta).toEqual({ 0: -5, 1: -5, 2: -5, 3: -5 });
    expect(r.heoPot).toBe(10 + 20);
  });
});
