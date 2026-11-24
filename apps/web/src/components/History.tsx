import type { MoveRecordPublic } from '@scrabble/engine';
import { useGameStore } from '../store/gameStore';

const ICON: Record<MoveRecordPublic['kind'], string> = {
  move: '▸',
  exchange: '⇄',
  pass: '↷',
  resign: '✕',
  kick: '🚪',
  skip: '⤼',
  challenge: '⚔',
  timeout: '⏱',
};

const TONE: Record<MoveRecordPublic['kind'], string> = {
  move: 'text-stone-200',
  exchange: 'text-sky-300',
  pass: 'text-stone-400',
  resign: 'text-stone-500',
  kick: 'text-red-300',
  skip: 'text-orange-300',
  challenge: 'text-red-300',
  timeout: 'text-orange-300',
};

function describe(record: MoveRecordPublic, name: string): string {
  switch (record.kind) {
    case 'move':
      return `${name} played ${(record.words ?? []).map((w) => w.text).join(' + ')} for +${record.points ?? 0}`;
    case 'exchange':
      return `${name} exchanged ${record.note ?? 'tiles'}`;
    case 'pass':
      return `${name} passed`;
    case 'resign':
      return `${name} resigned`;
    case 'kick':
      return `${name} was kicked out by vote`;
    case 'skip':
      return `${name} lost their turn (failed challenge)`;
    case 'timeout':
      return record.note === 'offline'
        ? `${name} was offline — turn skipped by vote`
        : `${name}'s turn timed out — skipped by vote`;
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
  // newest at the top, capped at the last 50 records
  const records = [...state.history].slice(-50).reverse();

  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-2xl bg-stone-800 p-4 shadow">
      <p className="shrink-0 text-xs font-bold uppercase tracking-widest text-stone-400">History</p>
      <ul className="mt-2 min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1 text-sm max-h-72 lg:max-h-none">
        {records.length === 0 && <li className="text-stone-500">no moves yet</li>}
        {records.map((r) => {
          const challengeable = !!state.challenge?.open && r.seq === state.challenge.moveSeq;
          return (
            <li
              key={r.seq}
              title={`move #${r.seq}`}
              className={`flex items-start gap-2 ${challengeable ? 'text-amber-300' : TONE[r.kind]}`}
            >
              <span className="shrink-0 opacity-80">{ICON[r.kind]}</span>
              <span className="whitespace-normal break-words">
                {describe(r, state.players[r.playerIdx]?.name ?? '?')}
                {challengeable && <span className="ml-1 font-bold">· challengeable</span>}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
