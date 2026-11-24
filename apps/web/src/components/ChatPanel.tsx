import { useEffect, useRef, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { getSocket } from '../socket/client';

interface ChatPanelProps {
  /** true = always-visible desktop column; false = mobile drawer */
  embedded: boolean;
}

interface WordCheckAck {
  ok?: boolean;
  valid?: boolean;
  reason?: string;
}

interface WordResult {
  word: string;
  valid: boolean;
}

export function ChatPanel({ embedded }: ChatPanelProps) {
  const chat = useGameStore((s) => s.chat);
  const state = useGameStore((s) => s.state);
  const myId = useGameStore((s) => s.myId);
  const markChatRead = useGameStore((s) => s.markChatRead);
  const setChatOpen = useGameStore((s) => s.setChatOpen);
  const [tab, setTab] = useState<'chat' | 'words'>('chat');
  const [text, setText] = useState('');
  const listRef = useRef<HTMLUListElement>(null);

  const [word, setWord] = useState('');
  const [wordBusy, setWordBusy] = useState(false);
  const [wordResult, setWordResult] = useState<WordResult | null>(null);

  // the desktop column is always on screen: messages are "read" as they arrive
  // (only while the chat tab is actually showing)
  useEffect(() => {
    if (embedded && tab === 'chat') markChatRead();
  }, [chat.length, embedded, tab, markChatRead]);

  useEffect(() => {
    if (tab !== 'chat') return;
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat.length, tab]);

  const send = () => {
    const t = text.trim();
    if (!t) return;
    getSocket().emit('chat:send', { text: t.slice(0, 200) });
    setText('');
  };

  const checkWord = () => {
    const w = word.trim().toUpperCase().replace(/[^A-Z]/g, '').slice(0, 20);
    if (!w || wordBusy) return;
    setWord(w);
    setWordBusy(true);
    getSocket().emit('word:check', { word: w }, (res: WordCheckAck) => {
      setWordBusy(false);
      if (res?.ok) setWordResult({ word: w, valid: !!res.valid });
    });
  };

  const tabBtn = (which: 'chat' | 'words', label: string) => (
    <button
      onClick={() => setTab(which)}
      className={`rounded px-2 py-1 transition ${
        tab === which
          ? 'bg-stone-900 text-amber-300'
          : 'text-stone-400 hover:bg-stone-900 hover:text-stone-200'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex h-full min-h-0 flex-col rounded-2xl bg-stone-800 shadow">
      <div className="flex items-center justify-between border-b border-stone-700 px-2 py-1.5">
        <div className="flex gap-1 text-xs font-bold uppercase tracking-widest">
          {tabBtn('chat', '💬 Chat')}
          {tabBtn('words', '📖 Word check')}
        </div>
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

      {tab === 'chat' ? (
        <>
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
              className="input min-w-0 flex-1 px-3 py-2 text-sm"
            />
            <button
              type="submit"
              disabled={!text.trim()}
              className="rounded-lg bg-amber-400 px-3 py-2 text-sm font-black text-stone-900 hover:bg-amber-300 disabled:opacity-40"
            >
              Send
            </button>
          </form>
        </>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col p-3">
          <p className="text-xs text-stone-400">is that word playable? ask the dictionary.</p>
          <form
            className="mt-2 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              checkWord();
            }}
          >
            <input
              value={word}
              onChange={(e) => setWord(e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 20))}
              placeholder="QUIXOTIC…"
              className="input min-w-0 flex-1 px-3 py-2 text-center font-black tracking-widest"
            />
            <button
              type="submit"
              disabled={!word || wordBusy}
              className="rounded-lg bg-amber-400 px-3 py-2 text-sm font-black text-stone-900 hover:bg-amber-300 disabled:opacity-40"
            >
              {wordBusy ? '…' : 'Check'}
            </button>
          </form>

          {wordResult && (
            <div
              className={`mt-4 rounded-xl p-4 text-center ${
                wordResult.valid ? 'bg-emerald-900/40 text-emerald-300' : 'bg-red-900/40 text-red-300'
              }`}
            >
              <p className="break-all text-2xl font-black tracking-widest">{wordResult.word}</p>
              <p className="mt-1 text-sm font-bold uppercase tracking-wider">
                {wordResult.valid ? '✓ valid word' : '✗ not in the dictionary'}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
