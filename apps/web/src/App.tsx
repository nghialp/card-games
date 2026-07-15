import { useState } from 'react';
import { useGame } from './store/game';
import { Home } from './screens/Home';
import { Login } from './screens/Login';
import { Register } from './screens/Register';
import { Room } from './screens/Room';

type Screen = 'home' | 'login' | 'register';

export default function App() {
  const room = useGame((s) => s.room);
  const error = useGame((s) => s.error);
  const clearError = useGame((s) => s.clearError);
  const [screen, setScreen] = useState<Screen>('home');

  const content = room ? (
    <Room />
  ) : screen === 'login' ? (
    <Login onDone={() => setScreen('home')} onRegister={() => setScreen('register')} />
  ) : screen === 'register' ? (
    <Register onDone={() => setScreen('home')} onLogin={() => setScreen('login')} />
  ) : (
    <Home onLogin={() => setScreen('login')} onRegister={() => setScreen('register')} />
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
