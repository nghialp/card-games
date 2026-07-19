import { describe, expect, it } from 'vitest';
import {
  Color,
  countsToTiles,
  createDeck,
  deal,
  DECK_SIZE,
  Piece,
  toCounts,
  type Tile,
} from '../tiles';
import { detectMeld, isWinningHand, Meld } from '../melds';

const t = (piece: Piece, color: Color): Tile => ({ piece, color });
const { General, Advisor, Elephant, Chariot, Cannon, Horse, Soldier } = Piece;
const { Red, Yellow, Green, White } = Color;

describe('deck', () => {
  it('112 lá, mỗi (quân,màu) đúng 4 bản', () => {
    const deck = createDeck();
    expect(deck).toHaveLength(DECK_SIZE);
    expect(deck).toHaveLength(112);
    const counts = toCounts(deck);
    expect(counts.every((c) => c === 4)).toBe(true);
  });

  it('toCounts ↔ countsToTiles round-trip', () => {
    const hand = [t(Chariot, Red), t(Chariot, Red), t(General, White)];
    expect(toCounts(countsToTiles(toCounts(hand)))).toEqual(toCounts(hand));
  });

  it('deal: cái 21 lá, còn lại 20, phần dư làm nọc', () => {
    const { hands, pile } = deal(createDeck(), 4);
    expect(hands.map((h) => h.length)).toEqual([21, 20, 20, 20]);
    expect(pile).toHaveLength(112 - 81);
    // không mất lá
    const total = hands.flat().length + pile.length;
    expect(total).toBe(112);
  });
});

describe('detectMeld', () => {
  it('đôi / khạp / quằn (cùng quân+màu)', () => {
    expect(detectMeld([t(Chariot, Red), t(Chariot, Red)])).toBe(Meld.Pair);
    expect(detectMeld([t(Cannon, Yellow), t(Cannon, Yellow), t(Cannon, Yellow)])).toBe(
      Meld.Triple,
    );
    expect(
      detectMeld([t(Horse, Green), t(Horse, Green), t(Horse, Green), t(Horse, Green)]),
    ).toBe(Meld.Quad);
    expect(detectMeld([t(Chariot, Red), t(Chariot, Green)])).toBeNull();
  });

  it('Tướng lẻ hợp lệ, quân khác đứng lẻ thì không', () => {
    expect(detectMeld([t(General, Red)])).toBe(Meld.GeneralSingle);
    expect(detectMeld([t(Advisor, Red)])).toBeNull();
    expect(detectMeld([t(Soldier, Red)])).toBeNull();
  });

  it('liền Xe–Pháo–Mã cùng màu', () => {
    expect(detectMeld([t(Chariot, Red), t(Cannon, Red), t(Horse, Red)])).toBe(
      Meld.LienChariot,
    );
    // khác màu → không
    expect(detectMeld([t(Chariot, Red), t(Cannon, Red), t(Horse, Green)])).toBeNull();
    // thiếu quân (Xe + 2 Pháo, không đủ Xe–Pháo–Mã) → không phải nhóm hợp lệ
    expect(detectMeld([t(Chariot, Red), t(Cannon, Red), t(Cannon, Red)])).toBeNull();
  });

  it('liền Tướng–Sỹ–Tượng cùng màu', () => {
    expect(detectMeld([t(General, Yellow), t(Advisor, Yellow), t(Elephant, Yellow)])).toBe(
      Meld.LienGeneral,
    );
    expect(detectMeld([t(General, Yellow), t(Advisor, Yellow), t(Elephant, Red)])).toBeNull();
  });

  it('liền Tốt: 3 hoặc 4 khác màu', () => {
    expect(detectMeld([t(Soldier, Red), t(Soldier, Green), t(Soldier, Yellow)])).toBe(
      Meld.LienSoldier,
    );
    expect(
      detectMeld([t(Soldier, Red), t(Soldier, Green), t(Soldier, Yellow), t(Soldier, White)]),
    ).toBe(Meld.LienSoldier);
    // 3 Tốt trùng màu → không phải liền
    expect(detectMeld([t(Soldier, Red), t(Soldier, Red), t(Soldier, Green)])).toBeNull();
    // 4 Tốt có trùng màu → không phải một meld
    expect(
      detectMeld([t(Soldier, Red), t(Soldier, Red), t(Soldier, Green), t(Soldier, Yellow)]),
    ).toBeNull();
  });
});

