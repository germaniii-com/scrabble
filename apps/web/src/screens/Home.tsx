import { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { getSocket } from '../socket/client';
import { loadName, saveName } from '../storage';

interface AckResponse {
  ok?: boolean;
  code?: string;
  token?: string;
  playerId?: string;
  reason?: string;
}

export function Home() {
  const setIdentity = useGameStore((s) => s.setIdentity);
  const toast = useGameStore((s) => s.toast);
  const connected = useGameStore((s) => s.connected);
  const [name, setName] = useState(loadName());
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const go = (event: 'game:create' | 'game:join', payload: Record<string, unknown>) => {
    const clean = name.trim().slice(0, 20);
    if (!clean) {
      toast('enter your name first', 'bad');
      return;
    }
    setBusy(true);
    saveName(clean);
    getSocket().emit(event, { ...payload, name: clean }, (res: AckResponse) => {
      setBusy(false);
      if (res?.ok && res.code && res.token && res.playerId) {
        setIdentity(res.code, res.token, res.playerId);
        if (event === 'game:create') {
          toast(`room ${res.code} created — share the code!`, 'good');
        }
      } else {
        toast(res?.reason ?? 'could not join', 'bad');
      }
    });
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-stone-900 p-4 text-stone-100">
      <h1 className="text-4xl font-black tracking-tight">
        {'SCRABBLE'.split('').map((ch, i) => (
          <span
            key={i}
            className={`mx-0.5 inline-block rounded px-2 py-1 text-stone-900 ${
              i % 2 === 0 ? 'bg-amber-200' : 'bg-amber-400'
            }`}
          >
            {ch}
          </span>
        ))}
      </h1>
      <p className="text-sm text-stone-400">
        2–6 players · online · challenge rules{connected ? '' : ' · connecting…'}
      </p>

      <div className="w-full max-w-sm space-y-5 rounded-2xl bg-stone-800 p-6 shadow-xl">
        <label className="block space-y-1">
          <span className="text-xs font-bold uppercase text-stone-400">Your name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Carol"
            maxLength={20}
            className="w-full rounded-lg bg-stone-900 px-3 py-2 text-lg outline-none ring-amber-300 focus:ring-2"
          />
        </label>

        <button
          disabled={busy}
          onClick={() => go('game:create', {})}
          className="w-full rounded-lg bg-amber-400 py-3 font-black text-stone-900 transition hover:bg-amber-300 disabled:opacity-50"
        >
          + Create new game
        </button>

        <div className="flex items-center gap-2 text-xs text-stone-500">
          <div className="h-px flex-1 bg-stone-700" /> or <div className="h-px flex-1 bg-stone-700" />
        </div>

        <div className="space-y-3">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4))}
            placeholder="ROOM CODE"
            className="w-full rounded-lg bg-stone-900 px-3 py-2 text-center text-2xl font-black tracking-[0.3em] outline-none ring-amber-300 focus:ring-2"
          />
          <button
            disabled={busy || code.length < 4}
            onClick={() => go('game:join', { code })}
            className="w-full rounded-lg bg-stone-700 py-3 font-bold transition hover:bg-stone-600 disabled:opacity-50"
          >
            → Join game
          </button>
        </div>
      </div>
    </div>
  );
}
