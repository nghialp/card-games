import type { Card } from '@card-games/types';
import { sortCards, sameCard } from './cards';
import { detectCombo, type Combo } from './combos';
import { validatePlay } from './play';

export type MatchStatus = 'playing' | 'finished';

export type MatchErrorCode =
  | 'MATCH_FINISHED'
  | 'NOT_YOUR_TURN'
  | 'INVALID_PLAY'
  | 'CANNOT_PASS_WHEN_LEADING';

export class MatchError extends Error {
  constructor(readonly code: MatchErrorCode) {
    super(code);
  }
}

export interface SeatView {
  cardsLeft: number;
  passed: boolean;
  finished: boolean;
}

export interface MatchPublicState {
  status: MatchStatus;
  currentSeat: number;
  /** Combo đang nằm trên bàn, null = lượt mở vòng mới */
  table: Combo | null;
  seats: SeatView[];
  /** Seat theo thứ tự về đích, phần tử 0 là người thắng */
  ranking: number[];
}

/** Toàn bộ state một ván — JSON-serializable để lưu Redis/DB */
export interface MatchSnapshot {
  hands: Card[][];
  currentSeat: number;
  tableCards: Card[] | null;
  lastPlayerSeat: number | null;
  passed: number[];
  ranking: number[];
  firstMove: boolean;
  requiredFirstCard: Card | null;
  finished: boolean;
}

export interface PlayOutcome {
  combo: Combo;
  /** Người vừa đánh hết bài ván này */
  seatFinished: boolean;
  matchFinished: boolean;
  /** Lượt kế tiếp mở vòng mới (mọi người khác đã bỏ/hết bài) */
  newRound: boolean;
}

/**
 * State machine một ván Tiến lên — thuần logic, không timer/IO.
 * Server bọc bên ngoài để xử lý socket, đồng hồ lượt và tính tiền.
 */
export class TienLenMatch {
  private readonly hands: Card[][];
  private currentSeatInternal: number;
  private table: Combo | null = null;
  private lastPlayerSeat: number | null = null;
  private readonly passed = new Set<number>();
  private readonly ranking: number[] = [];
  private firstMove: boolean;
  private readonly requiredFirstCard: Card | null;
  private finished = false;

  constructor(
    hands: Card[][],
    startingSeat: number,
    opts?: {
      /** Ván đầu tiên: lượt mở đầu bắt buộc chứa lá này (3♠) */
      requireFirstCard?: Card;
    },
  ) {
    if (hands.length < 2 || hands.length > 4) {
      throw new Error('match needs 2-4 hands');
    }
    if (startingSeat < 0 || startingSeat >= hands.length) {
      throw new Error('invalid starting seat');
    }
    this.hands = hands.map(sortCards);
    this.currentSeatInternal = startingSeat;
    this.requiredFirstCard = opts?.requireFirstCard ?? null;
    this.firstMove = this.requiredFirstCard !== null;
  }

  /** Serialize toàn bộ state để lưu Redis — khôi phục bằng TienLenMatch.restore() */
  snapshot(): MatchSnapshot {
    return {
      hands: this.hands.map((h) => [...h]),
      currentSeat: this.currentSeatInternal,
      tableCards: this.table ? [...this.table.cards] : null,
      lastPlayerSeat: this.lastPlayerSeat,
      passed: [...this.passed],
      ranking: [...this.ranking],
      firstMove: this.firstMove,
      requiredFirstCard: this.requiredFirstCard,
      finished: this.finished,
    };
  }

  static restore(s: MatchSnapshot): TienLenMatch {
    const match = new TienLenMatch(
      s.hands.map((h) => [...h]),
      s.currentSeat,
      s.requiredFirstCard ? { requireFirstCard: s.requiredFirstCard } : undefined,
    );
    match.table = s.tableCards ? detectCombo(s.tableCards) : null;
    match.lastPlayerSeat = s.lastPlayerSeat;
    for (const seat of s.passed) match.passed.add(seat);
    for (const seat of s.ranking) match.ranking.push(seat);
    match.firstMove = s.firstMove;
    match.finished = s.finished;
    return match;
  }

