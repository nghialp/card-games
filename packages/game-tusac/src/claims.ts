import {
  cellOf,
  Color,
  countsToTiles,
  Piece,
  toCounts,
  type Tile,
} from './tiles';
import {
  detectMeld,
  isWinningHand,
  looseCount,
  looseCountHard,
  type Meld,
} from './melds';

/**
 * Luật "ăn" khi có lá được đánh/lật (docs/tusac-rules.md §5–§8).
 *
 * Nguyên tắc "không để lại rác" (§5) được tổng quát hoá thành: một nước ăn tùy
 * chọn chỉ hợp lệ nếu nó để lại **ÍT RÁC NHẤT** — nếu có nước "sạch hơn" (để lại
 * ít lá lẻ hơn) thì nước làm thừa rác bị loại. Nguyên tắc này tái tạo đúng các
 * ví dụ cụ thể trong §5 (vd: "2 Xe + 1 Pháo + 1 Mã → không được đôi Xe").
 */

export type ClaimKind = 'pair' | 'triple' | 'quad' | 'lien';

export interface Claim {
  kind: ClaimKind;
  meld: Meld;
  /** Lá lấy từ tay (không gồm lá được ăn) */
  fromHand: Tile[];
  /** Nhóm đầy đủ = fromHand + lá được ăn */
  tiles: Tile[];
  /** Được ăn NGOÀI lượt (giật vòng)? — chỉ đôi/khạp/khui (§7) */
  outOfTurn: boolean;
  /** Bắt buộc phải ăn (khui khạp, hoặc đôi ngoài lúc chờ tới) */
  mandatory: boolean;
}

export interface ClaimContext {
  /** Đang tới lượt mình? (ăn bằng rác/liền chỉ khi tới lượt — §7) */
  isOwnTurn: boolean;
  /** Đang "chờ tới" → được bỏ đôi (§8), nên đôi không còn bắt buộc */
  waitingToWin?: boolean;
}

const CHARIOT = [Piece.Chariot, Piece.Cannon, Piece.Horse];
const GENERAL = [Piece.General, Piece.Advisor, Piece.Elephant];
const COLORS = [Color.Red, Color.Yellow, Color.Green, Color.White];

/** Ăn lá `claimed` có giúp tròn bài (tới) không */
export function canWin(hand: readonly Tile[], claimed: Tile): boolean {
  return isWinningHand([...hand, claimed]);
}

/** Tay bài đang "chờ tới" — chỉ cần thêm 1 lá phù hợp là tròn (§8) */
export function isTenpai(hand: readonly Tile[]): boolean {
  for (let piece = 0; piece < 7; piece++) {
    for (let color = 0; color < 4; color++) {
      if (isWinningHand([...hand, { piece: piece as Piece, color: color as Color }])) {
        return true;
      }
    }
  }
  return false;
}

