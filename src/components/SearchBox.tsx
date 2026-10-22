import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { Language } from '../i18n/translations.ts';
import { tr } from '../i18n/translations.ts';
import type { LexiconEntry } from '../types/lexicon.ts';
import { VOLUMES } from '../lib/volumes.ts';
import { buildSuggestions, suggest, type Suggestion, type SuggestionKind } from '../utils/suggest.ts';

interface Props {
  entries: LexiconEntry[];
  lang: Language;
  value: string;
  onChange: (value: string) => void;
  /** A term, person or place was chosen: run a search for it. */
  onPickQuery: (query: string) => void;
  /** An entry or chapter was chosen: open it. */
  onPickEntry: (id: string) => void;
  placeholder?: string;
  ariaLabel: string;
  className?: string;
  autoFocus?: boolean;
  type?: 'text' | 'search';
}

const KIND_LABEL: Record<SuggestionKind, [string, string, string]> = {
  entry: ['scheda', 'entry', 'hasło'],
  chapter: ['capitolo', 'chapter', 'rozdział'],
  term: ['termine', 'term', 'termin'],
  character: ['personaggio', 'character', 'postać'],
  person: ['persona', 'person', 'osoba'],
  place: ['luogo', 'place', 'miejsce'],
};

/**
 * Search input with suggestions. The parent supplies the surrounding box (it must be
 * `position: relative`); the list opens right under it. Keyboard: ↑ ↓ choose, Enter picks
 * (or submits the form when nothing is chosen), Esc closes.
 */
export const SearchBox: React.FC<Props> = ({ entries, lang, value, onChange, onPickQuery, onPickEntry, placeholder, ariaLabel, className, autoFocus, type = 'text' }) => {
  const index = useMemo(() => buildSuggestions(entries), [entries]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const listId = useId();
  const ref = useRef<HTMLInputElement>(null);

  const items = useMemo(() => (open ? suggest(index, value) : []), [index, value, open]);
  useEffect(() => setActive(-1), [value]);

  const pick = (s: Suggestion) => {
    setOpen(false);
    if (s.entryId) onPickEntry(s.entryId);
    else onPickQuery(s.label);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' && items.length) {
      e.preventDefault();
      setActive((a) => (a + 1) % items.length);
    } else if (e.key === 'ArrowUp' && items.length) {
      e.preventDefault();
      setActive((a) => (a <= 0 ? items.length - 1 : a - 1));
    } else if (e.key === 'Enter' && active >= 0 && items[active]) {
      e.preventDefault();
      pick(items[active]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <>
      <input
        ref={ref}
        type={type}
        role="combobox"
        aria-expanded={items.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        aria-label={ariaLabel}
        autoComplete="off"
        autoFocus={autoFocus}
        value={value}
        placeholder={placeholder}
        className={className}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
      />
      {items.length > 0 && (
        <ul id={listId} role="listbox" className="glass absolute left-0 right-0 top-full z-50 mt-2 max-h-[22rem] overflow-y-auto rounded-xl p-1.5 text-left">
          {items.map((s, i) => (
            <li
              key={`${s.kind}-${s.entryId || ''}-${s.key}`}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              // mouse-down (not click) so the input keeps focus long enough for the choice to register
              onMouseDown={(e) => {
                e.preventDefault();
                pick(s);
              }}
              onMouseEnter={() => setActive(i)}
              className={`flex cursor-pointer items-baseline justify-between gap-4 rounded-lg px-3 py-2 text-lg ${i === active ? 'bg-brand-soft text-brand' : 'text-ink'}`}
            >
              <span className="min-w-0 truncate">{s.label}</span>
              <span className="shrink-0 text-xs uppercase tracking-[0.12em] text-slate-ink">
                {tr(lang, ...KIND_LABEL[s.kind])}
                {s.volume && ` · ${VOLUMES.find((v) => v.id === s.volume)?.title[lang] ?? ''}${s.number ? ` ${s.number}` : ''}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
};
