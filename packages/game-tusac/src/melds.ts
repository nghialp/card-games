import {
  cellOf,
  CELL_COUNT,
  Color,
  colorOfCell,
  Piece,
  pieceOfCell,
  toCounts,
  type Counts,
  type Tile,
} from './tiles';

/** Các loại nhóm hợp lệ — xem docs/tusac-rules.md mục 14.1 */
export enum Meld {
  Pair = 'pair', // đôi (2 cùng quân+màu)
  Triple = 'triple', // khạp (3 cùng quân+màu)
  Quad = 'quad', // quằn (4 cùng quân+màu)
  GeneralSingle = 'general-single', // tướng lẻ
  LienChariot = 'lien-chariot', // Xe–Pháo–Mã cùng màu
  LienGeneral = 'lien-general', // Tướng–Sỹ–Tượng cùng màu
  LienSoldier = 'lien-soldier', // 3 hoặc 4 Tốt khác màu
}

const CHARIOT_PIECES = [Piece.Chariot, Piece.Cannon, Piece.Horse];
const GENERAL_PIECES = [Piece.General, Piece.Advisor, Piece.Elephant];

const isPieceSet = (tiles: readonly Tile[], want: readonly Piece[]): boolean => {
  const got = new Set(tiles.map((t) => t.piece));
  return got.size === want.length && want.every((p) => got.has(p));
};

/**
 * Phân loại một nhóm lá thành đúng một Meld hợp lệ, hoặc null nếu không hợp lệ.
 * (Kiểm tra MỘT nhóm — không phân hoạch cả tay bài; dùng isWinningHand cho việc đó.)
 */
export function detectMeld(tiles: readonly Tile[]): Meld | null {
  const n = tiles.length;
  if (n === 0) return null;

  const allSame = tiles.every(
    (t) => t.piece === tiles[0].piece && t.color === tiles[0].color,
  );
  const allSoldier = tiles.every((t) => t.piece === Piece.Soldier);
  const distinctColors = new Set(tiles.map((t) => t.color)).size;
  const oneColor = new Set(tiles.map((t) => t.color)).size === 1;

  if (n === 1) {
    return tiles[0].piece === Piece.General ? Meld.GeneralSingle : null;
  }
  if (n === 2) return allSame ? Meld.Pair : null;
  if (n === 3) {
    if (allSame) return Meld.Triple;
    if (allSoldier) return distinctColors === 3 ? Meld.LienSoldier : null;
    if (oneColor && isPieceSet(tiles, CHARIOT_PIECES)) return Meld.LienChariot;
    if (oneColor && isPieceSet(tiles, GENERAL_PIECES)) return Meld.LienGeneral;
    return null;
  }
  if (n === 4) {
    if (allSame) return Meld.Quad;
    if (allSoldier) return distinctColors === 4 ? Meld.LienSoldier : null;
    return null;
  }
  return null;
}

/**
 * Tay bài đã "tròn" chưa — chia hết thành các nhóm hợp lệ, không lá lẻ.
 * (docs/tusac-rules.md mục 14.1). Backtracking trên vector đếm 28 ô.
 */
export function isWinningHand(tiles: readonly Tile[]): boolean {
  return canPartition(toCounts(tiles), new Map());
}

function canPartition(counts: Counts, memo: Map<string, boolean>): boolean {
  const key = counts.join(',');
  const cached = memo.get(key);
  if (cached !== undefined) return cached;

  // Lá tại ô nhỏ nhất còn dư phải nằm trong một nhóm nào đó → thử mọi nhóm chứa nó.
  const cell = firstCell(counts);
  if (cell === -1) return true; // hết lá → tròn

  let result = false;
  for (const delta of meldDeltas(counts, pieceOfCell(cell), colorOfCell(cell))) {
    applyDelta(counts, delta, -1);
    const ok = canPartition(counts, memo);
    applyDelta(counts, delta, +1);
    if (ok) {
      result = true;
      break;
    }
  }
  memo.set(key, result);
  return result;
}

/** Số lá tối đa có thể gom vào các NHÓM HOÀN CHỈNH (§4); phần còn lại là "rác". */
export function maxMeldCover(tiles: readonly Tile[]): number {
  return coverCounts(toCounts(tiles), new Map(), true);
}

/** Số lá "rác" tối thiểu (không vào được nhóm hoàn chỉnh nào). */
export function looseCount(tiles: readonly Tile[]): number {
  return tiles.length - maxMeldCover(tiles);
}

