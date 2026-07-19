import { describe, expect, it } from 'vitest';
import { Color, Piece, type Tile } from '../tiles';
import { canWin, legalClaims, type ClaimKind } from '../claims';

const t = (piece: Piece, color: Color): Tile => ({ piece, color });
const { General, Advisor, Elephant, Chariot, Cannon, Horse, Soldier } = Piece;
const { Red, Yellow, Green, White } = Color;

const IN_TURN = { isOwnTurn: true } as const;
const OUT_TURN = { isOwnTurn: false } as const;

const kinds = (claims: { kind: ClaimKind }[]): ClaimKind[] =>
  claims.map((c) => c.kind).sort();

describe('canWin', () => {
  it('ăn lá làm tròn bài = tới', () => {
    // đang có 1 Xe đỏ lẻ, ăn Xe đỏ → đôi → tròn
    expect(canWin([t(Chariot, Red)], t(Chariot, Red))).toBe(true);
    // ăn nhưng vẫn còn rác → chưa tới
    expect(canWin([t(Chariot, Red), t(Cannon, Green)], t(Chariot, Red))).toBe(false);
  });
});

describe('legalClaims — nhóm cùng quân+màu', () => {
  it('ăn thành đôi (chỉ khi tới lượt)', () => {
    const hand = [t(Soldier, Red)];
    expect(kinds(legalClaims(hand, t(Soldier, Red), IN_TURN))).toEqual(['pair']);
    // ngoài lượt: ăn thành đôi không được giật
    expect(legalClaims(hand, t(Soldier, Red), OUT_TURN)).toEqual([]);
  });

  it('đôi → khạp (giật vòng, bắt buộc)', () => {
    const hand = [t(Chariot, Red), t(Chariot, Red)];
    const cl = legalClaims(hand, t(Chariot, Red), OUT_TURN);
    expect(cl).toHaveLength(1);
    expect(cl[0].kind).toBe('triple');
    expect(cl[0].outOfTurn).toBe(true);
    expect(cl[0].mandatory).toBe(true);
  });

  it('đang chờ tới thì đôi không còn bắt buộc (được bỏ đôi §8)', () => {
    const hand = [t(Chariot, Red), t(Chariot, Red)];
    const cl = legalClaims(hand, t(Chariot, Red), { isOwnTurn: true, waitingToWin: true });
    expect(cl[0].kind).toBe('triple');
    expect(cl[0].mandatory).toBe(false);
  });

  it('khạp → quằn (khui, bắt buộc, giật được)', () => {
    const hand = [t(Horse, Green), t(Horse, Green), t(Horse, Green)];
    const cl = legalClaims(hand, t(Horse, Green), OUT_TURN);
    expect(cl).toHaveLength(1);
    expect(cl[0].kind).toBe('quad');
    expect(cl[0].mandatory).toBe(true);
    expect(cl[0].outOfTurn).toBe(true);
  });

  it('Tướng không được ăn để đôi/khạp; chỉ khui khi có 3', () => {
    // 1 Tướng, ăn Tướng → KHÔNG có nước nào
    expect(legalClaims([t(General, Red)], t(General, Red), IN_TURN)).toEqual([]);
    // 3 Tướng, giật con thứ 4 → khui
    const cl = legalClaims(
      [t(General, Red), t(General, Red), t(General, Red)],
      t(General, Red),
      OUT_TURN,
    );
    expect(cl.map((c) => c.kind)).toEqual(['quad']);
  });
});

