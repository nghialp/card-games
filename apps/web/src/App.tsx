import { useState } from 'react';
import type { GameType } from '@card-games/types';
import { useGame } from './store/game';
import { GamesHub } from './screens/GamesHub';
import { Leaderboard } from './screens/Leaderboard';
import { Lobby } from './screens/Lobby';
import { Login } from './screens/Login';
import { Profile } from './screens/Profile';
import { Register } from './screens/Register';
import { Room } from './screens/Room';
import { Shop } from './screens/Shop';

type Screen = 'hub' | 'lobby' | 'login' | 'register' | 'profile' | 'leaderboard' | 'shop';

export default function App() {
  const room = useGame((s) => s.room);
  const error = useGame((s) => s.error);
  const clearError = useGame((s) => s.clearError);
  const [screen, setScreen] = useState<Screen>('hub');
  const [lobbyGame, setLobbyGame] = useState<GameType>('tienlen');
  const goHub = () => setScreen('hub');

  const content = room ? (
    <Room />
  ) : screen === 'login' ? (
    <Login onDone={goHub} onRegister={() => setScreen('register')} />
  ) : screen === 'register' ? (
    <Register onDone={goHub} onLogin={() => setScreen('login')} />
  ) : screen === 'profile' ? (
    <Profile onBack={goHub} />
  ) : screen === 'leaderboard' ? (
    <Leaderboard onBack={goHub} />
  ) : screen === 'shop' ? (
    <Shop onBack={goHub} />
  ) : screen === 'lobby' ? (
    <Lobby gameType={lobbyGame} onBack={goHub} />
  ) : (
    <GamesHub
      onEnterLobby={(g) => {
        setLobbyGame(g);
        setScreen('lobby');
      }}
      onLogin={() => setScreen('login')}
      onRegister={() => setScreen('register')}
      onProfile={() => setScreen('profile')}
      onLeaderboard={() => setScreen('leaderboard')}
      onShop={() => setScreen('shop')}
    />
  );

  return (
    <>
      {content}
      {error && (
        <div className="toast" onClick={clearError}>
          ⚠️ {error}
        </div>
      )}
    </>
  );
}
