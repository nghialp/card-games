import { useEffect, useMemo, useState } from 'react';
import {
  canWin,
  isTenpai,
  isWinningHand,
  legalClaims,
  maxMeldCover,
  sameTile,
  type Claim,
  type Tile,
} from '@card-games/game-tusac';
import type { TuSacSeat } from '@card-games/types';
import { TuSacTileView, tusacTileLabel } from '../components/TuSacTileView';
import { TurnTimer } from '../components/TurnTimer';
import { tryLockLandscape, unlockOrientation } from '../lib/orientation';
import { getUserId } from '../lib/socket';
import { useAuth } from '../store/auth';
import { seatOf, useTusac } from '../store/tusac';

const POSITIONS = ['left', 'top', 'right'] as const;

const CLAIM_LABELS: Record<Claim['kind'], string> = {
  pair: 'Ăn',
  triple: 'Đôi',
  quad: 'Khui',
  lien: 'Ăn liền',
};

function BalanceChip() {
  const user = useAuth((s) => s.user);
  const balance = useAuth((s) => s.balance);
  if (!user) return null;
  return (
    <span className="balance balance--chip">🍠 {balance.toLocaleString('vi-VN')}</span>
  );
}

function MeldRow({ melds }: { melds: Tile[][] }) {
  if (melds.length === 0) return null;
  return (
    <div className="ts-melds">
      {melds.map((meld, i) => (
        <div key={i} className="ts-meld">
          {meld.map((tile, j) => (
            <TuSacTileView key={j} tile={tile} size="small" />
          ))}
        </div>
      ))}
    </div>
  );
}

function OpponentSeat({
  player,
  position,
  isTurn,
}: {
  player: TuSacSeat | null;
  position: (typeof POSITIONS)[number];
  isTurn: boolean;
}) {
  return (
    <div className={`seat seat--${position} ${isTurn ? 'seat--turn' : ''}`}>
      {player ? (
        <>
          <div className={`seat__avatar ${!player.connected ? 'seat__avatar--offline' : ''}`}>
            {player.displayName.charAt(0).toUpperCase()}
          </div>
          <div className="seat__name">{player.displayName}</div>
          {player.handCount > 0 && (
            <div className="seat__badge">{player.handCount} lá</div>
          )}
          <MeldRow melds={player.melds as Tile[][]} />
        </>
      ) : (
        <div className="seat__empty">Ghế trống</div>
      )}
    </div>
  );
}

/** Đánh dấu các chỉ số lá trên tay khớp multiset `tiles` (mỗi lá dùng 1 lần) */
function markIndices(hand: readonly Tile[], tiles: readonly Tile[]): Set<number> {
  const marked = new Set<number>();
  const rest = [...tiles];
  hand.forEach((h, i) => {
    const j = rest.findIndex((t) => sameTile(t, h));
    if (j !== -1) {
      rest.splice(j, 1);
      marked.add(i);
    }
  });
  return marked;
}

