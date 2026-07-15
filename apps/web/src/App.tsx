import { useGame } from './store/game';
import { Home } from './screens/Home';
import { Room } from './screens/Room';

export default function App() {
  const room = useGame((s) => s.room);
  const error = useGame((s) => s.error);
  const clearError = useGame((s) => s.clearError);

  return (
    <>
      {room ? <Room /> : <Home />}
      {error && (
        <div className="toast" onClick={clearError}>
          ⚠️ {error}
        </div>
      )}
    </>
  );
}
