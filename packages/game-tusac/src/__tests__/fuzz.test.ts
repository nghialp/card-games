import { describe, expect, it } from 'vitest';
import { createDeck, deal, shuffle, type Rng } from '../tiles';
import { isWinningHand, maxMeldCover } from '../melds';
import { canWin, isTenpai, legalClaims } from '../claims';
import { TuSacMatch } from '../match';

/** LCG có seed để tái lập */
function lcg(seed: number): Rng {
  let s = seed >>> 0;
  return (max: number) => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s % max;
  };
}

/**
 * Chơi một ván tới khi kết thúc bằng "auto-player" tham lam (hướng tới thắng):
 * - tới lượt: tự tới nếu tròn, không thì bỏ lá RÁC NHẤT (bỏ đi mà độ phủ nhóm còn cao nhất).
 * - cửa sổ ăn: tới nếu được; bắt buộc thì khui/đôi; còn lại bỏ.
 * Ném lỗi nếu engine chuyển trạng thái sai / deadlock.
 */
function playOut(m: TuSacMatch, cap = 4000): number {
  let steps = 0;
  while (m.phase !== 'finished') {
    if (++steps > cap) throw new Error('KHÔNG KẾT THÚC (deadlock?)');
    const st = m.publicState();
    if (st.phase === 'awaiting-draw') {
      m.draw(st.turn);
    } else if (st.phase === 'awaiting-discard') {
      const hand = m.handOf(st.turn);
      if (hand.length === 0 || isWinningHand(hand)) {
        m.declareWin(st.turn);
      } else {
        m.discard(st.turn, mostRac(hand));
      }
    } else if (st.phase === 'awaiting-claims') {
      const seat = st.pendingClaimers[0];
      const tile = st.pending!.tile;
      const hand = m.handOf(seat);
      const cw = canWin(hand, tile);
      const claims = legalClaims(hand, tile, {
        isOwnTurn: false,
        waitingToWin: isTenpai(hand),
      });
      const mand = claims.find((c) => c.mandatory);
      if (cw) m.respondClaim(seat, { type: 'win' });
      else if (mand) m.respondClaim(seat, { type: 'claim', tiles: mand.fromHand });
      else m.respondClaim(seat, { type: 'pass' });
    }
  }
  return steps;
}

/** Lá mà bỏ đi vẫn giữ độ phủ nhóm cao nhất = lá "rác nhất" */
function mostRac(hand: readonly Tile[]): (typeof hand)[number] {
  let bestIdx = 0;
  let bestCover = -1;
  for (let i = 0; i < hand.length; i++) {
    const rest = hand.slice(0, i).concat(hand.slice(i + 1));
    const cover = maxMeldCover(rest);
    if (cover > bestCover) {
      bestCover = cover;
      bestIdx = i;
    }
  }
  return hand[bestIdx];
}

describe('TuSacMatch — fuzz (nhiều ván ngẫu nhiên)', () => {
  for (const players of [2, 3, 4]) {
    it(`${players} người: mọi ván kết thúc hợp lệ, không deadlock/throw`, () => {
      let wins = 0;
      let draws = 0;
      const GAMES = 60;
      for (let g = 0; g < GAMES; g++) {
        const { hands, pile } = deal(shuffle(createDeck(), lcg(g * 131 + players)), players);
        const m = new TuSacMatch(hands, pile);
        playOut(m);
        const res = m.result!;
        expect(res.kind === 'win' || res.kind === 'draw').toBe(true);
        if (res.kind === 'win') {
          expect(res.winner).toBeGreaterThanOrEqual(0);
          expect(res.winner).toBeLessThan(players);
          wins++;
        } else {
          draws++;
        }
      }
      // Nhánh thắng phải được fuzz (auto-player tham lam → có ván thắng thật)
      expect(wins).toBeGreaterThan(0);
      expect(wins + draws).toBe(GAMES);
    });
  }
});
