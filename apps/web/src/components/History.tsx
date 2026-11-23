import type { MoveRecordPublic } from '@scrabble/engine';
import { useGameStore } from '../store/gameStore';

function describe(record: MoveRecordPublic, name: string): string {
  switch (record.kind) {
    case 'move':
      return `${name} played ${(record.words ?? []).map((w) => w.text).join(' + ')} +${record.points ?? 0}`;
    case 'exchange':
      return `${name} exchanged ${record.note ?? 'tiles'}`;
    case 'pass':
      return `${name} passed`;
    case 'resign':
      return `${name} resigned`;
    case 'skip':
      return `${name} lost their turn (failed challenge)`;
    case 'challenge':
      return record.note === 'success'
        ? `${name} challenged — SUCCESS: ${(record.invalidWords ?? []).join(', ')} not in the dictionary`
        : `${name} challenged — FAILED (all words valid)`;
    default:
      return `${name} did something`;
  }
}

export function History() {
  const state = useGameStore((s) => s.state)!;
  const records = [...state.history].slice(-15).reverse();

  return (
    <div className="rounded-2xl bg-stone-800 p-4 shadow">
      <p className="text-xs font-bold uppercase tracking-widest text-stone-400">History</p>
      <ul className="mt-2 space-y-1 text-sm text-stone-300">
        {records.length === 0 && <li className="text-stone-500">no moves yet</li>}
        {records.map((r) => {
          const challengeable = !!state.challenge?.open && r.seq === state.challenge.moveSeq;
          return (
            <li key={r.seq} className={`flex gap-2 ${challengeable ? 'text-amber-300' : ''}`}>
              <span className="text-stone-500">{r.seq}.</span>
              <span className="truncate">
                {describe(r, state.players[r.playerIdx]?.name ?? '?')}
                {challengeable && <span className="ml-1 font-bold">!</span>}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
