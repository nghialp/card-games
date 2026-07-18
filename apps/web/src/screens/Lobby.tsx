import { useEffect, useState } from 'react';
import type { GameType } from '@card-games/types';
import { gameName } from '../games';
import { useGame } from '../store/game';
import { useAuth } from '../store/auth';

const BETS = [0, 10, 50, 100];

interface Props {
  gameType: GameType;
  onBack: () => void;
}

export function Lobby({ gameType, onBack }: Props) {
  const rooms = useGame((s) => s.rooms);
  const listRooms = useGame((s) => s.listRooms);
  const createRoom = useGame((s) => s.createRoom);
  const joinById = useGame((s) => s.joinById);
  const quickJoin = useGame((s) => s.quickJoin);
  const user = useAuth((s) => s.user);
  const balance = useAuth((s) => s.balance);
  const [bet, setBet] = useState(10);
  const [roomId, setRoomId] = useState('');

  // tự làm mới danh sách bàn mỗi 3s khi ở trong sảnh
  useEffect(() => {
    void listRooms(gameType);
    const id = setInterval(() => void listRooms(gameType), 3000);
    return () => clearInterval(id);
  }, [gameType, listRooms]);

  const joinByNumber = (e: React.FormEvent) => {
    e.preventDefault();
    if (roomId.trim()) void joinById(roomId.trim());
  };

  return (
    <div className="page">
      <header className="page__header">
        <button className="btn btn--ghost" onClick={onBack}>
          ← Trang chủ
        </button>
        <h2>Sảnh {gameName(gameType)}</h2>
        {user ? (
          <span className="balance balance--chip">
            🍠 {balance.toLocaleString('vi-VN')}
          </span>
        ) : (
          <span />
        )}
      </header>

      <div className="page__body">
        <div className="lobby-actions">
          <div className="lobby-bets">
            <span className="lobby-bets__label">Mức cược:</span>
            {BETS.map((b) => (
              <button
                key={b}
                className={`bet ${bet === b ? 'bet--active' : ''}`}
                onClick={() => setBet(b)}
              >
                {b === 0 ? 'Vui' : `${b} 🍠`}
              </button>
            ))}
          </div>
          <div className="lobby-actions__buttons">
            <button className="btn btn--primary" onClick={() => void createRoom(gameType, bet)}>
              ➕ Tạo phòng
            </button>
            <button className="btn" onClick={() => void quickJoin(bet)}>
              ⚡ Vào nhanh
            </button>
          </div>
          <form className="lobby-join-id" onSubmit={joinByNumber}>
            <input
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              placeholder="Nhập số phòng…"
              maxLength={8}
            />
            <button className="btn" type="submit" disabled={!roomId.trim()}>
              Vào
            </button>
          </form>
        </div>

        <div className="section-title">
          Bàn còn chỗ ({rooms.length})
        </div>
        {rooms.length === 0 && (
          <div className="empty-note">
            Chưa có bàn nào — tạo phòng mới để bắt đầu!
          </div>
        )}
        <div className="table-list">
          {rooms.map((r) => (
            <button
              key={r.id}
              className="table-row"
              onClick={() => void joinById(r.id)}
            >
              <div className="table-row__main">
                <span className="table-row__id">#{r.id}</span>
                <span className="table-row__bet">
                  {r.betAmount === 0 ? 'Chơi vui' : `Cược ${r.betAmount} 🍠`}
                </span>
              </div>
              <div className="table-row__seats">
                <span className="table-row__count">
                  {r.playerCount}/{r.maxPlayers}
                </span>
                <span className="table-row__dots">
                  {Array.from({ length: r.maxPlayers }, (_, i) => (
                    <span
                      key={i}
                      className={`seat-dot ${i < r.playerCount ? 'seat-dot--filled' : ''}`}
                    />
                  ))}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
