import { useGameStore, TOAST_MS } from '../store/gameStore';

export function Toasts() {
  const toasts = useGameStore((s) => s.toasts);
  const dismissToast = useGameStore((s) => s.dismissToast);

  return (
    <div className="fixed bottom-4 left-4 z-40 flex max-w-[calc(100vw-2rem)] flex-col gap-2">
      {toasts.map((t) => (
        <button
          key={t.id}
          onClick={() => dismissToast(t.id)}
          style={{ animationDuration: `${TOAST_MS}ms` }}
          className={`toast-life rounded-lg px-4 py-2 text-left text-sm font-bold text-white shadow-lg ${
            t.tone === 'good' ? 'bg-emerald-600' : t.tone === 'bad' ? 'bg-red-600' : 'bg-stone-700'
          }`}
        >
          {t.text}
        </button>
      ))}
    </div>
  );
}
