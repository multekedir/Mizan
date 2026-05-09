import { useState } from 'react';
import { usePeopleStore, PERSON_COLORS, ALL_COLORS } from '../../../stores/peopleStore';
import type { PersonColor } from '../../../stores/peopleStore';
import type { PersonRow } from '../../../db/database';

function ColorPicker({
  value,
  onChange,
}: {
  value: PersonColor;
  onChange: (c: PersonColor) => void;
}) {
  return (
    <div className="flex gap-2">
      {ALL_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className={`h-8 w-8 rounded-full transition-transform active:scale-95 ${PERSON_COLORS[c].dot} ${
            value === c ? 'ring-2 ring-mizan-text ring-offset-2 scale-110' : ''
          }`}
          aria-label={c}
        />
      ))}
    </div>
  );
}

function PersonRow({ person }: { person: PersonRow }) {
  const { updatePerson, deletePerson } = usePeopleStore();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(person.name);
  const [color, setColor] = useState<PersonColor>(person.color as PersonColor);
  const [err, setErr] = useState<string | null>(null);

  function startEdit() {
    setName(person.name);
    setColor(person.color as PersonColor);
    setErr(null);
    setEditing(true);
  }

  async function save() {
    const res = await updatePerson(person.id, name, color);
    if (!res.ok) {
      setErr(res.error ?? 'Failed.');
      return;
    }
    setEditing(false);
  }

  if (editing) {
    return (
      <li className="kiosk-allow-select flex flex-col gap-3 rounded-2xl bg-mizan-surfaceSoft/60 p-4">
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void save();
            if (e.key === 'Escape') setEditing(false);
          }}
          className="w-full rounded-2xl border border-mizan-surfaceSoft bg-mizan-bg px-4 py-2.5 text-base font-semibold outline-none focus:ring-2 focus:ring-mizan-success"
          placeholder="Name…"
        />
        <ColorPicker value={color} onChange={setColor} />
        {err && <p className="text-xs text-red-500">{err}</p>}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void save()}
            className="flex-1 rounded-2xl bg-mizan-success py-2.5 text-sm font-semibold text-mizan-textOnDark active:scale-95"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="flex-1 rounded-2xl bg-mizan-surfaceSoft py-2.5 text-sm font-semibold text-mizan-text active:scale-95"
          >
            Cancel
          </button>
        </div>
      </li>
    );
  }

  return (
    <li className="flex items-center gap-3 rounded-2xl bg-mizan-surfaceSoft/40 px-4 py-3">
      <div
        className={`h-10 w-10 shrink-0 rounded-full ${PERSON_COLORS[person.color as PersonColor]?.dot ?? 'bg-mizan-surfaceSoft'}`}
      />
      <span className="flex-1 text-base font-semibold text-mizan-text">{person.name}</span>
      <button
        type="button"
        onClick={startEdit}
        className="rounded-2xl bg-mizan-surfaceSoft px-4 py-2 text-sm font-semibold text-mizan-text active:scale-95"
      >
        Edit
      </button>
      <button
        type="button"
        onClick={() => void deletePerson(person.id)}
        className="rounded-2xl border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-500 active:scale-95"
      >
        Remove
      </button>
    </li>
  );
}

export function PeopleSection() {
  const { people, addPerson } = usePeopleStore();
  const [name, setName] = useState('');
  const [color, setColor] = useState<PersonColor>('amber');
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setErr(null);
    const res = await addPerson(name, color);
    if (!res.ok) {
      setErr(res.error ?? 'Failed.');
      return;
    }
    setName('');
    setColor('amber');
  }

  return (
    <div>
      <ul className="flex flex-col gap-3">
        {people.map((p) => (
          <PersonRow key={p.id} person={p} />
        ))}
      </ul>

      <div className="mt-5 border-t border-mizan-surfaceSoft pt-5">
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-mizan-text/60">Add person</p>
        <div className="kiosk-allow-select flex flex-col gap-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submit();
            }}
            className="w-full rounded-2xl border border-mizan-surfaceSoft bg-mizan-bg px-4 py-2.5 text-base outline-none focus:ring-2 focus:ring-mizan-success"
            placeholder="Name (e.g. Layla, Uncle Ahmad…)"
          />
          <ColorPicker value={color} onChange={setColor} />
          {err && <p className="text-xs text-red-500">{err}</p>}
          <button
            type="button"
            onClick={() => void submit()}
            className="w-full rounded-2xl bg-mizan-accent py-3 font-semibold text-mizan-textOnDark active:scale-95"
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
}
