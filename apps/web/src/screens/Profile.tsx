import { useEffect, useState } from 'react';
import type { ProfileResponse } from '@card-games/types';
import { api, errorLabel } from '../lib/api';
import { getAccessToken } from '../store/auth';

const MEDALS = ['🥇', '🥈', '🥉', '4️⃣'];

const fmtTime = (iso: string): string =>
  new Date(iso).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

export function Profile({ onBack }: { onBack: () => void }) {
  const [data, setData] = useState<ProfileResponse | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      setError('Cần đăng nhập để xem hồ sơ');
      return;
    }
    api<ProfileResponse>('/users/me/profile', { token })
      .then(setData)
      .catch((err) => setError(errorLabel(err)));
  }, []);

  return (
    <div className="page">
      <header className="page__header">
        <button className="btn btn--ghost" onClick={onBack}>
          ← Quay lại
        </button>
        <h2>Hồ sơ</h2>
        <span />
      </header>

      {error && <div className="form-error">{error}</div>}

      {data && (
        <div className="page__body">
          <div className="profile-card">
            <div className="seat__avatar profile-card__avatar">
              {data.user.displayName.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="profile-card__name">{data.user.displayName}</div>
              <div className="profile-card__email">{data.user.email}</div>
            </div>
            <div className="balance">
              <span className="balance__icon">🍠</span>
              <span className="balance__amount">
                {data.balance.toLocaleString('vi-VN')}
              </span>
              <span className="balance__unit">củ</span>
            </div>
          </div>

          <div className="stat-row">
            <div className="stat">
              <div className="stat__value">{data.stats.totalMatches}</div>
              <div className="stat__label">Trận đã chơi</div>
            </div>
            <div className="stat">
              <div className="stat__value">{data.stats.wins}</div>
              <div className="stat__label">Thắng</div>
            </div>
            <div className="stat">
              <div className="stat__value">
                {data.stats.totalMatches > 0
                  ? Math.round((data.stats.wins / data.stats.totalMatches) * 100)
                  : 0}
                %
              </div>
              <div className="stat__label">Tỷ lệ thắng</div>
            </div>
          </div>

          <h3 className="section-title">Lịch sử trận</h3>
          {data.matches.length === 0 && (
            <div className="empty-note">Chưa có trận nào — vào chơi thôi!</div>
          )}
          <div className="match-list">
            {data.matches.map((m) => (
              <div key={m.matchId} className="match-row">
                <div className="match-row__main">
                  <span className="match-row__medal">{MEDALS[m.rank] ?? m.rank + 1}</span>
                  <div>
                    <div className="match-row__title">
                      Tiến lên · cược {m.betAmount} 🍠
                    </div>
                    <div className="match-row__sub">
                      {fmtTime(m.endedAt)} ·{' '}
                      {m.players.map((p) => p.displayName).join(' · ')}
                    </div>
                  </div>
                </div>
                <span className={m.coinDelta >= 0 ? 'coin coin--win' : 'coin coin--lose'}>
                  {m.coinDelta >= 0 ? '+' : ''}
                  {m.coinDelta} 🍠
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