describe('isWinningHand', () => {
  it('rỗng = tròn; Tướng lẻ = tròn; quân khác lẻ = chưa tròn', () => {
    expect(isWinningHand([])).toBe(true);
    expect(isWinningHand([t(General, Red)])).toBe(true);
    expect(isWinningHand([t(Advisor, Red)])).toBe(false);
  });

  it('đôi tròn; đôi + 1 lá lẻ (không phải Tướng) = chưa tròn', () => {
    expect(isWinningHand([t(Chariot, Red), t(Chariot, Red)])).toBe(true);
    expect(
      isWinningHand([t(Chariot, Red), t(Chariot, Red), t(Cannon, Green)]),
    ).toBe(false);
    // + Tướng lẻ thì tròn
    expect(
      isWinningHand([t(Chariot, Red), t(Chariot, Red), t(General, White)]),
    ).toBe(true);
  });

  it('các liền đều tròn', () => {
    expect(isWinningHand([t(Chariot, Red), t(Cannon, Red), t(Horse, Red)])).toBe(true);
    expect(
      isWinningHand([t(General, Green), t(Advisor, Green), t(Elephant, Green)]),
    ).toBe(true);
    expect(isWinningHand([t(Soldier, Red), t(Soldier, Green), t(Soldier, Yellow)])).toBe(
      true,
    );
  });

  it('4 Tốt đủ 4 màu = một liền, tròn (chốt câu 1)', () => {
    expect(
      isWinningHand([
        t(Soldier, Red),
        t(Soldier, Yellow),
        t(Soldier, Green),
        t(Soldier, White),
      ]),
    ).toBe(true);
  });

  it('tách một ô Tốt vào hai liền khác nhau', () => {
    // 2 đỏ + 2 xanh + 1 vàng + 1 trắng → liền(đỏ,xanh,vàng) + liền(đỏ,xanh,trắng)
    expect(
      isWinningHand([
        t(Soldier, Red),
        t(Soldier, Red),
        t(Soldier, Green),
        t(Soldier, Green),
        t(Soldier, Yellow),
        t(Soldier, White),
      ]),
    ).toBe(true);
  });

  it('backtracking: 2 Tướng + Sỹ + Tượng cùng màu → liền + Tướng lẻ (không phải đôi Tướng)', () => {
    // greedy chọn đôi Tướng sẽ kẹt; phải chọn liền T-S-T + Tướng lẻ
    expect(
      isWinningHand([
        t(General, Red),
        t(General, Red),
        t(Advisor, Red),
        t(Elephant, Red),
      ]),
    ).toBe(true);
  });

  it('Tướng + Sỹ + Tượng + Sỹ dư (2 Sỹ) = chưa tròn', () => {
    expect(
      isWinningHand([
        t(General, Red),
        t(Advisor, Red),
        t(Advisor, Red),
        t(Elephant, Red),
      ]),
    ).toBe(false);
  });

  it('bàn tay lớn nhiều nhóm hỗn hợp = tròn', () => {
    const hand: Tile[] = [
      // đôi Xe đỏ
      t(Chariot, Red), t(Chariot, Red),
      // khạp Pháo vàng
      t(Cannon, Yellow), t(Cannon, Yellow), t(Cannon, Yellow),
      // liền Xe–Pháo–Mã xanh
      t(Chariot, Green), t(Cannon, Green), t(Horse, Green),
      // liền Tướng–Sỹ–Tượng đỏ
      t(General, Red), t(Advisor, Red), t(Elephant, Red),
      // liền Tốt 3 màu
      t(Soldier, Red), t(Soldier, Green), t(Soldier, Yellow),
      // Tướng trắng lẻ
      t(General, White),
    ];
    expect(hand).toHaveLength(15);
    expect(isWinningHand(hand)).toBe(true);
    // bỏ 1 lá Tốt → còn Tốt lẻ (rác) → chưa tròn
    expect(isWinningHand(hand.slice(0, -2))).toBe(false);
  });
});
