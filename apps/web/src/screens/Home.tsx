import { useEffect, useState } from 'react';
import { RewardsBar } from '../components/RewardsBar';
import { useGame } from '../store/game';
import { getAccessToken, useAuth } from '../store/auth';

const BETS = [0, 10, 50, 100];

interface Props {
  onLogin: () => void;
  onRegister: () => void;
  onProfile: () => void;
  onLeaderboard: () => void;
  onShop: () => void;
}

export function Home({ onLogin, onRegister, onProfile, onLeaderboard, onShop }: Props) {
  const displayName = useGame((s) => s.displayName);
  const connected = useGame((s) => s.connected);
  const connect = useGame((s) => s.connect);
  const quickJoin = useGame((s) => s.quickJoin);
  const user = useAuth((s) => s.user);
  const balance = useAuth((s) => s.balance);
  const logout = useAuth((s) => s.logout);
  const loadMe = useAuth((s) => s.loadMe);
  const [name, setName] = useState(displayName);
  const [bet, setBet] = useState(10);

  // khôi phục phiên + số dư mới nhất mỗi lần về trang chủ
  useEffect(() => {
    void loadMe();
  }, [loadMe]);

  const play = (e: React.FormEvent) => {
    e.preventDefault();
    if (user) {
      const token = getAccessToken();
      if (token) connect(user.displayName, { token, userId: user.id });
      else connect(user.displayName);
    } else {
      if (!name.trim()) return;
      connect(name.trim());
    }
    // đợi socket nối xong rồi vào phòng
    setTimeout(() => void quickJoin(bet), connected ? 0 : 300);
  };

  return (
    <div className="home">
      <h1>
        🃏 Tiến Lên<span> Miền Nam</span>
      </h1>

      {user && (
        <div className="account">
          <div className="account__greeting">
            Xin chào, <strong>{user.displayName}</strong>
            <button type="button" className="link" onClick={onProfile}>
              Hồ sơ
            </button>
            <button type="button" className="link" onClick={logout}>
              Đăng xuất
            </button>
          </div>
          <div className="balance">
            <span className="balance__icon">🍠</span>
            <span className="balance__amount">{balance.toLocaleString('vi-VN')}</span>
            <span className="balance__unit">củ</span>
          </div>
          <RewardsBar onShop={onShop} />
        </div>
      )}

      <form className="home__form" onSubmit={play}>
        {!user && (
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Tên hiển thị (chơi thử không cần tài khoản)"
            maxLength={20}
            autoFocus
          />
        )}
        <div className="home__bets">
          {BETS.map((b) => (
            <button
              type="button"
              key={b}
              className={`bet ${bet === b ? 'bet--active' : ''}`}
              onClick={() => setBet(b)}
            >
              {b === 0 ? 'Chơi vui' : `${b} 🍠`}
            </button>
          ))}
        </div>
        <button
          type="submit"
          className="btn btn--primary btn--big"
          disabled={!user && !name.trim()}
        >
          Chơi ngay
        </button>
        {!user && (
          <div className="auth-links">
            <button type="button" className="link" onClick={onLogin}>
              Đăng nhập
            </button>
            <button type="button" className="link" onClick={onRegister}>
              Đăng ký nhận 🍠 1.000 củ
            </button>
          </div>
        )}
        <div className="auth-links">
          <button type="button" className="link" onClick={onLeaderboard}>
            🏆 BXH tuần
          </button>
        </div>
      </form>
    </div>
  );
}