export function TuSacRoom() {
  const room = useTusac((s) => s.room)!;
  const hand = useTusac((s) => s.hand);
  const match = useTusac((s) => s.match);
  const result = useTusac((s) => s.result);
  const selected = useTusac((s) => s.selected);
  const { select, discardSelected, draw, respond, declareWin, setReady, leave, dismissResult } =
    useTusac.getState();

  const seat = seatOf(room);
  const me = room.players.find((p) => p.userId === getUserId());
  const playing = room.status === 'playing' && !!match;
  const myTurn = playing && match!.turn === seat;
  const [busy, setBusy] = useState(false);
  const [claimSel, setClaimSel] = useState<Claim | null>(null);

  // Cửa sổ ăn: mình có trong danh sách chờ phản hồi?
  const claiming =
    playing && match!.phase === 'awaiting-claims' && match!.pendingClaimers.includes(seat);
  const pendingTile = match?.pending?.tile as Tile | undefined;

  const claimInfo = useMemo(() => {
    if (!claiming || !pendingTile) return null;
    const claims = legalClaims(hand, pendingTile, {
      // "đúng cửa" mới được ăn rác/ăn lẻ — tính giống engine
      isOwnTurn: match!.pending!.gate === seat,
      waitingToWin: isTenpai(hand),
    });
    const win = canWin(hand, pendingTile);
    const forced = !win && claims.some((c) => c.mandatory);
    return { claims, win, forced };
  }, [claiming, pendingTile, hand, match, seat]);

  // Tự chọn sẵn khi chỉ có đúng 1 nước ăn (thường là khui/đôi bắt buộc)
  useEffect(() => {
    setClaimSel(claimInfo?.claims.length === 1 ? claimInfo.claims[0] : null);
  }, [claimInfo]);

  // Mobile: cố gắng khoá màn hình ngang khi ở trong bàn
  useEffect(() => {
    tryLockLandscape();
    return unlockOrientation;
  }, []);

  // Lá được chọn trong nhóm ăn (đánh dấu theo chỉ số vì có lá trùng nhau)
  const claimSelIdx = useMemo(
    () => (claimSel ? markIndices(hand, claimSel.fromHand) : new Set<number>()),
    [claimSel, hand],
  );

  const discardPhase = playing && myTurn && match!.phase === 'awaiting-discard';
  const handWinning = useMemo(
    () => discardPhase && isWinningHand(hand),
    [discardPhase, hand],
  );

  // Khi đánh rác: chỉ các lá RÁC được chọn (bỏ đi không làm vỡ nhóm)
  const discardable = useMemo(() => {
    if (!discardPhase) return new Set<number>();
    const full = maxMeldCover(hand);
    const ok = new Set<number>();
    hand.forEach((_, i) => {
      const rest = hand.slice(0, i).concat(hand.slice(i + 1));
      if (maxMeldCover(rest) === full) ok.add(i);
    });
    // phòng hờ: không tìm được rác (không xảy ra khi chưa tròn) → cho chọn tất cả
    return ok.size > 0 ? ok : new Set(hand.map((_, i) => i));
  }, [discardPhase, hand]);

  const onTileClick = (tile: Tile, index: number): void => {
    if (claiming && claimInfo) {
      // click lá hợp lệ → chọn cả nhóm ăn chứa lá đó (click lần nữa → đổi nhóm khác)
      const options = claimInfo.claims.filter((c) =>
        c.fromHand.some((t) => sameTile(t, tile)),
      );
      if (options.length === 0) return;
      const cur = options.findIndex((c) => c === claimSel);
      setClaimSel(options[(cur + 1) % options.length]);
      return;
    }
    if (discardPhase && discardable.has(index)) select(tile);
  };

  const doRespond = async (fn: () => Promise<void>): Promise<void> => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  // Ghế đối thủ theo vị trí tương đối: trái → trên → phải
  const opponents = POSITIONS.map((_, i) => {
    const target = (seat + i + 1) % room.maxPlayers;
    return room.players.find((p) => p.seat === target) ?? null;
  });

  const claimableIdx = useMemo(() => {
    if (!claiming || !claimInfo) return new Set<number>();
    const all = new Set<number>();
    for (const c of claimInfo.claims) {
      for (const i of markIndices(hand, c.fromHand)) all.add(i);
    }
    return all;
  }, [claiming, claimInfo, hand]);

  return (
    <div className="room">
      <header className="room__header">
        <span>
          Tứ Sắc <strong>{room.id}</strong>
          {room.betAmount > 0 && <> · cược {room.betAmount} 🍠</>}
        </span>
        <div className="room__header-actions">
          <BalanceChip />
          <button className="btn btn--ghost" onClick={() => void leave()}>
            Rời phòng
          </button>
        </div>
      </header>

      <div className="table-felt">
        {opponents.map((p, i) => (
          <OpponentSeat
            key={POSITIONS[i]}
            player={p}
            position={POSITIONS[i]}
            isTurn={playing && p?.seat === match!.turn}
          />
        ))}

        <div className="table-center">
          {playing && (
            <>
              <div className="ts-pile">🂠 Nọc: {match!.pileCount}</div>
              {pendingTile && (
                <div className="ts-pending">
                  <TuSacTileView tile={pendingTile} />
                  <span className="ts-pending__label">
                    {match!.pending!.kind === 'draw' ? 'Lá vừa lật' : 'Lá vừa đánh'}
                  </span>
                </div>
              )}
              {match!.endsAt ? <TurnTimer endsAt={match!.endsAt} /> : null}
              {match!.discards.length > 0 && (
                <div className="ts-discards" title="Đống rác (không ai ăn)">
                  {(match!.discards as Tile[]).slice(-8).map((tile, i) => (
                    <TuSacTileView key={i} tile={tile} size="small" />
                  ))}
                </div>
              )}
            </>
          )}
          {!playing && (
            <div className="table-hint">
              {room.players.length < 2 ? 'Đang chờ người chơi…' : 'Bấm Sẵn sàng để bắt đầu'}
            </div>
          )}
        </div>

        <div className={`me ${myTurn ? 'me--turn' : ''}`}>
          {me && <MeldRow melds={(me.melds as Tile[][]) ?? []} />}

          <div className="ts-hand">
            {hand.map((tile, i) => {
              const inClaimMode = claiming && !!claimInfo;
              const clickable = inClaimMode
                ? claimableIdx.has(i)
                : discardPhase && discardable.has(i);
              const dim = (inClaimMode || discardPhase) && !clickable;
              const isSel = inClaimMode
                ? claimSelIdx.has(i)
                : !!selected && sameTile(selected, tile) && discardable.has(i);
              return (
                <div key={`${tile.piece}-${tile.color}-${i}`} className={dim ? 'ts-slot--dim' : ''}>
                  <TuSacTileView
                    tile={tile}
                    selected={isSel}
                    onClick={clickable ? () => onTileClick(tile, i) : undefined}
                  />
                </div>
              );
            })}
          </div>

          <div className="controls">
            {!playing && (
              <button
                className={`btn btn--big ${me?.ready ? '' : 'btn--primary'}`}
                onClick={() => void setReady(!me?.ready)}
              >
                {me?.ready ? 'Hủy sẵn sàng' : 'Sẵn sàng'}
              </button>
            )}

            {playing && myTurn && match!.phase === 'awaiting-draw' && (
              <button className="btn btn--primary" onClick={() => void draw()}>
                🂠 Lật bài
              </button>
            )}

            {discardPhase && (
              <>
                {handWinning && (
                  <button className="btn btn--primary" onClick={() => void declareWin()}>
                    🏆 Tới!
                  </button>
                )}
                <button
                  className="btn btn--primary"
                  disabled={!selected}
                  onClick={() => void discardSelected()}
                >
                  Đánh{selected ? ` ${tusacTileLabel(selected)}` : ' (chọn 1 lá rác)'}
                </button>
              </>
            )}

            {claiming && claimInfo && (
              <>
                {claimInfo.win && (
                  <button
                    className="btn btn--primary"
                    disabled={busy}
                    onClick={() => void doRespond(() => respond({ type: 'win' }))}
                  >
                    🏆 Tới!
                  </button>
                )}
                <button
                  className="btn btn--primary"
                  disabled={busy || !claimSel}
                  onClick={() =>
                    claimSel &&
                    void doRespond(() => respond({ type: 'claim', tiles: claimSel.fromHand }))
                  }
                >
                  {claimSel
                    ? `${CLAIM_LABELS[claimSel.kind]} ${tusacTileLabel(pendingTile!)}${claimSel.mandatory ? ' (bắt buộc)' : ''}`
                    : 'Chọn lá để ăn'}
                </button>
                <button
                  className="btn"
                  disabled={busy || claimInfo.forced}
                  title={claimInfo.forced ? 'Bắt buộc phải ăn (khui/đôi)' : undefined}
                  onClick={() => void doRespond(() => respond({ type: 'pass' }))}
                >
                  Bỏ qua
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Mobile cầm dọc: nhắc xoay ngang (web không ép xoay được ngoài fullscreen) */}
      <div className="rotate-hint">
        <span className="rotate-hint__icon">📱↻</span>
        Xoay ngang màn hình để chơi
      </div>

      {result && (
        <div className="overlay">
          <div className="overlay__panel">
            <h2>Kết quả ván</h2>
            {result.kind === 'draw' ? (
              <p className="section-note">Hết nọc — ván hoà</p>
            ) : (
              <>
                {result.quan && <div className="instant-win-banner">⚡ TỚI QUAN — ×2!</div>}
                <p className="section-note">
                  🏆{' '}
                  {room.players.find((p) => p.seat === result.winner)?.displayName ??
                    `Ghế ${result.winner}`}{' '}
                  tới!
                </p>
              </>
            )}
            <ol className="result-list">
              {room.players.map((p) => (
                <li key={p.userId}>
                  <span>{p.displayName}</span>
                  <span
                    className={
                      (result.coinDelta[p.userId] ?? 0) >= 0 ? 'coin coin--win' : 'coin coin--lose'
                    }
                  >
                    {(result.coinDelta[p.userId] ?? 0) >= 0 ? '+' : ''}
                    {result.coinDelta[p.userId] ?? 0} 🍠
                  </span>
                </li>
              ))}
            </ol>
            <div className="overlay__actions">
              <button
                className="btn btn--primary"
                onClick={() => {
                  dismissResult();
                  void setReady(true);
                }}
              >
                Chơi tiếp
              </button>
              <button className="btn" onClick={dismissResult}>
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