describe('legalClaims — liền', () => {
  it('liền Xe–Pháo–Mã cùng màu (ăn bằng rác, chỉ khi tới lượt)', () => {
    const hand = [t(Cannon, Red), t(Horse, Red)];
    const cl = legalClaims(hand, t(Chariot, Red), IN_TURN);
    expect(cl).toHaveLength(1);
    expect(cl[0].kind).toBe('lien');
    expect(cl[0].outOfTurn).toBe(false);
    // ngoài lượt không được ăn liền bằng rác
    expect(legalClaims(hand, t(Chariot, Red), OUT_TURN)).toEqual([]);
  });

  it('liền Tướng–Sỹ–Tượng (dùng Tướng + Tượng để ăn Sỹ)', () => {
    const hand = [t(General, Yellow), t(Elephant, Yellow)];
    const cl = legalClaims(hand, t(Advisor, Yellow), IN_TURN);
    expect(cl.map((c) => c.kind)).toEqual(['lien']);
  });

  it('liền Tốt 3 màu và mở rộng 4 màu', () => {
    expect(
      kinds(legalClaims([t(Soldier, Red), t(Soldier, Green)], t(Soldier, Yellow), IN_TURN)),
    ).toEqual(['lien']);
    // đã có liền 3 (đỏ,xanh,vàng), ăn Tốt trắng → liền 4
    const cl = legalClaims(
      [t(Soldier, Red), t(Soldier, Green), t(Soldier, Yellow)],
      t(Soldier, White),
      IN_TURN,
    );
    expect(cl.some((c) => c.kind === 'lien' && c.tiles.length === 4)).toBe(true);
  });
});

describe('legalClaims — khạp không được xé (§5.1)', () => {
  it('có khạp 3 Xe, ăn Xe → CHỈ được khui (không pair/triple)', () => {
    const hand = [t(Chariot, Red), t(Chariot, Red), t(Chariot, Red)];
    const cl = legalClaims(hand, t(Chariot, Red), IN_TURN);
    expect(cl.map((c) => c.kind)).toEqual(['quad']);
    expect(cl[0].mandatory).toBe(true);
  });

  it('khạp 3 Xe + Mã rác, ăn Pháo cùng màu → KHÔNG được ăn liền (xé khạp)', () => {
    const hand = [t(Chariot, Red), t(Chariot, Red), t(Chariot, Red), t(Horse, Red)];
    // liền Xe-Pháo-Mã cần rút 1 Xe khỏi khạp → cấm
    expect(legalClaims(hand, t(Cannon, Red), IN_TURN)).toEqual([]);
  });
});

describe('legalClaims — liền không được xé (§5.1)', () => {
  it('liền T-S-Tượng trên tay, lật Tướng → KHÔNG được xé Sỹ+Tượng để ăn', () => {
    const hand = [t(General, Red), t(Advisor, Red), t(Elephant, Red)];
    expect(legalClaims(hand, t(General, Red), IN_TURN)).toEqual([]);
  });

  it('liền Xe-Pháo-Mã trên tay, ăn Xe/Pháo/Mã → không có nước nào', () => {
    const hand = [t(Chariot, Red), t(Cannon, Red), t(Horse, Red)];
    expect(legalClaims(hand, t(Chariot, Red), IN_TURN)).toEqual([]);
    expect(legalClaims(hand, t(Cannon, Red), IN_TURN)).toEqual([]);
  });

  it('liền 3 Tốt khác màu: CHỈ ăn được màu còn lại (dùng trọn thành liền 4)', () => {
    const hand = [t(Soldier, Red), t(Soldier, Yellow), t(Soldier, Green)];
    // màu còn lại (trắng) → liền 4, dùng trọn bộ
    const cl = legalClaims(hand, t(Soldier, White), IN_TURN);
    expect(cl).toHaveLength(1);
    expect(cl[0].kind).toBe('lien');
    expect(cl[0].tiles).toHaveLength(4);
    // màu đã có trong liền → không được ăn
    expect(legalClaims(hand, t(Soldier, Red), IN_TURN)).toEqual([]);
  });

  it('2 Tướng + Sỹ + Tượng = Tướng lẻ + liền (0 rác) → KHÔNG được ăn Sỹ/Tượng lật', () => {
    // sắp đúng: {T lẻ} + {liền T-S-Tg} — hết rác, xé ra ăn là phá liền
    const hand = [t(General, Red), t(General, Red), t(Advisor, Red), t(Elephant, Red)];
    expect(legalClaims(hand, t(Advisor, Red), IN_TURN)).toEqual([]);
    expect(legalClaims(hand, t(Elephant, Red), IN_TURN)).toEqual([]);
  });

  it('bụng XXPM vẫn ăn được (liền chưa chốt vì có lá đôi chồng)', () => {
    const hand = [t(Chariot, Red), t(Chariot, Red), t(Cannon, Red), t(Horse, Red)];
    const cl = legalClaims(hand, t(Chariot, Red), IN_TURN);
    expect(cl.some((c) => c.kind === 'pair')).toBe(true);
    expect(cl.some((c) => c.kind === 'lien')).toBe(true);
  });

  it('T + 2 Sỹ + Tượng (liền + Sỹ dư): đôi Sỹ vẫn giật được (dùng trọn đôi)', () => {
    const hand = [t(General, Red), t(Advisor, Red), t(Advisor, Red), t(Elephant, Red)];
    const cl = legalClaims(hand, t(Advisor, Red), OUT_TURN);
    expect(cl.some((c) => c.kind === 'triple')).toBe(true);
  });
});

