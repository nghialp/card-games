import { useEffect, useState } from 'react';
import { useAuth } from '../store/auth';
import { useTusac } from '../store/tusac';

const BETS = [0, 10, 50, 100];

export function TuSacLobby({ onBack }: { onBack: () => void }) {
  const rooms = useTusac((s) => s.rooms);
  const wire = useTusac((s) => s.wire);
  const list = useTusac((s) => s.list);
  const create = useTusac((s) => s.create);
  const join = useTusac((s) => s.join);
  const user = useAuth((s) => s.user);
  const balance = useAuth((s) => s.balance);
  const [bet, setBet] = useState(10);
  const [roomId, setRoomId] = useState('');

  useEffect(() => {
    wire();
    void list();
    const id = setInterval(() => void list(), 3000);
    return () => clearInterval(id);
  }, [wire, list]);

  const joinByNumber = (e: React.FormEvent) => {
    e.preventDefault();
    if (roomId.trim()) void join(roomId.trim());
  };

  return (
    <div className="page">
      <header className="page__header">
        <button className="btn btn--ghost" onClick={onBack}>
          ← Trang chủ
        </button>
        <h2>Sảnh Tứ Sắc</h2>
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
            <button className="btn btn--primary" onClick={() => void create(bet)}>
              ➕ Tạo phòng
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

        <div className="section-title">Bàn còn chỗ ({rooms.length})</div>
        {rooms.length === 0 && (
          <div className="empty-note">Chưa có bàn nào — tạo phòng mới để bắt đầu!</div>
        )}
        <div className="table-list">
          {rooms.map((r) => (
            <button key={r.id} className="table-row" onClick={() => void join(r.id)}>
              <div className="table-row__main">
                <span className="table-row__id">#{r.id}</span>
                <span className="table-row__bet">
                  {r.betAmount === 0 ? 'Chơi vui' : `Cược ${r.betAmount} 🍠`}
                </span>
              </div>
              <div className="table-row__seats">
                <span className="table-row__count">
                  {r.players.length}/{r.maxPlayers}
                </span>
                <span className="table-row__dots">
                  {Array.from({ length: r.maxPlayers }, (_, i) => (
                    <span
                      key={i}
                      className={`seat-dot ${i < r.players.length ? 'seat-dot--filled' : ''}`}
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
