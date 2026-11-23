import { useEffect } from 'react';
import { useGameStore } from './store/gameStore';
import { getSocket } from './socket/client';
import { Home } from './screens/Home';
import { Lobby } from './screens/Lobby';
import { Game } from './screens/Game';
import { GameOver } from './screens/GameOver';
import { Toasts } from './components/Toasts';

export function App() {
  const code = useGameStore((s) => s.code);
  const state = useGameStore((s) => s.state);
  const connected = useGameStore((s) => s.connected);

  useEffect(() => {
    getSocket();
  }, []);

  if (!code || !state) {
    return (
      <>
        <Home />
        <Toasts />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-stone-900 text-stone-100">
      {state.status === 'lobby' ? <Lobby /> : <Game />}
      {state.status === 'ended' && <GameOver />}
      <Toasts />
      {!connected && (
        <div className="fixed left-1/2 top-2 z-40 -translate-x-1/2 rounded bg-red-600 px-3 py-1 text-sm font-bold">
          disconnected — reconnecting…
        </div>
      )}
    </div>
  );
}
