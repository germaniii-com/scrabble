import { useGameStore } from '../store/gameStore';

export function Toasts() {
  const toasts = useGameStore((s) => s.toasts);
  const dismissToast = useGameStore((s) => s.dismissToast);

  return (
    <div className="fixed bottom-4 left-1/2 z-40 flex w-full max-w-md -translate-x-1/2 flex-col gap-2 px-4">
      {toasts.map((t) => (
        <button
          key={t.id}
          onClick={() => dismissToast(t.id)}
          className={`rounded-lg px-4 py-2 text-left text-sm font-bold text-white shadow-lg ${
            t.tone === 'good' ? 'bg-emerald-600' : t.tone === 'bad' ? 'bg-red-600' : 'bg-stone-700'
          }`}
        >
          {t.text}
        </button>
      ))}
    </div>
  );
}
