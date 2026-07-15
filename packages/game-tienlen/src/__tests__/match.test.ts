import { describe, expect, it } from 'vitest';
import type { Card, Rank, Suit } from '@card-games/types';
import { MatchError, TienLenMatch } from '../match';

const c = (rank: number, suit: number): Card => ({
  rank: rank as Rank,
  suit: suit as Suit,
});

describe('TienLenMatch snapshot/restore', () => {
  it('ván khôi phục từ snapshot chơi tiếp y hệt', () => {
    const original = new TienLenMatch(
      [
        [c(3, 0), c(9, 3)],
        [c(4, 0), c(5, 0)],
      ],
      0,
      { requireFirstCard: c(3, 0) },
    );
    original.play(0, [c(3, 0)]);

    const restored = TienLenMatch.restore(
      JSON.parse(JSON.stringify(original.snapshot())),
    );
    expect(restored.currentSeat).toBe(1);
    expect(restored.tableCombo?.cards).toEqual([c(3, 0)]);

    restored.play(1, [c(4, 0)]);
    restored.play(0, [c(9, 3)]);
    expect(restored.status).toBe('finished');
    expect(restored.publicState().ranking).toEqual([0, 1]);
  });
});

describe('TienLenMatch', () => {
  it('ván 2 người chơi đến hết: ranking đúng thứ tự', () => {
    const match = new TienLenMatch(
      [
        [c(3, 0), c(9, 3)], // p0
        [c(4, 0), c(5, 0)], // p1
      ],
      0,
      { requireFirstCard: c(3, 0) },
    );

    match.play(0, [c(3, 0)]);
    expect(match.currentSeat).toBe(1);
    match.play(1, [c(4, 0)]);
    match.play(0, [c(9, 3)]); // p0 hết bài → ván kết thúc luôn

    expect(match.status).toBe('finished');
    expect(match.publicState().ranking).toEqual([0, 1]);
  });

  it('lượt mở đầu ván đầu tiên bắt buộc chứa 3♠', () => {
    const match = new TienLenMatch(
      [
        [c(3, 0), c(9, 3)],
        [c(4, 0), c(5, 0)],
      ],
      0,
      { requireFirstCard: c(3, 0) },
    );
    expect(() => match.play(0, [c(9, 3)])).toThrow(MatchError);
    expect(match.play(0, [c(3, 0)]).combo).toBeTruthy();
  });

  it('không được đánh sai lượt, không được bỏ lượt khi đang cầm cái', () => {
    const match = new TienLenMatch(
      [
        [c(3, 0), c(9, 3)],
        [c(4, 0), c(5, 0)],
      ],
      0,
    );
    expect(() => match.play(1, [c(4, 0)])).toThrow('NOT_YOUR_TURN');
    expect(() => match.pass(0)).toThrow('CANNOT_PASS_WHEN_LEADING');
  });

  it('mọi người bỏ lượt → người đánh cuối mở vòng mới', () => {
    const match = new TienLenMatch(
      [
        [c(3, 0), c(4, 0)],
        [c(10, 0), c(6, 0)],
        [c(11, 0), c(7, 0)],
      ],
      0,
    );

    match.play(0, [c(4, 0)]);
    match.play(1, [c(10, 0)]);
    match.play(2, [c(11, 0)]);
    const r0 = match.pass(0);
    expect(r0.newRound).toBe(false);
    const r1 = match.pass(1);
    expect(r1.newRound).toBe(true);
    // p2 vừa thắng vòng → được mở vòng mới, bàn trống
    expect(match.currentSeat).toBe(2);
    expect(match.tableCombo).toBeNull();
    // p0 đã hết quyền bỏ lượt của vòng cũ (reset), giờ p2 dẫn
    const outcome = match.play(2, [c(7, 0)]);
    expect(outcome.seatFinished).toBe(true); // p2 về nhất
    expect(match.status).toBe('playing'); // p0, p1 còn tranh hạng

    match.pass(0); // 3♠ không chặt được 7♠
    match.pass(1); // 6♠ cũng không
    // p2 hết bài → quyền mở vòng rơi vào p0 (kế tiếp còn bài)
    expect(match.currentSeat).toBe(0);
    expect(match.tableCombo).toBeNull();

    match.play(0, [c(3, 0)]); // p0 hết bài → còn mình p1, ván khép lại
    expect(match.status).toBe('finished');
    expect(match.publicState().ranking).toEqual([2, 0, 1]);
  });

  it('người đánh cuối đã hết bài → người kế tiếp còn bài mở vòng mới', () => {
    const match = new TienLenMatch(
      [
        [c(14, 0)], // p0 sẽ đánh hết ngay
        [c(4, 0), c(5, 0)],
        [c(6, 0), c(7, 0)],
      ],
      0,
    );
    const outcome = match.play(0, [c(14, 0)]); // A♠, p0 về nhất
    expect(outcome.seatFinished).toBe(true);
    expect(outcome.matchFinished).toBe(false);

    match.pass(1);
    // p2 cũng bỏ → không ai chặt A♠; p0 hết bài nên p1 (kế tiếp) mở vòng
    match.pass(2);
    expect(match.tableCombo).toBeNull();
    expect(match.currentSeat).toBe(1);
  });
});
