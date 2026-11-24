import { useGameStore } from '../store/gameStore';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

export function BlankPicker() {
  const blankPicker = useGameStore((s) => s.blankPicker);
  const chooseBlank = useGameStore((s) => s.chooseBlank);
  const cancelBlank = useGameStore((s) => s.cancelBlank);

  if (!blankPicker) return null;

  return (
    <div className="backdrop-in fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="modal-in w-full max-w-md rounded-2xl bg-stone-800 p-6 shadow-2xl">
        <h2 className="text-lg font-black">Choose a letter for the blank</h2>
        <p className="mt-1 text-sm text-stone-400">it will score 0 points, no matter where it lands</p>
        <div className="mt-4 grid grid-cols-7 gap-2">
          {LETTERS.map((letter, i) => (
            <button
              key={letter}
              onClick={() => chooseBlank(letter)}
              style={{ animationDelay: `${i * 15}ms` }}
              className="pop-in rounded-md bg-gradient-to-b from-amber-100 to-amber-300 py-2 font-extrabold text-stone-900 hover:brightness-110"
            >
              {letter}
            </button>
          ))}
        </div>
        <button
          onClick={cancelBlank}
          className="press mt-4 w-full rounded-lg bg-stone-700 py-2 font-bold hover:bg-stone-600"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
