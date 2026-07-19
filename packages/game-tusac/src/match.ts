import { pieceOfCell, colorOfCell, sameTile, toCounts, type Tile } from './tiles';
import { isWinningHand } from './melds';
import { canWin, isTenpai, legalClaims, type Claim } from './claims';

/**
 * State machine một ván Tứ Sắc — thuần logic, không timer/IO
 * (docs/tusac-rules.md §5–§9, đã cập nhật theo tusac-bosung.md).
 *
 * Luật cửa & lá lật:
 * - Lá đánh ra thuộc **cửa** người kế bên phải người đánh; lá lật từ nọc thì
 *   **người lật là cửa**. Chỉ cửa được ăn rác (pair) / ăn lẻ (lien); người khác
 *   giành bằng đôi (khạp) / khui (quằn) / tới.
 * - Lá lật **công khai, không vào tay**: không ai ăn → bỏ vào đống rác, người
 *   bên phải người lật lật tiếp.
 * - Ai ăn → phơi nhóm, chiếm lượt, phải đánh trả 1 rác.
 * - Ưu tiên: tới > khui > đôi > ăn rác (cửa) > ăn lẻ (cửa); đồng hạng → gần
 *   người đánh hơn.
 * - Quằn (4 lá giống nhau) hạ chiếu ngay; tới có quằn phơi = tới quan.
 */

export type MatchPhase =
  | 'awaiting-draw'
  | 'awaiting-discard'
  | 'awaiting-claims'
  | 'finished';

export type ClaimResponse =
  | { type: 'pass' }
  | { type: 'win' }
  | { type: 'claim'; tiles: Tile[] };

export interface SeatView {
  handCount: number;
  melds: Tile[][];
}

export interface MatchResult {
  kind: 'win' | 'draw';
  winner?: number;
  /** Tới quan (người thắng có quằn đã hạ chiếu) */
  quan?: boolean;
}

export interface PendingTile {
  tile: Tile;
  from: number;
  kind: 'discard' | 'draw';
  /** Ghế "đúng cửa" — duy nhất được ăn rác/ăn lẻ với lá này */
  gate: number;
}

export interface MatchPublicState {
  phase: MatchPhase;
  turn: number;
  seats: SeatView[];
  pileCount: number;
  pending: PendingTile | null;
  pendingClaimers: number[];
  /** Đống rác công khai (lá không ai ăn), mới nhất cuối mảng */
  discards: Tile[];
  result: MatchResult | null;
}

export class MatchError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

interface Eligible {
  seat: number;
  canWin: boolean;
  claims: Claim[];
  /** Bắt buộc ăn (khui/đôi không-chờ-tới) và không thể tới → không được bỏ */
  forced: boolean;
}

/** Ưu tiên: tới > khui > đôi > ăn rác (cửa) > ăn lẻ (cửa) — §7 */
const CLAIM_PRIORITY: Record<string, number> = {
  win: 0,
  quad: 1,
  triple: 2,
  pair: 3,
  lien: 4,
};

export class TuSacMatch {
  private readonly hands: Tile[][];
  private readonly melds: Tile[][][];
  private readonly pile: Tile[];
  private readonly discardPile: Tile[] = [];
  private readonly n: number;
  private turnSeat: number;
  private phaseState: MatchPhase;
  private pending: PendingTile | null = null;
  private resultState: MatchResult | null = null;

  private eligible: Eligible[] = [];
  private responded = new Set<number>();
  private best: { seat: number; priority: number; dist: number; response: ClaimResponse } | null =
    null;

  /**
   * @param hands      hands[dealerSeat] = nhà cái (21 lá, đánh trước); còn lại 20 lá
   * @param pile       nọc
   * @param dealerSeat ghế nhà cái (mặc định 0)
   */
  constructor(hands: Tile[][], pile: Tile[], dealerSeat = 0) {
    if (hands.length < 2 || hands.length > 4) throw new Error('need 2-4 players');
    if (dealerSeat < 0 || dealerSeat >= hands.length) throw new Error('invalid dealerSeat');
    this.hands = hands.map((h) => [...h]);
    this.melds = hands.map(() => []);
    this.pile = [...pile];
    this.n = hands.length;
    // Quằn có sẵn khi chia → hạ chiếu ngay
    for (let s = 0; s < this.n; s++) this.autoLayQuan(s);
    this.turnSeat = dealerSeat; // cái đi trước
    this.phaseState = 'awaiting-discard';
  }

