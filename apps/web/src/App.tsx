import { useState } from 'react';
import { useGame } from './store/game';
import { Home } from './screens/Home';
import { Leaderboard } from './screens/Leaderboard';
import { Login } from './screens/Login';
import { Profile } from './screens/Profile';
import { Register } from './screens/Register';
import { Room } from './screens/Room';
import { Shop } from './screens/Shop';

type Screen = 'home' | 'login' | 'register' | 'profile' | 'leaderboard' | 'shop';

export default function App() {
  const room = useGame((s) => s.room);
  const error = useGame((s) => s.error);
  const clearError = useGame((s) => s.clearError);
  const [screen, setScreen] = useState<Screen>('home');
  const goHome = () => setScreen('home');

  const content = room ? (
    <Room />
  ) : screen === 'login' ? (
    <Login onDone={goHome} onRegister={() => setScreen('register')} />
  ) : screen === 'register' ? (
    <Register onDone={goHome} onLogin={() => setScreen('login')} />
  ) : screen === 'profile' ? (
    <Profile onBack={goHome} />
  ) : screen === 'leaderboard' ? (
    <Leaderboard onBack={goHome} />
  ) : screen === 'shop' ? (
    <Shop onBack={goHome} />
  ) : (
    <Home
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
