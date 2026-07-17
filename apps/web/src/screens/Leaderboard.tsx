import { useEffect, useState } from 'react';
import type { LeaderboardResponse } from '@card-games/types';
import { api, errorLabel } from '../lib/api';
import { useAuth } from '../store/auth';

const MEDALS = ['🥇', '🥈', '🥉'];

export function Leaderboard({ onBack }: { onBack: () => void }) {
  const user = useAuth((s) => s.user);
  const [data, setData] = useState<LeaderboardResponse | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api<LeaderboardResponse>('/leaderboard/weekly')
      .then(setData)
      .catch((err) => setError(errorLabel(err)));
  }, []);

  return (
    <div className="page">
      <header className="page__header">
        <button className="btn btn--ghost" onClick={onBack}>
          ← Quay lại
        </button>
        <h2>🏆 BXH tuần</h2>
        <span />
      </header>

      {error && <div className="form-error">{error}</div>}

      {data && (
        <div className="page__body">
          <p className="section-note">
            Tính từ thứ Hai (
            {new Date(data.weekStart).toLocaleDateString('vi-VN')}) — tổng củ
            thắng/thua trong tuần
          </p>
          {data.entries.length === 0 && (
            <div className="empty-note">Tuần này chưa có trận nào</div>
          )}
          <div className="match-list">
            {data.entries.map((e, i) => (
              <div
                key={e.userId}
                className={`match-row ${e.userId === user?.id ? 'match-row--me' : ''}`}
              >
                <div className="match-row__main">
                  <span className="match-row__medal">{MEDALS[i] ?? `#${i + 1}`}</span>
                  <div>
                    <div className="match-row__title">{e.displayName}</div>
                    <div className="match-row__sub">
                      {e.matches} trận · {e.wins} thắng
                    </div>
                  </div>
                </div>
                <span className={e.points >= 0 ? 'coin coin--win' : 'coin coin--lose'}>
                  {e.points >= 0 ? '+' : ''}
                  {e.points.toLocaleString('vi-VN')} 🍠
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