/**
 * Như looseCount nhưng KHÔNG tính Tướng-lẻ là nhóm — dùng để phát hiện nước ăn
 * "xé liền để Tướng trơ ra" (§5.1: liền không được xé).
 */
export function looseCountHard(tiles: readonly Tile[]): number {
  return tiles.length - coverCounts(toCounts(tiles), new Map(), false);
}

function coverCounts(
  counts: Counts,
  memo: Map<string, number>,
  allowGeneralSingle: boolean,
): number {
  const key = counts.join(',');
  const cached = memo.get(key);
  if (cached !== undefined) return cached;

  const cell = firstCell(counts);
  if (cell === -1) return 0;

  // Phương án 1: bỏ lá này làm rác (phủ 0)
  counts[cell] -= 1;
  let best = coverCounts(counts, memo, allowGeneralSingle);
  counts[cell] += 1;

  // Phương án 2: gom lá này vào một nhóm hoàn chỉnh
  for (const delta of meldDeltas(counts, pieceOfCell(cell), colorOfCell(cell))) {
    // Nhóm "Tướng lẻ" (1 lá) chỉ tính khi được phép
    const size = delta.reduce((s, [, amt]) => s + amt, 0);
    if (size === 1 && !allowGeneralSingle) continue;
    applyDelta(counts, delta, -1);
    best = Math.max(best, size + coverCounts(counts, memo, allowGeneralSingle));
    applyDelta(counts, delta, +1);
  }

  memo.set(key, best);
  return best;
}

type Delta = Array<[cell: number, amount: number]>;

const firstCell = (counts: Counts): number => {
  for (let i = 0; i < CELL_COUNT; i++) if (counts[i] > 0) return i;
  return -1;
};

const applyDelta = (counts: Counts, delta: Delta, sign: number): void => {
  for (const [cell, amt] of delta) counts[cell] += sign * amt;
};

/**
 * Mọi nhóm HOÀN CHỈNH (§4) chứa ít nhất 1 lá của ô (piece,color) — dùng chung
 * cho kiểm tra tròn bài và tính độ phủ.
 */
function meldDeltas(counts: Counts, piece: Piece, color: Color): Delta[] {
  const c = cellOf(piece, color);
  const deltas: Delta[] = [];

  // Đôi / khạp / quằn (cùng quân+màu) — mọi quân
  if (counts[c] >= 2) deltas.push([[c, 2]]);
  if (counts[c] >= 3) deltas.push([[c, 3]]);
  if (counts[c] >= 4) deltas.push([[c, 4]]);

  // Tướng lẻ
  if (piece === Piece.General) deltas.push([[c, 1]]);

  // Liền Tướng–Sỹ–Tượng cùng màu
  if (piece === Piece.General || piece === Piece.Advisor || piece === Piece.Elephant) {
    const g = cellOf(Piece.General, color);
    const a = cellOf(Piece.Advisor, color);
    const e = cellOf(Piece.Elephant, color);
    if (counts[g] > 0 && counts[a] > 0 && counts[e] > 0) {
      deltas.push([[g, 1], [a, 1], [e, 1]]);
    }
  }

  // Liền Xe–Pháo–Mã cùng màu
  if (piece === Piece.Chariot || piece === Piece.Cannon || piece === Piece.Horse) {
    const x = cellOf(Piece.Chariot, color);
    const p = cellOf(Piece.Cannon, color);
    const h = cellOf(Piece.Horse, color);
    if (counts[x] > 0 && counts[p] > 0 && counts[h] > 0) {
      deltas.push([[x, 1], [p, 1], [h, 1]]);
    }
  }

  // Liền Tốt: 3 hoặc 4 màu khác nhau, phải chứa màu hiện tại
  if (piece === Piece.Soldier) {
    const others = [Color.Red, Color.Yellow, Color.Green, Color.White].filter(
      (oc) => oc !== color && counts[cellOf(Piece.Soldier, oc)] > 0,
    );
    for (let i = 0; i < others.length; i++) {
      for (let j = i + 1; j < others.length; j++) {
        deltas.push([
          [c, 1],
          [cellOf(Piece.Soldier, others[i]), 1],
          [cellOf(Piece.Soldier, others[j]), 1],
        ]);
      }
    }
    if (others.length === 3) {
      deltas.push([
        [c, 1],
        [cellOf(Piece.Soldier, others[0]), 1],
        [cellOf(Piece.Soldier, others[1]), 1],
        [cellOf(Piece.Soldier, others[2]), 1],
      ]);
    }
  }

  return deltas;
}
