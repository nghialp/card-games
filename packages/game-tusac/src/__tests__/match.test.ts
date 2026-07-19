import { describe, expect, it } from 'vitest';
import { Color, Piece, type Tile } from '../tiles';
import { MatchError, TuSacMatch } from '../match';

const t = (piece: Piece, color: Color): Tile => ({ piece, color });
const { General, Advisor, Elephant, Chariot, Cannon, Horse } = Piece;
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

  it('tới trên lá tự lật (lá lật công khai, tới qua cửa sổ ăn)', () => {
    const m = new TuSacMatch([[t(Cannon, Green)], [t(Chariot, Red)]], [t(Chariot, Red)]);
    m.discard(0, t(Cannon, Green));
    expect(m.turn).toBe(1);
    m.draw(1); // lật Xe đỏ (công khai) → seat1 có thể tới (đôi Xe)
    expect(m.phase).toBe('awaiting-claims');
    m.respondClaim(1, { type: 'win' });
    expect(m.result).toEqual({ kind: 'win', winner: 1, quan: false });
  });

  it('lá lật không ai ăn → vào đống rác, người kế lật tiếp', () => {
    const m = new TuSacMatch(
      [[t(Cannon, Green)], [t(Advisor, White)]],
      [t(Elephant, Red), t(Chariot, Red)],
    );
    m.discard(0, t(Cannon, Green)); // không ai ăn → seat1 lật
    expect(m.turn).toBe(1);
    m.draw(1); // lật Tượng đỏ — không ai ăn được
    // lá vào đống rác, KHÔNG vào tay seat1; lượt lật chuyển seat0
    expect(m.publicState().discards.some((d) => d.piece === Elephant && d.color === Red)).toBe(
      true,
    );
    expect(m.handOf(1)).toHaveLength(1);
    expect(m.turn).toBe(0);
    expect(m.phase).toBe('awaiting-draw');
  });

  it('lật TƯỚNG không ai khui/tới → kéo về phơi (Tướng lẻ) + phải đánh 1 rác', () => {
    const m = new TuSacMatch(
      [[t(Cannon, Green), t(Horse, White)], [t(Advisor, White), t(Elephant, Green)]],
      [t(General, Red)],
    );
    m.discard(0, t(Cannon, Green)); // không ai ăn → seat1 lật
    expect(m.turn).toBe(1);
    m.draw(1); // lật Tướng đỏ — không ai khui/tới
    // Tướng kéo về phơi trước mặt seat1 (không vào đống rác, không vào tay)
    const s1 = m.publicState().seats[1];
    expect(s1.melds).toHaveLength(1);
    expect(s1.melds[0]).toEqual([t(General, Red)]);
    expect(s1.handCount).toBe(2);
    expect(m.publicState().discards).toHaveLength(1); // chỉ có Pháo xanh lúc đầu
    // và seat1 phải đánh ra 1 rác (giữ lượt)
    expect(m.turn).toBe(1);
    expect(m.phase).toBe('awaiting-discard');
  });

  it('Tướng bị ĐÁNH RA (không phải lật) mà không ai ăn → vào đống rác như thường', () => {
    const m = new TuSacMatch(
      [[t(General, Red), t(Cannon, Green)], [t(Advisor, White), t(Elephant, Green)]],
      [],
    );
    m.discard(0, t(General, Red)); // seat1 không tới/khui được
    expect(
      m.publicState().discards.some((d) => d.piece === General && d.color === Red),
    ).toBe(true);
    expect(m.turn).toBe(1);
    expect(m.phase).toBe('awaiting-draw');
  });

  it('nhà cái theo dealerSeat: cái đi trước', () => {
    const m = new TuSacMatch(
      [[t(Cannon, Green)], [t(Advisor, White), t(Chariot, Red)]],
      [],
      1,
    );
    expect(m.turn).toBe(1);
    expect(m.phase).toBe('awaiting-discard');
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

describe('TuSacMatch — luật cửa (ăn rác/lẻ chỉ đúng cửa)', () => {
  it('người đúng cửa được ăn rác thành đôi; người khác cửa thì không', () => {
    // seat0 đánh Pháo xanh; seat1 (cửa) có 1 Pháo xanh rác; seat2 cũng có 1 Pháo xanh rác
    const m = new TuSacMatch(
      [
        [t(Cannon, Green), t(Chariot, Red)],
        [t(Cannon, Green), t(Advisor, White), t(Elephant, Red)],
        [t(Cannon, Green), t(Elephant, White), t(Advisor, Red)],
      ],
      [],
    );
    m.discard(0, t(Cannon, Green));
    const claimers = m.publicState().pendingClaimers;
    expect(claimers).toContain(1); // cửa được ăn rác (pair)
    expect(claimers).not.toContain(2); // khác cửa: 1 lá rác không giật được

    m.respondClaim(1, { type: 'claim', tiles: [t(Cannon, Green)] });
    expect(m.turn).toBe(1); // cửa ăn xong chiếm lượt, phải đánh trả
    expect(m.phase).toBe('awaiting-discard');
    expect(m.publicState().seats[1].melds[0]).toHaveLength(2); // đôi Pháo phơi
  });

  it('ăn lẻ (liền) chỉ đúng cửa; ưu tiên chẵn (đôi giật) hơn lẻ của cửa', () => {
    // seat0 đánh Xe xanh. seat1 (cửa) có Pháo xanh + Mã xanh (ăn lẻ).
    // seat2 có ĐÔI Xe xanh (giật thành khạp) → chẵn ưu tiên hơn lẻ.
    const m = new TuSacMatch(
      [
        [t(Chariot, Green), t(Advisor, Red)],
        [t(Cannon, Green), t(Horse, Green), t(Elephant, White)],
        [t(Chariot, Green), t(Chariot, Green), t(Advisor, White), t(Elephant, Red)],
      ],
      [],
    );
    m.discard(0, t(Chariot, Green));
    const claimers = m.publicState().pendingClaimers;
    expect(claimers).toContain(1);
    expect(claimers).toContain(2);

    m.respondClaim(1, { type: 'claim', tiles: [t(Cannon, Green), t(Horse, Green)] });
    m.respondClaim(2, { type: 'claim', tiles: [t(Chariot, Green), t(Chariot, Green)] });
    // chẵn (triple của seat2) thắng lẻ (lien của seat1)
    expect(m.turn).toBe(2);
    expect(m.publicState().seats[2].melds[0]).toHaveLength(3);
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
