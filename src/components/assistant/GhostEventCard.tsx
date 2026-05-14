import { CalendarDays, Check, Repeat } from 'lucide-react';
import type { GhostEvent } from '../../stores/assistantStore';

const RECURRENCE_LABEL: Record<string, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
};

interface Props {
  event: GhostEvent;
  onToggle: () => void;
}

export function GhostEventCard({ event, onToggle }: Props) {
  const recurrenceLabel = event.recurrence && event.recurrence !== 'none'
    ? RECURRENCE_LABEL[event.recurrence]
    : null;

  const timeLabel = event.start_time
    ? event.end_time ? `${event.start_time} – ${event.end_time}` : event.start_time
    : null;

  if (event.committed) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border-2 border-mizan-success/30 bg-mizan-success/10 px-4 py-3 opacity-60">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-mizan-success text-white">
          <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-mizan-text whitespace-normal break-words text-sm font-semibold line-through">{event.title}</p>
          <p className="text-mizan-text/50 text-xs">Added to calendar</p>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onToggle}
      className={`flex w-full items-center gap-3 rounded-2xl border-2 px-4 py-3 text-left transition-all active:scale-[0.98] ${
        event.selected
          ? 'border-mizan-accent bg-mizan-surface'
          : 'border-mizan-surfaceSoft bg-mizan-bg opacity-50'
      }`}
    >
      <div
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
          event.selected
            ? 'border-mizan-accent bg-mizan-accent text-white'
            : 'border-mizan-surfaceSoft'
        }`}
      >
        {event.selected
          ? <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />
          : <CalendarDays className="h-3 w-3 text-mizan-text/30" strokeWidth={2} aria-hidden />
        }
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-mizan-text whitespace-normal break-words text-sm font-semibold">{event.title}</p>
        <p className="text-mizan-text/60 text-xs flex flex-wrap gap-x-1.5">
          {event.date && <span>{event.date}</span>}
          {timeLabel && <span className="text-mizan-accent font-medium">· {timeLabel}</span>}
        </p>
      </div>

      {recurrenceLabel && (
        <span className={`flex items-center gap-1 shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
          event.selected ? 'bg-mizan-accent/15 text-mizan-accent' : 'bg-mizan-surfaceSoft text-mizan-text/60'
        }`}>
          <Repeat className="h-2.5 w-2.5" strokeWidth={2} aria-hidden />
          {recurrenceLabel}
        </span>
      )}
    </button>
  );
}