  get phase(): MatchPhase {
    return this.phaseState;
  }
  get turn(): number {
    return this.turnSeat;
  }
  get result(): MatchResult | null {
    return this.resultState;
  }
  handOf(seat: number): readonly Tile[] {
    return this.hands[seat];
  }

  publicState(): MatchPublicState {
    return {
      phase: this.phaseState,
      turn: this.turnSeat,
      seats: this.hands.map((h, seat) => ({
        handCount: h.length,
        melds: this.melds[seat].map((m) => [...m]),
      })),
      pileCount: this.pile.length,
      pending: this.pending,
      pendingClaimers: this.eligible
        .filter((e) => !this.responded.has(e.seat))
        .map((e) => e.seat),
      discards: [...this.discardPile],
      result: this.resultState,
    };
  }

  // ── Hành động ─────────────────────────────────────────────

  /** Lật 1 lá từ nọc (công khai — không vào tay). Nọc hết → hoà. */
  draw(seat: number): void {
    this.expect('awaiting-draw', seat);
    if (this.pile.length === 0) {
      this.finish({ kind: 'draw' });
      return;
    }
    const tile = this.pile.shift()!;
    // Người lật là cửa của lá lật
    this.openWindow(tile, seat, 'draw', seat);
  }

  /** Tự tới (tay bài đã tròn) — được cả trước khi lật lẫn sau khi ăn. */
  declareWin(seat: number): void {
    if (this.phaseState !== 'awaiting-draw' && this.phaseState !== 'awaiting-discard') {
      throw new MatchError('WRONG_PHASE');
    }
    if (seat !== this.turnSeat) throw new MatchError('NOT_YOUR_TURN');
    if (!isWinningHand(this.hands[seat])) throw new MatchError('NOT_WINNING');
    this.win(seat);
  }

  /** Đánh ra 1 lá → mở cửa sổ ăn (cửa = người kế bên phải). */
  discard(seat: number, tile: Tile): void {
    this.expect('awaiting-discard', seat);
    const idx = this.hands[seat].findIndex((t) => sameTile(t, tile));
    if (idx === -1) throw new MatchError('NOT_IN_HAND');
    this.hands[seat].splice(idx, 1);
    this.openWindow(tile, seat, 'discard', (seat + 1) % this.n);
  }

  /** Phản hồi cửa sổ giật/ăn (pass / win / claim). */
  respondClaim(seat: number, response: ClaimResponse): void {
    if (this.phaseState !== 'awaiting-claims') throw new MatchError('NOT_CLAIM_PHASE');
    const e = this.eligible.find((x) => x.seat === seat);
    if (!e) throw new MatchError('NOT_ELIGIBLE');
    if (this.responded.has(seat)) throw new MatchError('ALREADY_RESPONDED');

    this.validateResponse(e, response);
    this.responded.add(seat);

    if (response.type !== 'pass') {
      const priority =
        response.type === 'win'
          ? CLAIM_PRIORITY.win
          : CLAIM_PRIORITY[this.matchClaim(e, response.tiles)!.kind];
      const dist = (seat - this.pending!.from + this.n) % this.n;
      if (
        !this.best ||
        priority < this.best.priority ||
        (priority === this.best.priority && dist < this.best.dist)
      ) {
        this.best = { seat, priority, dist, response };
      }
    }

    if (this.responded.size === this.eligible.length) this.resolveWindow();
  }

  // ── Nội bộ ────────────────────────────────────────────────

