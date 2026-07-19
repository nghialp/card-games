import { pieceOfCell, colorOfCell, sameTile, toCounts, type Tile } from './tiles';
import { isWinningHand } from './melds';
import { canWin, isTenpai, legalClaims, type Claim } from './claims';

/**
 * State machine một ván Tứ Sắc — thuần logic, không timer/IO
 * (docs/tusac-rules.md §5–§9). Server bọc ngoài để xử socket + đồng hồ.
 *
 * - Cửa sổ giật/ăn mở trên **lá đánh ra** VÀ **lá bốc từ nọc** (§5.1): khi ai đó
 *   lật bài, người chưa tới lượt vẫn được giật (đôi/khạp/tới); lá tự chuyển sang
 *   người giật.
 * - 4 lá giống nhau (khui khi ăn HOẶC quằn có sẵn/bốc được) được **hạ ngay** thành
 *   quằn phơi ra bàn; tới khi có quằn phơi = **tới quan**.
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
  /** Tới quan (người thắng có quằn đã hạ bàn) */
  quan?: boolean;
}

export interface MatchPublicState {
  phase: MatchPhase;
  turn: number;
  seats: SeatView[];
  pileCount: number;
  pending: { tile: Tile; from: number; kind: 'discard' | 'draw' } | null;
  pendingClaimers: number[];
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

const CLAIM_PRIORITY: Record<string, number> = { win: 0, quad: 1, triple: 2 };

export class TuSacMatch {
  private readonly hands: Tile[][];
  private readonly melds: Tile[][][];
  private readonly pile: Tile[];
  private readonly n: number;
  private turnSeat: number;
  private phaseState: MatchPhase;
  private pending: { tile: Tile; from: number; kind: 'discard' | 'draw' } | null = null;
  private resultState: MatchResult | null = null;

  private eligible: Eligible[] = [];
  private responded = new Set<number>();
  private best: { seat: number; priority: number; dist: number; response: ClaimResponse } | null =
    null;

  /**
   * @param hands hands[0] = nhà cái (21 lá, đánh trước); còn lại 20 lá
   * @param pile  nọc
   */
  constructor(hands: Tile[][], pile: Tile[]) {
    if (hands.length < 2 || hands.length > 4) throw new Error('need 2-4 players');
    this.hands = hands.map((h) => [...h]);
    this.melds = hands.map(() => []);
    this.pile = [...pile];
    this.n = hands.length;
    // Quằn có sẵn khi chia → hạ ngay
    for (let s = 0; s < this.n; s++) this.autoLayQuan(s);
    this.turnSeat = 0; // cái đi trước
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
      result: this.resultState,
    };
  }

  // ── Hành động ─────────────────────────────────────────────

  /** Bốc 1 lá (lật). Nọc hết → hoà. Người khác có thể giật lá lật. */
  draw(seat: number): void {
    this.expect('awaiting-draw', seat);
    if (this.pile.length === 0) {
      this.finish({ kind: 'draw' });
      return;
    }
    const tile = this.pile.shift()!;
    this.openWindow(tile, seat, 'draw');
  }

  /** Tự tới (tay bài đã tròn). */
  declareWin(seat: number): void {
    this.expect('awaiting-discard', seat);
    if (!isWinningHand(this.hands[seat])) throw new MatchError('NOT_WINNING');
    this.win(seat);
  }

  /** Đánh ra 1 lá → mở cửa sổ ăn cho người khác. */
  discard(seat: number, tile: Tile): void {
    this.expect('awaiting-discard', seat);
    const idx = this.hands[seat].findIndex((t) => sameTile(t, tile));
    if (idx === -1) throw new MatchError('NOT_IN_HAND');
    this.hands[seat].splice(idx, 1);
    this.openWindow(tile, seat, 'discard');
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

  private openWindow(tile: Tile, from: number, kind: 'discard' | 'draw'): void {
    const eligible: Eligible[] = [];
    for (let step = 1; step < this.n; step++) {
      const seat = (from + step) % this.n;
      const cw = canWin(this.hands[seat], tile);
      const claims = legalClaims(this.hands[seat], tile, {
        isOwnTurn: false,
        waitingToWin: isTenpai(this.hands[seat]),
      });
      if (cw || claims.length > 0) {
        eligible.push({ seat, canWin: cw, claims, forced: !cw && claims.some((c) => c.mandatory) });
      }
    }

    // Lá bốc: nếu không ai giật được → người bốc giữ lá luôn.
    if (kind === 'draw' && eligible.length === 0) {
      this.keepDrawnTile(from, tile);
      return;
    }
    // Lá bốc + có người giật: người bốc được tự tới (ưu tiên cao nhất, dist 0).
    if (kind === 'draw' && canWin(this.hands[from], tile)) {
      eligible.unshift({ seat: from, canWin: true, claims: [], forced: false });
    }
    // Lá đánh ra mà không ai ăn → sang người kế tiếp.
    if (eligible.length === 0) {
      this.advanceTurn();
      return;
    }

    this.pending = { tile: { ...tile }, from, kind };
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
      if (pending.kind === 'draw') this.keepDrawnTile(pending.from, pending.tile);
      else this.advanceTurn();
      return;
    }
    const { seat, response } = this.best;
    if (response.type !== 'claim') {
      this.win(seat); // 'win' — nhánh 'pass' không bao giờ lưu vào best
      return;
    }
    // Giật/ăn: lấy lá vào nhóm phơi, chiếm lượt, phải đánh ra.
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

  /** Người bốc giữ lá vào tay (khi không ai giật) rồi hạ quằn nếu đủ 4. */
  private keepDrawnTile(seat: number, tile: Tile): void {
    this.hands[seat].push({ ...tile });
    this.autoLayQuan(seat);
    this.turnSeat = seat;
    this.phaseState = 'awaiting-discard';
    this.clearWindow();
  }

  /** Hạ mọi bộ 4 lá giống nhau trong tay thành quằn phơi ra bàn (§ tới quan). */
  private autoLayQuan(seat: number): void {
    let done = false;
    while (!done) {
      const counts = toCounts(this.hands[seat]);
      const cell = counts.findIndex((c) => c >= 4);
      if (cell === -1) {
        done = true;
        break;
      }
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

  private advanceTurn(): void {
    this.turnSeat = (this.turnSeat + 1) % this.n;
    this.phaseState = 'awaiting-draw';
    this.clearWindow();
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
