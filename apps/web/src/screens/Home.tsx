import { useState } from 'react';
import { useGame } from '../store/game';

const BETS = [0, 10, 50, 100];

export function Home() {
  const displayName = useGame((s) => s.displayName);
  const connected = useGame((s) => s.connected);
  const connect = useGame((s) => s.connect);
  const quickJoin = useGame((s) => s.quickJoin);
  const [name, setName] = useState(displayName);
  const [bet, setBet] = useState(10);

  const play = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (!connected) connect(name.trim());
    // đợi socket nối xong rồi vào phòng
    setTimeout(() => void quickJoin(bet), connected ? 0 : 300);
  };

  return (
    <div className="home">
      <h1>
        🃏 Tiến Lên<span> Miền Nam</span>
      </h1>
      <form className="home__form" onSubmit={play}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Tên hiển thị"
          maxLength={20}
          autoFocus
        />
        <div className="home__bets">
          {BETS.map((b) => (
            <button
              type="button"
              key={b}
              className={`bet ${bet === b ? 'bet--active' : ''}`}
              onClick={() => setBet(b)}
            >
              {b === 0 ? 'Chơi vui' : `${b} 🪙`}
            </button>
          ))}
        </div>
        <button type="submit" className="btn btn--primary btn--big" disabled={!name.trim()}>
          Chơi ngay
        </button>
      </form>
    </div>
  );
}
