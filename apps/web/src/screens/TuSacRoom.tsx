import { useMemo, useState } from 'react';
import {
  canWin,
  isTenpai,
  isWinningHand,
  legalClaims,
  sameTile,
  type Claim,
  type Tile,
} from '@card-games/game-tusac';
import type { TuSacSeat } from '@card-games/types';
import { TuSacTileView, tusacTileLabel } from '../components/TuSacTileView';
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
  const [claimBusy, setClaimBusy] = useState(false);

  // Cửa sổ ăn: mình có trong danh sách chờ phản hồi?
  const claiming =
    playing && match!.phase === 'awaiting-claims' && match!.pendingClaimers.includes(seat);
  const pendingTile = match?.pending?.tile as Tile | undefined;

  const claimInfo = useMemo(() => {
    if (!claiming || !pendingTile) return null;
    const claims = legalClaims(hand, pendingTile, {
      isOwnTurn: false,
      waitingToWin: isTenpai(hand),
    });
    const win = canWin(hand, pendingTile);
    const forced = !win && claims.some((c) => c.mandatory);
    return { claims, win, forced };
  }, [claiming, pendingTile, hand]);

  const handWinning = useMemo(
    () => playing && myTurn && match!.phase === 'awaiting-discard' && isWinningHand(hand),
    [playing, myTurn, match, hand],
  );

  const respondAnd = async (fn: () => Promise<void>) => {
    setClaimBusy(true);
    try {
      await fn();
    } finally {
      setClaimBusy(false);
    }
  };

  // Ghế đối thủ theo vị trí tương đối: trái → trên → phải
  const opponents = POSITIONS.map((_, i) => {
    const target = (seat + i + 1) % room.maxPlayers;
    return room.players.find((p) => p.seat === target) ?? null;
  });

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
            {hand.map((tile, i) => (
              <TuSacTileView
                key={`${tile.piece}-${tile.color}-${i}`}
                tile={tile}
                selected={!!selected && sameTile(selected, tile)}
                onClick={playing ? () => select(tile) : undefined}
              />
            ))}
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
                🂠 Bốc bài
              </button>
            )}

            {playing && myTurn && match!.phase === 'awaiting-discard' && (
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
                  Đánh{selected ? ` ${tusacTileLabel(selected)}` : ''}
                </button>
              </>
            )}
          </div>
        </div>

        {claimInfo && pendingTile && (
          <div className="ts-claim-panel">
            <div className="ts-claim-panel__title">
              Bạn có thể ăn <strong>{tusacTileLabel(pendingTile)}</strong>
            </div>
            <div className="ts-claim-panel__actions">
              {claimInfo.win && (
                <button
                  className="btn btn--primary"
                  disabled={claimBusy}
                  onClick={() => void respondAnd(() => respond({ type: 'win' }))}
                >
                  🏆 Tới!
                </button>
              )}
              {claimInfo.claims.map((c, i) => (
                <button
                  key={i}
                  className="btn btn--primary"
                  disabled={claimBusy}
                  onClick={() =>
                    void respondAnd(() => respond({ type: 'claim', tiles: c.fromHand }))
                  }
                >
                  {CLAIM_LABELS[c.kind]} ({c.fromHand.map(tusacTileLabel).join(' + ')})
                  {c.mandatory ? ' *' : ''}
                </button>
              ))}
              <button
                className="btn"
                disabled={claimBusy || claimInfo.forced}
                title={claimInfo.forced ? 'Bắt buộc phải ăn (khui/đôi)' : undefined}
                onClick={() => void respondAnd(() => respond({ type: 'pass' }))}
              >
                Bỏ qua
              </button>
            </div>
          </div>
        )}
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
