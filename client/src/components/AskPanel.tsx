import React, { useState } from 'react';
import { askJobQuestion } from '../api/llmApi';

interface AskPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

const EXAMPLE_QUESTIONS = [
  "What's blocking us this week?",
  'Which jobs are at risk of missing their ship date?',
  'Summarize the status of jobs for Rivian.',
];

const AskPanel: React.FC<AskPanelProps> = ({ isOpen, onClose }) => {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleAsk = async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    setAnswer(null);
    try {
      const result = await askJobQuestion(trimmed);
      setAnswer(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} aria-hidden />
      <aside className="fixed right-0 top-0 h-full w-full max-w-xl z-50 bg-[#13171f] border-l border-slate-800 shadow-2xl flex flex-col">
        <header className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
          <div>
            <h2 className="text-sm font-semibold text-slate-100">Ask about jobs</h2>
            <p className="text-[11px] text-slate-500">
              Answered by a local LLM on the internal network — no data leaves the LAN
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-500 hover:text-slate-200 text-xl leading-none px-2"
            aria-label="Close"
          >
            ×
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleAsk(question);
            }}
            className="flex flex-col gap-2"
          >
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="e.g. What's blocking us this week?"
              rows={3}
              className="w-full rounded bg-slate-900 border border-slate-700 text-slate-100 text-sm p-2 focus:outline-none focus:ring-1 focus:ring-slate-500"
            />
            <button
              type="submit"
              disabled={busy || !question.trim()}
              className="self-end px-3 py-1.5 text-xs rounded font-medium bg-slate-700 text-white hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {busy ? 'Asking…' : 'Ask'}
            </button>
          </form>

          {!answer && !error && !busy && (
            <div className="flex flex-col gap-1.5">
              <p className="text-[11px] text-slate-500">Try:</p>
              {EXAMPLE_QUESTIONS.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => {
                    setQuestion(q);
                    void handleAsk(q);
                  }}
                  className="text-left text-xs text-slate-400 hover:text-slate-200 px-2 py-1 rounded hover:bg-slate-800"
                >
                  {q}
                </button>
              ))}
            </div>
          )}

          {busy && <p className="text-xs text-slate-500">Thinking…</p>}

          {error && (
            <div className="text-xs text-red-400 bg-red-950/40 border border-red-900 rounded p-2">
              {error}
            </div>
          )}

          {answer && (
            <div className="text-sm text-slate-200 bg-slate-900 border border-slate-800 rounded p-3 whitespace-pre-wrap">
              {answer}
            </div>
          )}
        </div>
      </aside>
    </>
  );
};

export default AskPanel;
