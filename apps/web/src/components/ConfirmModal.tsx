import { useEffect } from 'react';
import { useGameStore } from '../store/gameStore';

/**
 * The in-app replacement for window.confirm: one pending question lives in
 * the store (`ask()`), this dialog renders it. Enter confirms, Escape or a
 * backdrop click cancels, and every key is swallowed while it is open so
 * nothing leaks into the board behind it.
 */
export function ConfirmModal() {
  const req = useGameStore((s) => s.confirmReq);
  const resolveConfirm = useGameStore((s) => s.resolveConfirm);

  useEffect(() => {
    if (!req) return;
    const onKey = (e: KeyboardEvent) => {
      // the dialog is modal: no keyboard input reaches the game behind it
      e.stopPropagation();
      if (e.key === 'Escape') {
        e.preventDefault();
        resolveConfirm(false);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        resolveConfirm(true);
      }
    };
    window.addEventListener('keydown', onKey, true); // capture: beats the board's handler
    return () => window.removeEventListener('keydown', onKey, true);
  }, [req?.id, resolveConfirm]);

  if (!req) return null;

  const confirmCls =
    req.tone === 'danger'
      ? 'bg-red-500 text-white hover:bg-red-400'
      : 'bg-amber-400 text-stone-900 hover:bg-amber-300';

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label={req.title}
      className="backdrop-in fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4"
      onClick={() => resolveConfirm(false)}
    >
      <div
        className="modal-in w-full max-w-sm rounded-2xl bg-stone-800 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-black leading-snug">{req.title}</h2>
        {req.body && <p className="mt-2 text-sm text-stone-400">{req.body}</p>}
        <div className="mt-5 flex gap-2">
          <button
            onClick={() => resolveConfirm(false)}
            className="press flex-1 rounded-lg bg-stone-700 py-3 font-bold hover:bg-stone-600"
          >
            {req.cancelLabel}
          </button>
          <button
            onClick={() => resolveConfirm(true)}
            className={`press flex-1 rounded-lg py-3 font-black ${confirmCls}`}
          >
            {req.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
