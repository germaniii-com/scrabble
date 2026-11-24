import type { GameSettings } from '@scrabble/engine';
import { TIMER_PRESETS } from '@scrabble/engine';
import { useGameStore } from '../store/gameStore';
import { getSocket } from '../socket/client';
import { copyText } from '../clipboard';
import { inviteLinkFor } from '../invite';

const CAPACITIES = [2, 3, 4, 5, 6];

function timerLabel(seconds: number | null): string {
  return seconds == null ? 'Off' : `${seconds}s`;
}

export function Lobby() {
  const state = useGameStore((s) => s.state)!;
  const myId = useGameStore((s) => s.myId);
  const toast = useGameStore((s) => s.toast);
  const resetToHome = useGameStore((s) => s.resetToHome);

  const isHost = state.hostId === myId;
  const settings = state.settings;
  const canStart = state.players.length >= 2;
  const iAmReady = state.players.find((p) => p.id === myId)?.ready ?? false;
  // the host seat carries no ready flag — pressing Start is the host's signal
  const guests = state.players.filter((p) => p.id !== state.hostId);
  const allGuestsReady = guests.every((p) => p.ready);
  const readyCount = guests.filter((p) => p.ready).length;

  const update = (patch: Partial<GameSettings>) => {
    getSocket().emit('settings:update', { settings: patch });
  };

  const leave = () => {
    getSocket().emit('game:leave');
    resetToHome();
  };

  const toggleReady = () => {
    getSocket().emit('lobby:ready', { ready: !iAmReady });
  };

  const start = () => {
    if (!allGuestsReady && !window.confirm('Some players are not ready, start anyway?')) return;
    getSocket().emit('game:start');
  };

  const inviteLink = inviteLinkFor(state.code);

  const copyCode = () => {
    copyText(state.code).then((ok) =>
      toast(ok ? 'room code copied!' : 'could not copy', ok ? 'good' : 'bad'),
    );
  };

  const copyInviteLink = () => {
    copyText(inviteLink).then((ok) =>
      toast(ok ? 'invite link copied!' : 'could not copy', ok ? 'good' : 'bad'),
    );
  };

  return (
    <div className="min-h-screen bg-stone-900 p-4 text-stone-100">
      <div className="mx-auto max-w-lg space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-black">Lobby</h1>
          <button
            onClick={leave}
            className="rounded-lg bg-stone-800 px-4 py-2 text-sm font-bold hover:bg-stone-700"
          >
            Leave
          </button>
        </div>

        <div className="rounded-2xl bg-stone-800 p-6 text-center shadow-xl">
          <p className="text-xs font-bold uppercase tracking-widest text-stone-400">Room code</p>
          <button
            onClick={copyCode}
            title="click to copy"
            className="mt-1 text-5xl font-black tracking-[0.25em] text-amber-300 hover:text-amber-200"
          >
            {state.code}
          </button>
          <div className="mt-3 flex justify-center gap-2 text-sm font-bold">
            <button
              onClick={copyCode}
              className="rounded-lg bg-stone-700 px-4 py-2 transition hover:bg-stone-600"
            >
              Copy code
            </button>
            <button
              onClick={copyInviteLink}
              className="rounded-lg bg-amber-400 px-4 py-2 text-stone-900 transition hover:bg-amber-300"
            >
              Copy invite link
            </button>
          </div>
          <p className="mt-3 truncate text-xs text-stone-500" title={inviteLink}>
            {inviteLink}
          </p>
          <p className="mt-1 text-sm text-stone-400">
            share with up to {settings.capacity - 1} friends — the code is prefilled for them
          </p>
        </div>

        {/* ---- game settings ---- */}
        <div className="rounded-2xl bg-stone-800 p-6 shadow-xl">
          <p className="text-xs font-bold uppercase tracking-widest text-stone-400">Game settings</p>
          {isHost ? (
            <div className="mt-3 space-y-3 text-sm">
              <label className="flex items-center justify-between gap-4">
                <span className="font-bold">Seats</span>
                <select
                  value={settings.capacity}
                  onChange={(e) => update({ capacity: Number(e.target.value) })}
                  className="rounded-lg bg-stone-900 px-3 py-1.5 font-bold outline-none ring-amber-300 focus:ring-2"
                >
                  {CAPACITIES.map((c) => (
                    <option key={c} value={c}>
                      {c} players
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center justify-between gap-4">
                <span className="font-bold">
                  Turn timer
                  <span className="ml-1 font-normal text-stone-400">
                    (expiry opens a vote to skip)
                  </span>
                </span>
                <select
                  value={settings.timerSeconds == null ? 'off' : settings.timerSeconds}
                  onChange={(e) =>
                    update({ timerSeconds: e.target.value === 'off' ? null : Number(e.target.value) })
                  }
                  className="rounded-lg bg-stone-900 px-3 py-1.5 font-bold outline-none ring-amber-300 focus:ring-2"
                >
                  {TIMER_PRESETS.map((t) => (
                    <option key={String(t)} value={t == null ? 'off' : t}>
                      {timerLabel(t)}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex items-center justify-between gap-4">
                <span className="font-bold">Word check</span>
                <div className="flex overflow-hidden rounded-lg ring-1 ring-stone-600">
                  <button
                    onClick={() => update({ validationMode: 'challenge' })}
                    className={`px-3 py-1.5 font-bold transition ${
                      settings.validationMode === 'challenge'
                        ? 'bg-amber-400 text-stone-900'
                        : 'bg-stone-900 text-stone-300 hover:bg-stone-700'
                    }`}
                    title="no dictionary check at commit; opponents may challenge (double challenge)"
                  >
                    Challenge
                  </button>
                  <button
                    onClick={() => update({ validationMode: 'validate' })}
                    className={`px-3 py-1.5 font-bold transition ${
                      settings.validationMode === 'validate'
                        ? 'bg-amber-400 text-stone-900'
                        : 'bg-stone-900 text-stone-300 hover:bg-stone-700'
                    }`}
                    title="invalid words are rejected when you play; no challenges"
                  >
                    Validate
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <p className="mt-3 rounded-lg bg-stone-900 px-3 py-2 text-sm text-stone-300">
              {settings.capacity} seats · turn timer {timerLabel(settings.timerSeconds)} ·{' '}
              {settings.validationMode === 'validate' ? 'dictionary-checked' : 'challenge rules'}
            </p>
          )}
        </div>

        <div className="rounded-2xl bg-stone-800 p-6 shadow-xl">
          <p className="text-xs font-bold uppercase tracking-widest text-stone-400">
            Players ({state.players.length}/{settings.capacity})
          </p>
          <ul className="mt-3 space-y-2">
            {state.players.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between rounded-lg bg-stone-900 px-3 py-2"
              >
                <span className="font-bold">
                  {p.id === state.hostId && <span title="host">★ </span>}
                  {p.name}
                  {p.id === myId && <span className="ml-2 text-xs text-stone-400">(you)</span>}
                </span>
                <span className="flex items-center gap-2 text-xs">
                  {p.id !== state.hostId && (
                    <span className={p.ready ? 'text-emerald-400' : 'text-stone-500'}>
                      {p.ready ? '✓ ready' : 'not ready'}
                    </span>
                  )}
                  <span className={p.connected ? 'text-emerald-400' : 'text-red-400'}>
                    {p.connected ? '● connected' : '○ connecting…'}
                  </span>
                </span>
              </li>
            ))}
            {Array.from(
              { length: Math.max(0, settings.capacity - state.players.length) },
              (_, i) => (
                <li
                  key={`seat-${i}`}
                  className="rounded-lg border border-dashed border-stone-700 px-3 py-2 text-sm text-stone-600"
                >
                  — open seat —
                </li>
              ),
            )}
          </ul>
        </div>

        {isHost ? (
          <button
            disabled={!canStart}
            onClick={start}
            className="w-full rounded-xl bg-amber-400 py-4 text-lg font-black text-stone-900 transition hover:bg-amber-300 disabled:opacity-40"
          >
            {canStart
              ? allGuestsReady
                ? `Start game (${state.players.length} players)`
                : `Start game (${readyCount}/${guests.length} ready)`
              : 'Waiting for at least 2 players…'}
          </button>
        ) : (
          <div className="space-y-3">
            <button
              onClick={toggleReady}
              className={`w-full rounded-xl py-4 text-lg font-black text-stone-900 transition ${
                iAmReady ? 'bg-emerald-500 hover:bg-emerald-400' : 'bg-amber-400 hover:bg-amber-300'
              }`}
            >
              {iAmReady ? '✓ Ready' : "I'm ready"}
            </button>
            <p className="rounded-xl bg-stone-800 py-4 text-center text-stone-400">
              waiting for the host to start…
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
