import { useRef, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Brain, Send, X } from 'lucide-react';
import { useAssistantStore } from '../../stores/assistantStore';
import { ChatMessage } from './ChatMessage';

const QUICK_ACTIONS = [
  { label: 'Suggest tasks', prompt: 'Suggest practical daily tasks for our family today.' },
  { label: 'Help with Iman', prompt: "Help me improve our family's Quran and prayer consistency with small, realistic steps." },
  { label: 'Light day', prompt: "We're tired today. Suggest only very light, gentle tasks." },
  { label: "What's next?", prompt: 'Looking at our goals and tasks, what should we focus on next?' },
];

interface Props {
  open: boolean;
  onClose: () => void;
}

export function AssistantModal({ open, onClose }: Props) {
  const messages = useAssistantStore((s) => s.messages);
  const isLoading = useAssistantStore((s) => s.isLoading);
  const error = useAssistantStore((s) => s.error);
  const familyNotes = useAssistantStore((s) => s.familyNotes);
  const hydrate = useAssistantStore((s) => s.hydrate);
  const removeNote = useAssistantStore((s) => s.removeNote);
  const sendUserMessage = useAssistantStore((s) => s.sendUserMessage);
  const toggleGhostTask = useAssistantStore((s) => s.toggleGhostTask);
  const setGhostTaskDay = useAssistantStore((s) => s.setGhostTaskDay);
  const setGhostTaskMonthDay = useAssistantStore((s) => s.setGhostTaskMonthDay);
  const commitSelectedTasks = useAssistantStore((s) => s.commitSelectedTasks);
  const dismissMessageTasks = useAssistantStore((s) => s.dismissMessageTasks);
  const clearConversation = useAssistantStore((s) => s.clearConversation);
  const clearError = useAssistantStore((s) => s.clearError);

  const [input, setInput] = useState('');
  const [showNotes, setShowNotes] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      void hydrate();
      const t = setTimeout(() => inputRef.current?.focus(), 120);
      return () => clearTimeout(t);
    }
  }, [open, hydrate]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, isLoading]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;
    setInput('');
    await sendUserMessage(trimmed);
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 md:items-center"
      role="dialog"
      aria-modal
      aria-labelledby="assistant-title"
    >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        className="kiosk-allow-select card-mizan text-mizan-text flex w-full max-w-lg flex-col overflow-hidden shadow-xl"
        style={{ maxHeight: '88dvh' }}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-mizan-border/15 bg-mizan-shellSoft px-4 py-2">
          <h2 id="assistant-title" className="flex items-center gap-3 text-base font-bold text-mizan-textOnDark">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-transparent">
              <svg
                viewBox="0 0 1024 1024"
                aria-hidden
                className="h-full w-full scale-[1.18] transform"
              >
                <use href="/icons.svg#mizan-glyph" />
              </svg>
            </span>
            Smart Assistant
          </h2>
          <div className="flex items-center gap-1">
            {/* Memory toggle */}
            <button
              type="button"
              onClick={() => setShowNotes((v) => !v)}
              className={`flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold transition-colors ${
                showNotes
                  ? 'bg-mizan-accent/20 text-mizan-textOnDark'
                  : 'text-mizan-textOnDark/70 hover:text-mizan-textOnDark'
              }`}
              title="View remembered notes"
            >
              <Brain className="inline-block h-3.5 w-3.5 align-text-bottom" aria-hidden strokeWidth={2} />
              {familyNotes.length > 0 && <span className="ml-0.5">{familyNotes.length}</span>}
            </button>
            {messages.length > 0 && (
              <button
                type="button"
                onClick={() => void clearConversation()}
                className="rounded-lg px-3 py-1 text-xs font-semibold text-mizan-textOnDark/70 hover:text-mizan-textOnDark"
              >
                Clear
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-3 py-1 text-sm font-semibold text-mizan-textOnDark/75 hover:text-mizan-textOnDark"
            >
              <X className="h-5 w-5" strokeWidth={2} />
            </button>
          </div>
        </div>

        {/* Memory notes panel */}
        <AnimatePresence>
          {showNotes && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="shrink-0 overflow-hidden border-b border-mizan-surfaceSoft"
            >
              <div className="px-4 py-3">
                <p className="mb-2 text-xs font-semibold text-mizan-text/60 uppercase tracking-wide">
                  Remembered notes
                </p>
                {familyNotes.length === 0 ? (
                  <p className="text-xs text-mizan-text/40 italic">
                    Nothing saved yet. Say "remember that…" and I'll save it here.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {familyNotes.map((note, i) => (
                      <span
                        key={i}
                        className="flex items-center gap-1 rounded-full bg-mizan-surfaceSoft px-3 py-1 text-xs text-mizan-text"
                      >
                        {note}
                        <button
                          type="button"
                          onClick={() => void removeNote(i)}
                          className="ml-1 opacity-50 hover:opacity-100 font-bold"
                          aria-label="Remove note"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Messages area */}
        <div className="custom-scrollbar flex-1 overflow-y-auto p-4">
          <AnimatePresence mode="wait">
            {messages.length === 0 ? (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center gap-5 py-8 text-center"
              >
                <p className="text-mizan-text/60 text-sm leading-relaxed max-w-xs">
                  Salam! Ask me to suggest tasks, help with goals, or chat about your day.
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  {QUICK_ACTIONS.map((a) => (
                    <button
                      key={a.label}
                      type="button"
                      onClick={() => void send(a.prompt)}
                      className="bg-mizan-surfaceSoft text-mizan-text rounded-full px-4 py-2 text-sm font-semibold active:scale-95"
                    >
                      {a.label}
                    </button>
                  ))}
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="chat"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col gap-4"
              >
                {messages.map((msg) => (
                  <ChatMessage
                    key={msg.id}
                    message={msg}
                    onToggleTask={(taskId) => toggleGhostTask(msg.id, taskId)}
                    onDayChange={(taskId, day) => setGhostTaskDay(msg.id, taskId, day)}
                    onMonthDayChange={(taskId, day) => setGhostTaskMonthDay(msg.id, taskId, day)}
                    onCommit={() => commitSelectedTasks(msg.id)}
                    onDismiss={() => dismissMessageTasks(msg.id)}
                  />
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          {isLoading && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mt-4 flex items-center gap-2"
            >
              <div className="border-mizan-success h-5 w-5 animate-spin rounded-full border-2 border-t-transparent" />
              <p className="text-mizan-text/60 text-xs">Thinking…</p>
            </motion.div>
          )}

          {error && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mt-4 flex items-center justify-between rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600"
            >
              <span>{error}</span>
              <button
                type="button"
                onClick={clearError}
                className="ml-2 rounded p-0.5 opacity-70 hover:opacity-100"
                aria-label="Dismiss error"
              >
                <X className="h-4 w-4" strokeWidth={2.5} />
              </button>
            </motion.div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Quick actions strip (when conversation has started) */}
        {messages.length > 0 && (
          <div className="custom-scrollbar shrink-0 flex gap-2 overflow-x-auto border-t border-mizan-surfaceSoft px-4 py-2">
            {QUICK_ACTIONS.map((a) => (
              <button
                key={a.label}
                type="button"
                onClick={() => void send(a.prompt)}
                className="bg-mizan-surfaceSoft text-mizan-text shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold active:scale-95"
              >
                {a.label}
              </button>
            ))}
          </div>
        )}

        {/* Input row */}
        <div className="shrink-0 border-t border-mizan-surfaceSoft bg-mizan-surface/60 p-3">
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              rows={1}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void send(input);
                }
              }}
              className="min-h-[44px] flex-1 resize-none rounded-2xl border border-mizan-border/50 bg-mizan-bg px-4 py-3 text-sm text-mizan-text outline-none placeholder:text-mizan-textMuted/70 focus:border-mizan-accent/70 focus:ring-2 focus:ring-mizan-accentGlow/35"
              placeholder="Ask something… or 'remember that Zayd is too little'"
            />
            <button
              type="button"
              disabled={!input.trim() || isLoading}
              onClick={() => void send(input)}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-mizan-accent text-mizan-textOnDark shadow-kiosk-soft transition-colors disabled:opacity-40 active:scale-95"
              aria-label="Send"
            >
              <Send className="h-5 w-5" strokeWidth={2} />
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