describe('legalClaims — anti-rác tuyệt đối (ăn không được TĂNG rác)', () => {
  it('Tướng + đôi Sỹ, lật Tượng → không được xé Tướng+Sỹ để ăn liền', () => {
    // hiện trạng 0 rác (Tướng lẻ + đôi Sỹ); ăn liền để lại 1 Sỹ rác → cấm
    const hand = [t(General, Red), t(Advisor, Red), t(Advisor, Red)];
    expect(legalClaims(hand, t(Elephant, Red), IN_TURN)).toEqual([]);
  });

  it('Tướng + đôi Tượng, lật Sỹ → tương tự, không được xé', () => {
    const hand = [t(General, Yellow), t(Elephant, Yellow), t(Elephant, Yellow)];
    expect(legalClaims(hand, t(Advisor, Yellow), IN_TURN)).toEqual([]);
  });

  it('Tướng + 1 Sỹ rác, lật Tượng → ĐƯỢC ăn liền (giảm rác)', () => {
    const hand = [t(General, Red), t(Advisor, Red)];
    const cl = legalClaims(hand, t(Elephant, Red), IN_TURN);
    expect(cl.map((c) => c.kind)).toEqual(['lien']);
  });
});

describe('legalClaims — anti-rác (§5, để lại ít rác nhất)', () => {
  it('2 Xe + Pháo + Mã, ăn Xe: KHÔNG được đôi Xe (khạp làm thừa rác)', () => {
    const hand = [t(Chariot, Red), t(Chariot, Red), t(Cannon, Red), t(Horse, Red)];
    const cl = legalClaims(hand, t(Chariot, Red), IN_TURN);
    // chỉ giữ nước để lại 0 rác: ăn bằng 1 Xe (→đôi, còn liền), hoặc Pháo+Mã (→liền, còn đôi)
    expect(cl.some((c) => c.kind === 'triple')).toBe(false); // đôi Xe bị loại
    expect(cl.some((c) => c.kind === 'pair')).toBe(true);
    expect(cl.some((c) => c.kind === 'lien')).toBe(true);
    // ngoài lượt: chỉ có đôi Xe là giật được, mà đôi Xe bị loại → không ăn được
    expect(legalClaims(hand, t(Chariot, Red), OUT_TURN)).toEqual([]);
  });

  it('2 Xe + Pháo (chỉ 1 rác), ăn Xe: được đôi Xe (không có nước sạch hơn)', () => {
    const hand = [t(Chariot, Red), t(Chariot, Red), t(Cannon, Red)];
    const cl = legalClaims(hand, t(Chariot, Red), IN_TURN);
    // đôi Xe để lại Pháo lẻ (1 rác); ăn bằng 1 Xe để lại {Xe,Pháo} cũng 1 rác → cùng min
    expect(cl.some((c) => c.kind === 'triple')).toBe(true);
  });

  it('2 Tốt xanh + đỏ + trắng, ăn Tốt xanh: KHÔNG được đôi (khạp làm thừa rác)', () => {
    const hand = [t(Soldier, Green), t(Soldier, Green), t(Soldier, Red), t(Soldier, White)];
    const cl = legalClaims(hand, t(Soldier, Green), IN_TURN);
    expect(cl.some((c) => c.kind === 'triple')).toBe(false);
    // ăn bằng 1 Tốt xanh (→đôi, còn liền đỏ-xanh-trắng) hoặc đỏ+trắng (→liền, còn đôi)
    expect(cl.some((c) => c.kind === 'pair')).toBe(true);
    expect(cl.some((c) => c.kind === 'lien')).toBe(true);
  });
});
