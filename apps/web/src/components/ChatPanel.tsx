import { useEffect, useRef, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { getSocket } from '../socket/client';

interface ChatPanelProps {
  /** true = always-visible desktop column; false = mobile drawer */
  embedded: boolean;
}

export function ChatPanel({ embedded }: ChatPanelProps) {
  const chat = useGameStore((s) => s.chat);
  const state = useGameStore((s) => s.state);
  const myId = useGameStore((s) => s.myId);
  const markChatRead = useGameStore((s) => s.markChatRead);
  const setChatOpen = useGameStore((s) => s.setChatOpen);
  const [text, setText] = useState('');
  const listRef = useRef<HTMLUListElement>(null);

  // the desktop column is always on screen: messages are "read" as they arrive
  useEffect(() => {
    if (embedded) markChatRead();
  }, [chat.length, embedded, markChatRead]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat.length]);

  const send = () => {
    const t = text.trim();
    if (!t) return;
    getSocket().emit('chat:send', { text: t.slice(0, 200) });
    setText('');
  };

  return (
    <div className="flex h-full min-h-0 flex-col rounded-2xl bg-stone-800 shadow">
      <div className="flex items-center justify-between border-b border-stone-700 px-4 py-2">
        <p className="text-xs font-bold uppercase tracking-widest text-stone-400">Chat</p>
        {!embedded && (
          <button
            onClick={() => setChatOpen(false)}
            className="rounded px-1.5 text-stone-300 hover:bg-stone-700"
            title="close"
          >
            ×
          </button>
        )}
      </div>
      <ul ref={listRef} className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-3 text-sm">
        {chat.length === 0 && <li className="text-stone-500">no messages yet — say hi!</li>}
        {chat.map((m, i) => {
          const mine = state?.players[m.playerIdx]?.id === myId;
          return (
            <li key={`${m.ts}-${i}`} className="break-words leading-snug">
              <span className={`font-bold ${mine ? 'text-amber-300' : 'text-sky-300'}`}>
                {m.name}:{' '}
              </span>
              <span className="text-stone-200">{m.text}</span>
            </li>
          );
        })}
      </ul>
      <form
        className="flex gap-2 border-t border-stone-700 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, 200))}
          placeholder="message…"
          className="min-w-0 flex-1 rounded-lg bg-stone-900 px-3 py-2 text-sm outline-none ring-amber-300 focus:ring-2"
        />
        <button
          type="submit"
          disabled={!text.trim()}
          className="rounded-lg bg-amber-400 px-3 py-2 text-sm font-black text-stone-900 hover:bg-amber-300 disabled:opacity-40"
        >
          Send
        </button>
      </form>
    </div>
  );
}
