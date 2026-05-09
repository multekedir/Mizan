import { Check } from 'lucide-react';
import type { GhostTask } from '../../stores/assistantStore';
import { getPrayerBlockKey } from '../../lib/prayerBlocks';

const DAY_SHORT = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const DAY_FULL = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_DAYS = [1, 5, 10, 15, 20, 25, 28];

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

const FREQ_LABEL: Record<string, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
};


interface Props {
  task: GhostTask;
  onToggle: () => void;
  onDayChange: (day: number) => void;
  onMonthDayChange: (day: number) => void;
  hidePrayerTime?: boolean;
}

export function GhostTaskCard({ task, onToggle, onDayChange, onMonthDayChange, hidePrayerTime = false }: Props) {
  const freqLabel = FREQ_LABEL[task.frequency];
  const isWeekly = task.frequency === 'weekly';
  const isMonthly = task.frequency === 'monthly';
  const isBoth = task.assignee === 'Both';

  if (task.committed) {
    const scheduleText =
      task.frequency === 'daily' ? 'Daily'
      : task.frequency === 'weekly' ? `Every ${DAY_FULL[task.selectedDay]}`
      : task.frequency === 'monthly' ? `Monthly · ${ordinal(task.selectedMonthDay)}`
      : null;

    return (
      <div className="flex items-center gap-3 rounded-2xl border-2 border-mizan-success/30 bg-mizan-success/10 px-4 py-3 opacity-60">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-mizan-success text-white">
          <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-mizan-text whitespace-normal break-words text-sm font-semibold line-through">{task.title}</p>
          <p className="text-mizan-text/50 text-xs">
            {isBoth ? 'Mom & Dad' : task.assignee}
            {task.time && !(hidePrayerTime && getPrayerBlockKey(task.time) !== null) ? ` · ${task.time}` : ''}
            {task.duration ? ` · ${task.duration}` : ''}
            {scheduleText ? ` · ${scheduleText}` : ''}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`flex flex-col rounded-2xl border-2 transition-all ${
        task.selected
          ? 'border-mizan-success bg-mizan-surface'
          : 'border-mizan-surfaceSoft bg-mizan-bg opacity-50'
      }`}
    >
      {/* Main row */}
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-4 py-3 text-left active:scale-[0.98]"
      >
        <div
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
            task.selected
              ? 'border-mizan-success bg-mizan-success text-white'
              : 'border-mizan-surfaceSoft'
          }`}
        >
          {task.selected && <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-mizan-text whitespace-normal break-words text-sm font-semibold">{task.title}</p>
          <p className="text-mizan-text/60 text-xs">
            {isBoth ? 'Mom & Dad' : task.assignee}
            {task.time && !(hidePrayerTime && getPrayerBlockKey(task.time) !== null)
              ? <span className="ml-1.5 text-mizan-success font-medium">· {task.time}</span>
              : null}
            {task.duration ? <span className="ml-1.5 text-mizan-text/40">· {task.duration}</span> : null}
          </p>
        </div>
        {freqLabel && (
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
              task.selected
                ? 'bg-mizan-success/15 text-mizan-success'
                : 'bg-mizan-surfaceSoft text-mizan-text/60'
            }`}
          >
            {freqLabel}
          </span>
        )}
      </button>

      {/* Day picker — weekly */}
      {isWeekly && task.selected && (
        <div className="flex items-center gap-1 px-4 pb-3">
          <span className="text-mizan-text/50 text-xs mr-1">Every</span>
          {DAY_SHORT.map((label, day) => (
            <button
              key={day}
              type="button"
              onClick={() => onDayChange(day)}
              className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
                task.selectedDay === day
                  ? 'bg-mizan-success text-white'
                  : 'bg-mizan-surfaceSoft text-mizan-text hover:bg-mizan-success/20'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Day picker — monthly */}
      {isMonthly && task.selected && (
        <div className="flex items-center gap-2 px-4 pb-3">
          <span className="text-mizan-text/50 text-xs shrink-0">On the</span>
          <div className="flex gap-1 flex-wrap">
            {MONTH_DAYS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => onMonthDayChange(d)}
                className={`flex h-7 min-w-[30px] items-center justify-center rounded-full px-1.5 text-xs font-semibold transition-colors ${
                  task.selectedMonthDay === d
                    ? 'bg-mizan-success text-white'
                    : 'bg-mizan-surfaceSoft text-mizan-text hover:bg-mizan-success/20'
                }`}
              >
                {ordinal(d)}
              </button>
            ))}
          </div>
          <span className="text-mizan-text/50 text-xs shrink-0">of month</span>
        </div>
      )}
    </div>
  );
}