/** Các cách ăn hợp lệ lá `claimed` từ tay `hand` trong ngữ cảnh `ctx` */
export function legalClaims(
  hand: readonly Tile[],
  claimed: Tile,
  ctx: ClaimContext,
): Claim[] {
  const counts = toCounts(hand);
  const raw: Array<{ kind: ClaimKind; fromHand: Tile[] }> = [];

  const c = cellOf(claimed.piece, claimed.color);
  const same = counts[c];
  const self = (n: number): Tile[] =>
    Array.from({ length: n }, () => ({ ...claimed }));

  // Đôi/khạp/quằn cùng quân+màu. Tướng KHÔNG được ăn để đôi/khạp — chỉ khui (giật con thứ 4).
  if (claimed.piece === Piece.General) {
    if (same >= 3) raw.push({ kind: 'quad', fromHand: self(3) });
  } else {
    if (same >= 1) raw.push({ kind: 'pair', fromHand: self(1) });
    if (same >= 2) raw.push({ kind: 'triple', fromHand: self(2) });
    if (same >= 3) raw.push({ kind: 'quad', fromHand: self(3) });
  }

  addLienCandidates(raw, counts, claimed);

  // Khạp trên tay KHÔNG được xé (§5.1): nước nào lấy lá từ ô đang có ≥3 bản
  // đều bị loại — trừ chính nước khui (quad) dùng trọn khạp đó.
  const filtered = raw.filter(
    (r) =>
      r.kind === 'quad' ||
      r.fromHand.every((t) => counts[cellOf(t.piece, t.color)] < 3),
  );

  let claims: Claim[] = filtered.map((r) => {
    const tiles = [...r.fromHand, claimed];
    return {
      kind: r.kind,
      meld: detectMeld(tiles) as Meld,
      fromHand: r.fromHand,
      tiles,
      // Giật vòng (ngoài lượt) chỉ với đôi(→khạp)/khui(→quằn); ăn thành đôi hay
      // ăn liền bằng rác thì chỉ khi tới lượt mình (§7).
      outOfTurn: r.kind === 'triple' || r.kind === 'quad',
      mandatory:
        r.kind === 'quad'
          ? true
          : r.kind === 'triple'
            ? !ctx.waitingToWin
            : false,
    };
  });

  if (claims.length === 0) return [];

  // Anti-rác ba lớp:
  // 1) TUYỆT ĐỐI: nước ăn không được để lại NHIỀU rác hơn hiện trạng tay bài
  //    (vd đôi Sỹ + Tướng: xé Tướng+Sỹ ăn Tượng tạo 1 Sỹ rác → cấm).
  // 2) TUYỆT ĐỐI "cứng" (Tướng-lẻ tính như rác) — chặn xé LIỀN để Tướng trơ ra
  //    (vd liền T-S-Tg, lật Tướng: cấm dùng Sỹ+Tượng ăn). Chỉ áp cho nước ăn-ghép
  //    (pair/lien); nước dùng TRỌN nhóm (đôi→khạp, khui) được miễn.
  // 3) TƯƠNG ĐỐI: trong các nước còn lại, chỉ giữ nước để lại ÍT RÁC NHẤT.
  const looseBefore = looseCount(hand);
  const looseHardBefore = looseCountHard(hand);
  claims = claims.filter((cl) => {
    const rest = removeTiles(hand, cl.fromHand);
    if (looseCount(rest) > looseBefore) return false;
    if (
      (cl.kind === 'pair' || cl.kind === 'lien') &&
      looseCountHard(rest) > looseHardBefore
    ) {
      return false;
    }
    return true;
  });
  // Ngoài lượt (khác cửa): chỉ được các nước giật (đôi/khạp) — lọc TRƯỚC khi
  // so "ít rác nhất", để nước giật không bị nước chỉ-dành-cho-cửa loại oan.
  if (!ctx.isOwnTurn) claims = claims.filter((cl) => cl.outOfTurn);
  if (claims.length === 0) return [];

  const looseLeft = claims.map((cl) => looseCount(removeTiles(hand, cl.fromHand)));
  const minLoose = Math.min(...looseLeft);
  claims = claims.filter((_, i) => looseLeft[i] === minLoose);

  return claims;
}

function addLienCandidates(
  raw: Array<{ kind: ClaimKind; fromHand: Tile[] }>,
  counts: number[],
  claimed: Tile,
): void {
  const { piece, color } = claimed;
  const present = (p: Piece, col: Color = color): boolean =>
    counts[cellOf(p, col)] > 0;
  const tile = (p: Piece, col: Color = color): Tile => ({ piece: p, color: col });

  if (CHARIOT.includes(piece)) {
    const others = CHARIOT.filter((p) => p !== piece);
    if (others.every((p) => present(p))) {
      raw.push({ kind: 'lien', fromHand: others.map((p) => tile(p)) });
    }
  } else if (GENERAL.includes(piece)) {
    const others = GENERAL.filter((p) => p !== piece);
    if (others.every((p) => present(p))) {
      raw.push({ kind: 'lien', fromHand: others.map((p) => tile(p)) });
    }
  } else if (piece === Piece.Soldier) {
    const otherColors = COLORS.filter(
      (col) => col !== color && present(Piece.Soldier, col),
    );
    // liền 3 màu: chọn 2 màu khác
    for (let i = 0; i < otherColors.length; i++) {
      for (let j = i + 1; j < otherColors.length; j++) {
        raw.push({
          kind: 'lien',
          fromHand: [
            tile(Piece.Soldier, otherColors[i]),
            tile(Piece.Soldier, otherColors[j]),
          ],
        });
      }
    }
    // liền 4 màu: đủ 3 màu khác
    if (otherColors.length === 3) {
      raw.push({
        kind: 'lien',
        fromHand: otherColors.map((col) => tile(Piece.Soldier, col)),
      });
    }
  }
}

function removeTiles(hand: readonly Tile[], toRemove: readonly Tile[]): Tile[] {
  const counts = toCounts(hand);
  for (const t of toRemove) counts[cellOf(t.piece, t.color)]--;
  return countsToTiles(counts);
}
