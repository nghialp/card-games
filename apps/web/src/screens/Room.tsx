import { useState } from 'react';
import { motion } from 'framer-motion';
import { mySeat, selectionValid, useGame } from '../store/game';
import { PlayingCard } from '../components/PlayingCard';
import { PlayedPile, type PilePosition } from '../components/PlayedPile';
import { Seat } from '../components/Seat';
import { TurnTimer } from '../components/TurnTimer';
import { Chat } from '../components/Chat';
import { ResultOverlay } from '../components/ResultOverlay';
import { getUserId } from '../lib/socket';
import { initAudio, isMuted, setMuted } from '../lib/sound';

const POSITIONS = ['left', 'top', 'right'] as const;

function MuteButton() {
  const [muted, set] = useState(isMuted());
  return (
    <button
      className="btn btn--ghost btn--icon"
      onClick={() => {
        initAudio();
        setMuted(!muted);
        set(!muted);
      }}
      title={muted ? 'Bật âm thanh' : 'Tắt âm thanh'}
    >
      {muted ? '🔇' : '🔊'}
    </button>
  );
}

export function Room() {
  const room = useGame((s) => s.room)!;
  const hand = useGame((s) => s.hand);
  const selected = useGame((s) => s.selected);
  const table = useGame((s) => s.table);
  const currentSeat = useGame((s) => s.currentSeat);
  const turnEndsAt = useGame((s) => s.turnEndsAt);
  const passedSeats = useGame((s) => s.passedSeats);
  const cardsLeft = useGame((s) => s.cardsLeft);
  const playedBySeat = useGame((s) => s.playedBySeat);
  const lastPlayedSeat = useGame((s) => s.lastPlayedSeat);
  const result = useGame((s) => s.result);
  const {
    toggleSelect,
    playSelected,
    pass,
    setReady,
    leave,
    dismissResult,
  } = useGame.getState();

  const seat = mySeat(room);
  const playing = room.status === 'playing';
  const myTurn = playing && currentSeat === seat;
  const me = room.players.find((p) => p.userId === getUserId());
  const canPlay = myTurn && selectionValid({ hand, selected, table });
  const canPass = myTurn && table !== null;

  // Ghế đối thủ theo vị trí tương đối: trái → trên → phải
  const opponents = POSITIONS.map((_, i) => {
    const target = (seat + i + 1) % room.maxPlayers;
    return room.players.find((p) => p.seat === target) ?? null;
  });

  // Pile bài vừa đánh của từng ghế, đặt đúng phía người đánh
  const piles: Array<{ position: PilePosition; seat: number }> = [
    { position: 'me', seat },
    ...POSITIONS.map((position, i) => ({
      position,
      seat: (seat + i + 1) % room.maxPlayers,
    })),
  ];

  const isSelected = (c: { rank: number; suit: number }) =>
    selected.some((s) => s.rank === c.rank && s.suit === c.suit);

  return (
    <div className="room">
      <header className="room__header">
        <span>
          Phòng <strong>{room.id}</strong>
          {room.betAmount > 0 && <> · cược {room.betAmount} 🪙</>}
        </span>
        <div className="room__header-actions">
          <MuteButton />
          <button className="btn btn--ghost" onClick={() => void leave()}>
            Rời phòng
          </button>
        </div>
      </header>

      <div className="table-felt">
        {opponents.map((p, i) => (
          <Seat
            key={POSITIONS[i]}
            player={p}
            position={POSITIONS[i]}
            isTurn={playing && p?.seat === currentSeat}
            passed={p ? passedSeats.includes(p.seat) : false}
            cardsLeft={p ? cardsLeft[p.seat] : undefined}
            playing={playing}
          />
        ))}

        {playing &&
          piles.map(({ position, seat: pileSeat }) => (
            <PlayedPile
              key={position}
              cards={playedBySeat[pileSeat] ?? []}
              position={position}
              latest={pileSeat === lastPlayedSeat}
              own={position === 'me'}
            />
          ))}

        <div className="table-center">
          {playing && !table && (
            <div className="table-hint">
              {myTurn ? 'Bạn cầm cái — đánh bất kỳ' : 'Vòng mới'}
            </div>
          )}
          {!playing && (
            <div className="table-hint">
              {room.players.length < 2
                ? 'Đang chờ người chơi…'
                : 'Bấm Sẵn sàng để bắt đầu'}
            </div>
          )}
        </div>

        <div className={`me ${myTurn ? 'me--turn' : ''}`}>
          {myTurn && <TurnTimer endsAt={turnEndsAt} />}
          {passedSeats.includes(seat) && <div className="seat__badge">Đã bỏ lượt</div>}

          <div className="hand" style={{ '--n': hand.length } as React.CSSProperties}>
            {hand.map((c, i) => {
              const key = `${c.rank}-${c.suit}`;
              return (
                <motion.div
                  key={key}
                  className="hand__slot"
                  layout
                  layoutId={`card-${key}`}
                  initial={{ y: 60, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{
                    type: 'spring',
                    stiffness: 400,
                    damping: 30,
                    delay: i * 0.03,
                  }}
                >
                  <PlayingCard
                    card={c}
                    selected={isSelected(c)}
                    onClick={playing ? () => toggleSelect(c) : undefined}
                  />
                </motion.div>
              );
            })}
          </div>

          <div className="controls">
            {playing ? (
              <>
                <button
                  className="btn btn--primary"
                  disabled={!canPlay}
                  onClick={() => void playSelected()}
                >
                  Đánh
                </button>
                <button className="btn" disabled={!canPass} onClick={() => void pass()}>
                  Bỏ lượt
                </button>
              </>
            ) : (
              <button
                className={`btn btn--big ${me?.ready ? '' : 'btn--primary'}`}
                onClick={() => void setReady(!me?.ready)}
              >
                {me?.ready ? 'Hủy sẵn sàng' : 'Sẵn sàng'}
              </button>
            )}
          </div>
        </div>
      </div>

      <Chat />

      {result && (
        <ResultOverlay
          result={result}
          room={room}
          onPlayAgain={() => {
            dismissResult();
            void setReady(true);
          }}
          onClose={dismissResult}
        />
      )}
    </div>
  );
}
