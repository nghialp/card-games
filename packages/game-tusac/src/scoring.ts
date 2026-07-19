import { Color, Piece, type Tile } from './tiles';
import type { MatchResult } from './match';

/**
 * Tính tiền một ván Tứ Sắc (docs/tusac-rules.md §10).
 * - Tới trơn: mỗi người thua trả 1× cược. Tới quan (có quằn hạ bàn): 2×.
 * - Tướng vàng: mỗi lá Tướng vàng trong bài người tới = +0.5× cược / mỗi người thua
 *   (áp dụng cả tới trơn lẫn quan).
 * - Đậu heo (bật/tắt theo phòng): mỗi ván mỗi người đóng `ante` vào heo; khi có người
 *   TỚI QUAN thì người đó hốt hết heo, heo reset về 0.
 * - Hoà: không ai thắng/thua (nhưng vẫn đóng heo nếu bật).
 */

export interface HeoConfig {
  enabled: boolean;
  /** Mỗi người đóng vào heo mỗi ván */
  ante: number;
  /** Heo tích luỹ TRƯỚC ván này */
  pot: number;
}

export interface ScoreInput {
  result: MatchResult;
  numPlayers: number;
  betAmount: number;
  /** Toàn bộ lá của người tới (tay + phơi) — để đếm Tướng vàng. Bỏ trống nếu hoà. */
  winnerTiles?: readonly Tile[];
  heo?: HeoConfig;
}

export interface ScoreOutcome {
  /** Biến động củ ròng theo ghế */
  coinDelta: Record<number, number>;
  /** Heo sau ván (để phòng lưu lại) */
  heoPot: number;
  detail: {
    quan: boolean;
    tuongVang: number;
    /** Mỗi người thua trả (đã gồm thưởng tướng vàng, chưa gồm đóng heo) */
    perLoser: number;
    /** Heo người thắng hốt (0 nếu không tới quan) */
    heoTaken: number;
    ante: number;
  };
}

export function countYellowGenerals(tiles: readonly Tile[]): number {
  return tiles.filter((t) => t.piece === Piece.General && t.color === Color.Yellow).length;
}

export function scoreMatch(input: ScoreInput): ScoreOutcome {
  const { result, numPlayers, betAmount } = input;
  const heo = input.heo;
  const coinDelta: Record<number, number> = {};
  for (let s = 0; s < numPlayers; s++) coinDelta[s] = 0;

  // Đóng heo mỗi ván (nếu bật) — áp dụng cả khi hoà
  const ante = heo?.enabled ? heo.ante : 0;
  let pot = heo?.pot ?? 0;
  if (ante > 0) {
    for (let s = 0; s < numPlayers; s++) coinDelta[s] -= ante;
    pot += ante * numPlayers;
  }

  if (result.kind !== 'win' || result.winner === undefined) {
    return {
      coinDelta,
      heoPot: pot,
      detail: { quan: false, tuongVang: 0, perLoser: 0, heoTaken: 0, ante },
    };
  }

  const winner = result.winner;
  const quan = !!result.quan;
  const tuongVang = countYellowGenerals(input.winnerTiles ?? []);

  const base = quan ? betAmount * 2 : betAmount;
  const bonus = Math.round(betAmount / 2) * tuongVang; // 0.5× cược mỗi lá tướng vàng
  const perLoser = base + bonus;

  for (let s = 0; s < numPlayers; s++) {
    if (s === winner) continue;
    coinDelta[s] -= perLoser;
    coinDelta[winner] += perLoser;
  }

  // Tới quan hốt heo
  let heoTaken = 0;
  if (quan && heo?.enabled) {
    heoTaken = pot;
    coinDelta[winner] += heoTaken;
    pot = 0;
  }

  return {
    coinDelta,
    heoPot: pot,
    detail: { quan, tuongVang, perLoser, heoTaken, ante },
  };
}