  private openWindow(tile: Tile, from: number, kind: 'discard' | 'draw', gate: number): void {
    const eligible: Eligible[] = [];
    for (let step = 0; step < this.n; step++) {
      const seat = (from + step) % this.n;
      // lá đánh ra: người đánh không được ăn lại lá mình; lá lật: người lật tham gia
      if (kind === 'discard' && seat === from) continue;
      const cw = canWin(this.hands[seat], tile);
      const claims = legalClaims(this.hands[seat], tile, {
        isOwnTurn: seat === gate,
        waitingToWin: isTenpai(this.hands[seat]),
      });
      if (cw || claims.length > 0) {
        eligible.push({ seat, canWin: cw, claims, forced: !cw && claims.some((c) => c.mandatory) });
      }
    }

    if (eligible.length === 0) {
      this.dropAndAdvance(tile, from, kind);
      return;
    }

    this.pending = { tile: { ...tile }, from, kind, gate };
    this.eligible = eligible;
    this.responded.clear();
    this.best = null;
    this.phaseState = 'awaiting-claims';
  }

  private validateResponse(e: Eligible, response: ClaimResponse): void {
    if (response.type === 'pass') {
      if (e.forced) throw new MatchError('MUST_CLAIM');
      return;
    }
    if (response.type === 'win') {
      if (!e.canWin) throw new MatchError('CANNOT_WIN');
      return;
    }
    if (!this.matchClaim(e, response.tiles)) throw new MatchError('ILLEGAL_CLAIM');
  }

  private matchClaim(e: Eligible, tiles: Tile[]): Claim | undefined {
    return e.claims.find((c) => sameTileSet(c.fromHand, tiles));
  }

  private resolveWindow(): void {
    const pending = this.pending!;
    if (!this.best) {
      this.dropAndAdvance(pending.tile, pending.from, pending.kind);
      return;
    }
    const { seat, response } = this.best;
    if (response.type !== 'claim') {
      this.win(seat); // 'win' — nhánh 'pass' không bao giờ lưu vào best
      return;
    }
    // Ăn: lấy lá vào nhóm phơi, chiếm lượt, phải đánh trả 1 rác.
    const claim = this.matchClaim(this.eligible.find((x) => x.seat === seat)!, response.tiles)!;
    for (const t of claim.fromHand) {
      const i = this.hands[seat].findIndex((h) => sameTile(h, t));
      this.hands[seat].splice(i, 1);
    }
    this.melds[seat].push([...claim.fromHand, pending.tile]);
    this.autoLayQuan(seat);
    this.turnSeat = seat;
    this.phaseState = 'awaiting-discard';
    this.clearWindow();
  }

  /** Không ai ăn: lá vào đống rác công khai; người kế của from lật tiếp. */
  private dropAndAdvance(tile: Tile, from: number, kind: 'discard' | 'draw'): void {
    this.discardPile.push({ ...tile });
    this.turnSeat = (from + 1) % this.n;
    this.phaseState = 'awaiting-draw';
    this.clearWindow();
    void kind;
  }

  /** Hạ mọi bộ 4 lá giống nhau trong tay thành quằn phơi ra chiếu. */
  private autoLayQuan(seat: number): void {
    for (;;) {
      const counts = toCounts(this.hands[seat]);
      const cell = counts.findIndex((c) => c >= 4);
      if (cell === -1) break;
      const piece = pieceOfCell(cell);
      const color = colorOfCell(cell);
      const quan: Tile[] = [];
      for (let i = 0; i < 4; i++) {
        const idx = this.hands[seat].findIndex((t) => t.piece === piece && t.color === color);
        quan.push(this.hands[seat].splice(idx, 1)[0]);
      }
      this.melds[seat].push(quan);
    }
  }

  private clearWindow(): void {
    this.pending = null;
    this.eligible = [];
    this.responded.clear();
    this.best = null;
  }

  private win(seat: number): void {
    const quan = this.melds[seat].some((m) => m.length === 4);
    this.finish({ kind: 'win', winner: seat, quan });
  }

  private finish(result: MatchResult): void {
    this.resultState = result;
    this.phaseState = 'finished';
    this.clearWindow();
  }

  private expect(phase: MatchPhase, seat: number): void {
    if (this.phaseState !== phase) throw new MatchError('WRONG_PHASE');
    if (seat !== this.turnSeat) throw new MatchError('NOT_YOUR_TURN');
  }
}

function sameTileSet(a: readonly Tile[], b: readonly Tile[]): boolean {
  if (a.length !== b.length) return false;
  const rest = [...b];
  for (const t of a) {
    const i = rest.findIndex((x) => sameTile(x, t));
    if (i === -1) return false;
    rest.splice(i, 1);
  }
  return true;
}
