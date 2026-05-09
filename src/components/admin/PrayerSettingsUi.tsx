interface SelectOption<T extends string> {
  value: T;
  label: string;
}

interface SelectProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: SelectOption<T>[];
  id?: string;
}

export function Select<T extends string>({ value, onChange, options, id }: SelectProps<T>) {
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      className="border-mizan-surfaceSoft bg-mizan-bg text-mizan-text focus:border-mizan-accent focus:ring-mizan-accentGlow/30 w-full rounded-2xl border px-4 py-2.5 text-sm font-medium outline-none focus:ring-2"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

interface SwitchProps {
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  id?: string;
  'aria-label'?: string;
  disabled?: boolean;
}

export function Switch({
  checked,
  onCheckedChange,
  id,
  'aria-label': ariaLabel,
  disabled = false,
}: SwitchProps) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-disabled={disabled}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => {
        if (!disabled) onCheckedChange(!checked);
      }}
      className={`relative h-8 w-14 shrink-0 rounded-full transition-colors ${
        disabled ? 'cursor-not-allowed opacity-40' : ''
      } ${checked ? 'bg-mizan-success' : 'bg-mizan-surfaceSoft'}`}
    >
      <span
        className={`absolute top-1 left-1 h-6 w-6 rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-6' : 'translate-x-0'
        }`}
      />
    </button>
  );
}
