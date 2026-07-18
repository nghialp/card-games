import { useEffect, useState } from 'react';
import type { GameType } from '@card-games/types';
import { RewardsBar } from '../components/RewardsBar';
import { GAMES } from '../games';
import { useGame } from '../store/game';
import { getAccessToken, useAuth } from '../store/auth';

interface Props {
  onEnterLobby: (gameType: GameType) => void;
  onLogin: () => void;
  onRegister: () => void;
  onProfile: () => void;
  onLeaderboard: () => void;
  onShop: () => void;
}

export function GamesHub({
  onEnterLobby,
  onLogin,
  onRegister,
  onProfile,
  onLeaderboard,
  onShop,
}: Props) {
  const displayName = useGame((s) => s.displayName);
  const connect = useGame((s) => s.connect);
  const user = useAuth((s) => s.user);
  const balance = useAuth((s) => s.balance);
  const logout = useAuth((s) => s.logout);
  const loadMe = useAuth((s) => s.loadMe);
  const [name, setName] = useState(displayName);
  const [nameError, setNameError] = useState(false);

  // khôi phục phiên + số dư mới nhất mỗi lần về trang chủ
  useEffect(() => {
    void loadMe();
  }, [loadMe]);

  const enterGame = (gameType: GameType) => {
    if (user) {
      const token = getAccessToken();
      connect(user.displayName, token ? { token, userId: user.id } : undefined);
    } else {
      if (!name.trim()) {
        setNameError(true);
        return;
      }
      connect(name.trim());
    }
    onEnterLobby(gameType);
  };

  return (
    <div className="hub">
      <h1>
        🃏 Card <span>Games</span>
      </h1>

      {user ? (
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
      ) : (
        <div className="account">
          <input
            className="hub__name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setNameError(false);
            }}
            placeholder="Tên hiển thị (chơi thử không cần tài khoản)"
            maxLength={20}
          />
          {nameError && <div className="form-error">Nhập tên để vào chơi</div>}
          <div className="auth-links">
            <button type="button" className="link" onClick={onLogin}>
              Đăng nhập
            </button>
            <button type="button" className="link" onClick={onRegister}>
              Đăng ký nhận 🍠 1.000 củ
            </button>
          </div>
        </div>
      )}

      <div className="section-title hub__heading">Chọn trò chơi</div>
      <div className="games-grid">
        {GAMES.map((g) => (
          <button
            key={g.type}
            className={`game-card ${g.available ? '' : 'game-card--soon'}`}
            disabled={!g.available}
            onClick={() => g.available && enterGame(g.type as GameType)}
          >
            <span className="game-card__emoji">{g.emoji}</span>
            <span className="game-card__name">{g.name}</span>
            <span className="game-card__players">{g.players}</span>
            {!g.available && <span className="game-card__badge">Sắp ra mắt</span>}
          </button>
        ))}
      </div>

      <button type="button" className="link" onClick={onLeaderboard}>
        🏆 BXH tuần
      </button>
    </div>
  );
}
