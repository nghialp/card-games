import { useEffect, useState } from 'react';

export function TurnTimer({ endsAt }: { endsAt: number }) {
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    const tick = () => setRemaining(Math.max(0, endsAt - Date.now()));
    tick();
    const id = setInterval(tick, 100);
    return () => clearInterval(id);
  }, [endsAt]);

  const seconds = Math.ceil(remaining / 1000);
  return (
    <div className={`turn-timer ${seconds <= 5 ? 'turn-timer--urgent' : ''}`}>
      ⏱ {seconds}s
    </div>
  );
}
