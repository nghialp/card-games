import { useState } from 'react';
import type { GameType } from '@card-games/types';
import { useGame } from './store/game';
import { useTusac } from './store/tusac';
import { GamesHub } from './screens/GamesHub';
import { Leaderboard } from './screens/Leaderboard';
import { Lobby } from './screens/Lobby';
import { Login } from './screens/Login';
import { Profile } from './screens/Profile';
import { Register } from './screens/Register';
import { Room } from './screens/Room';
import { Shop } from './screens/Shop';
import { TuSacLobby } from './screens/TuSacLobby';
import { TuSacRoom } from './screens/TuSacRoom';

type Screen = 'hub' | 'lobby' | 'login' | 'register' | 'profile' | 'leaderboard' | 'shop';

export default function App() {
  const room = useGame((s) => s.room);
  const tusacRoom = useTusac((s) => s.room);
  const error = useGame((s) => s.error);
  const tusacError = useTusac((s) => s.error);
  const clearError = useGame((s) => s.clearError);
  const clearTusacError = useTusac((s) => s.clearError);
  const [screen, setScreen] = useState<Screen>('hub');
  const [lobbyGame, setLobbyGame] = useState<GameType>('tienlen');
  const goHub = () => setScreen('hub');

  const content = room ? (
    <Room />
  ) : tusacRoom ? (
    <TuSacRoom />
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
    lobbyGame === 'tusac' ? (
      <TuSacLobby onBack={goHub} />
    ) : (
      <Lobby gameType={lobbyGame} onBack={goHub} />
    )
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

  const toast = error ?? tusacError;
  return (
    <>
      {content}
      {toast && (
        <div
          className="toast"
          onClick={() => {
            clearError();
            clearTusacError();
          }}
        >
          ⚠️ {toast}
        </div>
      )}
    </>
  );
}