  get status(): MatchStatus {
    return this.finished ? 'finished' : 'playing';
  }

  get currentSeat(): number {
    return this.currentSeatInternal;
  }

  get tableCombo(): Combo | null {
    return this.table;
  }

  handOf(seat: number): readonly Card[] {
    return this.hands[seat];
  }

  publicState(): MatchPublicState {
    return {
      status: this.status,
      currentSeat: this.currentSeatInternal,
      table: this.table,
      seats: this.hands.map((hand, seat) => ({
        cardsLeft: hand.length,
        passed: this.passed.has(seat),
        finished: hand.length === 0,
      })),
      ranking: [...this.ranking],
    };
  }

  play(seat: number, cards: Card[]): PlayOutcome {
    if (this.finished) throw new MatchError('MATCH_FINISHED');
    if (seat !== this.currentSeatInternal) throw new MatchError('NOT_YOUR_TURN');

    const mustContain =
      this.firstMove && this.requiredFirstCard ? this.requiredFirstCard : undefined;
    const combo = validatePlay(this.hands[seat], cards, this.table, mustContain);
    if (!combo) throw new MatchError('INVALID_PLAY');

    this.hands[seat] = this.hands[seat].filter(
      (h) => !cards.some((c) => sameCard(c, h)),
    );
    this.firstMove = false;
    this.table = combo;
    this.lastPlayerSeat = seat;

    const seatFinished = this.hands[seat].length === 0;
    if (seatFinished) this.ranking.push(seat);

    const active = this.activeSeats();
    if (active.length <= 1) {
      if (active.length === 1) this.ranking.push(active[0]);
      this.finished = true;
      return { combo, seatFinished, matchFinished: true, newRound: false };
    }

    const newRound = this.advance();
    return { combo, seatFinished, matchFinished: false, newRound };
  }

  pass(seat: number): { newRound: boolean } {
    if (this.finished) throw new MatchError('MATCH_FINISHED');
    if (seat !== this.currentSeatInternal) throw new MatchError('NOT_YOUR_TURN');
    if (this.table === null) throw new MatchError('CANNOT_PASS_WHEN_LEADING');

    this.passed.add(seat);
    const newRound = this.advance();
    return { newRound };
  }

  private activeSeats(): number[] {
    return this.hands
      .map((_, seat) => seat)
      .filter((seat) => this.hands[seat].length > 0);
  }

  /**
   * Chuyển lượt cho người kế tiếp còn bài và chưa bỏ lượt.
   * Trả về true nếu vòng kết thúc (quyền mở vòng mới thuộc về người
   * đánh cuối, hoặc người kế tiếp nếu người đó đã hết bài).
   */
  private advance(): boolean {
    const n = this.hands.length;
    for (let step = 1; step < n; step++) {
      const seat = (this.currentSeatInternal + step) % n;
      if (this.hands[seat].length === 0 || this.passed.has(seat)) continue;
      if (seat === this.lastPlayerSeat) break; // đi hết vòng về người đánh cuối
      this.currentSeatInternal = seat;
      return false;
    }
    this.startNewRound();
    return true;
  }

  private startNewRound(): void {
    const leader =
      this.lastPlayerSeat !== null && this.hands[this.lastPlayerSeat].length > 0
        ? this.lastPlayerSeat
        : this.nextActiveAfter(this.lastPlayerSeat ?? this.currentSeatInternal);
    this.table = null;
    this.passed.clear();
    this.lastPlayerSeat = null;
    this.currentSeatInternal = leader;
  }

  private nextActiveAfter(seat: number): number {
    const n = this.hands.length;
    for (let step = 1; step <= n; step++) {
      const next = (seat + step) % n;
      if (this.hands[next].length > 0) return next;
    }
    throw new Error('no active seat left');
  }
}
