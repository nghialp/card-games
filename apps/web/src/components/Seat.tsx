import type { RoomPlayer } from '@card-games/types';
import { CardBack } from './PlayingCard';

interface Props {
  player: RoomPlayer | null;
  position: 'top' | 'left' | 'right';
  isTurn: boolean;
  passed: boolean;
  cardsLeft: number | undefined;
  playing: boolean;
}

export function Seat({ player, position, isTurn, passed, cardsLeft, playing }: Props) {
  return (
    <div className={`seat seat--${position} ${isTurn ? 'seat--turn' : ''}`}>
      {player ? (
        <>
          <div className={`seat__avatar ${!player.connected ? 'seat__avatar--offline' : ''}`}>
            {player.displayName.charAt(0).toUpperCase()}
          </div>
          <div className="seat__name">{player.displayName}</div>
          {playing && cardsLeft !== undefined && cardsLeft > 0 && (
            <div className="seat__cards">
              {Array.from({ length: Math.min(cardsLeft, 5) }, (_, i) => (
                <CardBack key={i} />
              ))}
              <span className="seat__count">{cardsLeft}</span>
            </div>
          )}
          {playing && cardsLeft === 0 && <div className="seat__badge seat__badge--done">Hết bài 🎉</div>}
          {passed && <div className="seat__badge">Bỏ lượt</div>}
          {!playing && player.ready && <div className="seat__badge seat__badge--ready">Sẵn sàng ✓</div>}
          {!player.connected && <div className="seat__badge seat__badge--offline">Mất kết nối</div>}
        </>
      ) : (
        <div className="seat__empty">Ghế trống</div>
      )}
    </div>
  );
}
