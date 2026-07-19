import { describe, expect, it } from 'vitest';
import { Color, Piece, type Tile } from '../tiles';
import { MatchError, TuSacMatch } from '../match';

const t = (piece: Piece, color: Color): Tile => ({ piece, color });
const { General, Advisor, Elephant, Chariot, Cannon } = Piece;
const { Red, Green, White } = Color;

describe('TuSacMatch — luồng cơ bản', () => {
  it('hết nọc mà chưa ai tới → hoà', () => {
    const m = new TuSacMatch([[t(Cannon, Green)], [t(General, Red)]], []);
    m.discard(0, t(Cannon, Green)); // seat1 không ăn được → sang lượt seat1
    expect(m.turn).toBe(1);
    expect(m.phase).toBe('awaiting-draw');
    m.draw(1); // nọc rỗng → hoà
    expect(m.result).toEqual({ kind: 'draw' });
    expect(m.phase).toBe('finished');
  });

  it('tự tới sau khi bốc', () => {
    const m = new TuSacMatch([[t(Cannon, Green)], [t(Chariot, Red)]], [t(Chariot, Red)]);
    m.discard(0, t(Cannon, Green));
    expect(m.turn).toBe(1);
    m.draw(1); // bốc Xe đỏ → tay [Xe đỏ, Xe đỏ] = tròn
    m.declareWin(1);
    expect(m.result).toEqual({ kind: 'win', winner: 1, quan: false });
  });
});

describe('TuSacMatch — ăn & ưu tiên', () => {
  it('đôi (bắt buộc) chiếm lượt; bỏ đôi khi không chờ tới bị cấm', () => {
    const hand1 = [t(Chariot, Red), t(Chariot, Red), t(Advisor, White), t(Elephant, Green)];
    const m = new TuSacMatch([[t(Chariot, Red)], hand1], []);
    m.discard(0, t(Chariot, Red));
    expect(m.phase).toBe('awaiting-claims');
    expect(m.publicState().pendingClaimers).toContain(1);

    // không chờ tới → đôi bắt buộc, không được bỏ
    expect(() => m.respondClaim(1, { type: 'pass' })).toThrow(MatchError);

    m.respondClaim(1, { type: 'claim', tiles: [t(Chariot, Red), t(Chariot, Red)] });
    expect(m.turn).toBe(1);
    expect(m.phase).toBe('awaiting-discard');
    const s = m.publicState().seats[1];
    expect(s.melds).toHaveLength(1);
    expect(s.melds[0]).toHaveLength(3); // khạp Xe phơi ra
    expect(s.handCount).toBe(2);
  });

  it('đang chờ tới → được bỏ đôi (báo §8)', () => {
    // [Xe đỏ, Xe đỏ, Sỹ trắng] chờ tới (thêm Sỹ trắng là tròn)
    const m = new TuSacMatch(
      [[t(Chariot, Red)], [t(Chariot, Red), t(Chariot, Red), t(Advisor, White)]],
      [],
    );
    m.discard(0, t(Chariot, Red));
    expect(() => m.respondClaim(1, { type: 'pass' })).not.toThrow();
    expect(m.turn).toBe(1); // không ai ăn → sang lượt seat1
    expect(m.phase).toBe('awaiting-draw');
  });

  it('ưu tiên: tới > đôi', () => {
    const m = new TuSacMatch(
      [
        [t(Chariot, Red)],
        [t(Chariot, Red), t(Chariot, Red), t(Advisor, White), t(Elephant, Green)], // đôi (forced)
        [t(Chariot, Red)], // tới trên Xe đỏ
      ],
      [],
    );
    m.discard(0, t(Chariot, Red));
    m.respondClaim(1, { type: 'claim', tiles: [t(Chariot, Red), t(Chariot, Red)] });
    m.respondClaim(2, { type: 'win' });
    expect(m.result?.kind).toBe('win');
    expect(m.result?.winner).toBe(2); // tới thắng đôi
  });
});

describe('TuSacMatch — giật lá bốc & quằn tự nhiên', () => {
  it('giật đôi trên lá người khác BỐC → lá chuyển sang người giật', () => {
    // seat0 giữ đôi Xe đỏ; seat1 tới lượt bốc trúng Xe đỏ → seat0 giật
    const m = new TuSacMatch(
      [
        [t(Chariot, Red), t(Chariot, Red), t(Elephant, Green), t(Cannon, Green)],
        [t(Advisor, White)],
      ],
      [t(Chariot, Red)],
    );
    m.discard(0, t(Cannon, Green)); // seat1 không ăn → sang lượt seat1
    expect(m.turn).toBe(1);
    m.draw(1); // seat1 lật Xe đỏ → seat0 được giật
    expect(m.phase).toBe('awaiting-claims');
    expect(m.publicState().pendingClaimers).toContain(0);
    m.respondClaim(0, { type: 'claim', tiles: [t(Chariot, Red), t(Chariot, Red)] });
    // lá Xe đỏ chuyển sang seat0 (khạp phơi), seat0 chiếm lượt
    expect(m.turn).toBe(0);
    expect(m.publicState().seats[0].melds[0]).toHaveLength(3);
    expect(m.publicState().seats[1].handCount).toBe(1); // seat1 không nhận lá
  });

  it('quằn có sẵn khi chia → hạ ngay ra bàn', () => {
    const m = new TuSacMatch(
      [[t(Chariot, Red), t(Chariot, Red), t(Chariot, Red), t(Chariot, Red), t(Cannon, Green)], [t(General, Red)]],
      [],
    );
    const s0 = m.publicState().seats[0];
    expect(s0.melds).toHaveLength(1);
    expect(s0.melds[0]).toHaveLength(4); // quằn Xe đỏ đã hạ
    expect(s0.handCount).toBe(1); // còn Pháo xanh
  });
});

describe('TuSacMatch — khui & tới quan', () => {
  it('khui quằn rồi tới → tới quan', () => {
    // seat1 có khạp Xe đỏ + đôi Pháo xanh; ăn Xe đỏ thứ 4 → khui quằn, còn đôi Pháo = tròn
    const m = new TuSacMatch(
      [
        [t(Chariot, Red)],
        [t(Chariot, Red), t(Chariot, Red), t(Chariot, Red), t(Cannon, Green), t(Cannon, Green)],
      ],
      [],
    );
    m.discard(0, t(Chariot, Red));
    m.respondClaim(1, {
      type: 'claim',
      tiles: [t(Chariot, Red), t(Chariot, Red), t(Chariot, Red)],
    });
    const s = m.publicState().seats[1];
    expect(s.melds[0]).toHaveLength(4); // quằn Xe đã hạ bàn
    expect(s.handCount).toBe(2); // còn đôi Pháo xanh

    m.declareWin(1);
    expect(m.result).toEqual({ kind: 'win', winner: 1, quan: true });
  });
});
