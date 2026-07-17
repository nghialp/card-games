import type { MatchResult, RoomState } from '@card-games/types';

interface Props {
  result: MatchResult;
  room: RoomState;
  onPlayAgain: () => void;
  onClose: () => void;
}

const MEDALS = ['🥇', '🥈', '🥉', '4️⃣'];

const INSTANT_WIN_LABELS: Record<string, string> = {
  'four-pigs': 'Tứ quý heo',
  'dragon-straight': 'Sảnh rồng',
  'four-pair-seq': '4 đôi thông',
  'six-pairs': '6 đôi',
};

export function ResultOverlay({ result, room, onPlayAgain, onClose }: Props) {
  const nameOf = (userId: string) =>
    room.players.find((p) => p.userId === userId)?.displayName ?? userId;

  return (
    <div className="overlay">
      <div className="overlay__panel">
        <h2>Kết quả ván</h2>
        {result.instantWin && (
          <div className="instant-win-banner">
            ⚡ Tới trắng — {INSTANT_WIN_LABELS[result.instantWin.type] ?? result.instantWin.type}!
            <div className="instant-win-banner__who">
              {nameOf(result.instantWin.userId)} thắng ngay
            </div>
          </div>
        )}
        <ol className="result-list">
          {result.ranking.map((userId, i) => (
            <li key={userId}>
              <span>
                {MEDALS[i]} {nameOf(userId)}
              </span>
              <span
                className={
                  result.coinDelta[userId] >= 0 ? 'coin coin--win' : 'coin coin--lose'
                }
              >
                {result.coinDelta[userId] >= 0 ? '+' : ''}
                {result.coinDelta[userId]} 🍠
              </span>
            </li>
          ))}
        </ol>
        <div className="overlay__actions">
          <button className="btn btn--primary" onClick={onPlayAgain}>
            Chơi tiếp
          </button>
          <button className="btn" onClick={onClose}>
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
