import React, { useEffect, useMemo, useRef, useState } from 'react';
import { tr } from '../i18n/translations.ts';
import type { Language } from '../i18n/translations.ts';
import { BLOCK_SNIPPETS, GROUP_LABELS, MARKUP_TAGS, slugify, type AttrDef, type MarkupGroup, type MarkupTag } from '../lib/markup.ts';

export interface Suggestions {
  subtypes: string[];
  placeKeys: string[];
  personKeys: string[];
  entries: string[];
}

interface Pending {
  tag: MarkupTag;
  preset: Record<string, string>;
  values: Record<string, string>;
}

interface Props {
  lang: Language;
  suggestions: Suggestions;
  /** Text currently selected in the editor (used to prefill key / lemma). */
  getSelection: () => string;
  onApply: (element: string, attrs: Record<string, string>) => void;
  onUnwrap: () => void;
  onInsertBlock: (xml: string) => void;
}

const GROUP_ORDER: MarkupGroup[] = ['language', 'sources', 'realms', 'people', 'places', 'links', 'format'];

const SUGGEST_ID: Record<string, string> = {
  subtypes: 'sg-subtypes',
  placeKeys: 'sg-place',
  personKeys: 'sg-person',
  entries: 'sg-entries',
};

export const MarkupToolbar: React.FC<Props> = ({ lang, suggestions, getSelection, onApply, onUnwrap, onInsertBlock }) => {
  const [pending, setPending] = useState<Pending | null>(null);
  const firstField = useRef<HTMLInputElement | HTMLSelectElement | null>(null);

  useEffect(() => {
    if (pending) setTimeout(() => firstField.current?.focus(), 0);
  }, [pending]);

  const visibleAttrs = (tag: MarkupTag, preset: Record<string, string>): AttrDef[] =>
    tag.attrs.filter((a) => !a.fixed && !(a.name in preset));

  const initialValue = (a: AttrDef, selection: string): string => {
    if (a.fromSelection === 'slug') return slugify(selection);
    if (a.fromSelection === 'text') return selection.trim();
    if (a.kind === 'select' && a.options) return a.options[0];
    return '';
  };

  const trigger = (tag: MarkupTag, preset: Record<string, string> = {}) => {
    const selection = getSelection();
    const fixed = Object.fromEntries(tag.attrs.filter((a) => a.fixed).map((a) => [a.name, a.fixed!]));
    const needed = visibleAttrs(tag, preset);
    if (needed.length === 0) {
      onApply(tag.element, { ...fixed, ...preset });
      return;
    }
    const values: Record<string, string> = {};
    needed.forEach((a) => (values[a.name] = initialValue(a, selection)));
    setPending({ tag, preset: { ...fixed, ...preset }, values });
  };

  const confirm = () => {
    if (!pending) return;
    const needed = visibleAttrs(pending.tag, pending.preset);
    if (needed.some((a) => a.required && !pending.values[a.name]?.trim())) return;
    onApply(pending.tag.element, { ...pending.preset, ...pending.values });
    setPending(null);
  };

  const grouped = useMemo(
    () =>
      GROUP_ORDER.map((g) => ({ group: g, tags: MARKUP_TAGS.filter((t) => t.group === g) })).filter((g) => g.tags.length > 0),
    []
  );

  const suggestionOptions = (a: AttrDef): string[] => {
    if (a.suggest === 'subtypes') return suggestions.subtypes;
    if (a.suggest === 'entries') return suggestions.entries.map((base) => `${base}.html`);
    if (a.suggest === 'placeKeys') return suggestions.placeKeys;
    if (a.suggest === 'personKeys') return suggestions.personKeys;
    return [];
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {grouped.map(({ group, tags }) => (
          <div key={group} className="flex min-w-0 flex-wrap items-center gap-1" role="group" aria-label={GROUP_LABELS[group][lang]}>
            <span className="mr-1 text-[0.625rem] font-semibold uppercase tracking-wider text-faint">
              {GROUP_LABELS[group][lang]}
            </span>
            {tags.map((tag) =>
              tag.presets ? (
                tag.presets.map((p) => (
                  <button
                    key={`${tag.id}-${p.label.en}`}
                    type="button"
                    className="chip hover:!bg-brand-soft"
                    title={`${tag.label[lang]} — <${tag.element}>`}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => trigger(tag, p.attrs)}
                  >
                    {p.label[lang]}
                  </button>
                ))
              ) : (
                <button
                  key={tag.id}
                  type="button"
                  className="chip hover:!bg-brand-soft"
                  title={`${tag.label[lang]} — <${tag.element}>`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => trigger(tag)}
                >
                  {tag.id === 'italic' ? <em>I</em> : tag.id === 'bold' ? <strong>B</strong> : tag.short[lang]}
                </button>
              )
            )}
          </div>
        ))}

        <div className="ml-auto flex items-center gap-1">
          <button type="button" className="chip" onMouseDown={(e) => e.preventDefault()} onClick={onUnwrap} title={tr(lang, 'Rimuove il tag che contiene il cursore', 'Removes the tag around the cursor', 'Usuwa znacznik obejmujący kursor')}>
            {tr(lang, 'Rimuovi tag', 'Remove tag', 'Usuń znacznik')}
          </button>
          <select
            className="chip !pr-1"
            value=""
            aria-label={tr(lang, 'Inserisci blocco', 'Insert block', 'Wstaw blok')}
            onChange={(e) => {
              const snippet = BLOCK_SNIPPETS.find((s) => s.id === e.target.value);
              if (snippet) onInsertBlock(snippet.xml);
            }}
          >
            <option value="">{tr(lang, 'Inserisci blocco…', 'Insert block…', 'Wstaw blok…')}</option>
            {BLOCK_SNIPPETS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label[lang]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {pending && (
        <form
          className="card flex flex-wrap items-end gap-3 border-brand/50 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            confirm();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setPending(null);
          }}
        >
          <div className="min-w-0 self-center pr-2">
            <p className="eyebrow">{pending.tag.label[lang]}</p>
            <code className="font-mono text-xs text-faint">&lt;{pending.tag.element}&gt;</code>
          </div>
          {visibleAttrs(pending.tag, pending.preset).map((a, i) => {
            const list = suggestionOptions(a);
            const value = pending.values[a.name] ?? '';
            const setValue = (v: string) => setPending({ ...pending, values: { ...pending.values, [a.name]: v } });
            return (
              <label key={a.name} className="block min-w-[10rem] flex-1">
                <span className="label">
                  {a.label[lang]} <code className="normal-case text-faint">@{a.name}</code>
                </span>
                {a.kind === 'select' ? (
                  <select
                    ref={i === 0 ? (el) => { firstField.current = el; } : undefined}
                    className="field !py-1.5"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                  >
                    {a.options!.map((o) => (
                      <option key={o}>{o}</option>
                    ))}
                  </select>
                ) : (
                  <>
                    <input
                      ref={i === 0 ? (el) => { firstField.current = el; } : undefined}
                      className="field !py-1.5"
                      value={value}
                      onChange={(e) => setValue(e.target.value)}
                      list={a.suggest ? SUGGEST_ID[a.suggest] : undefined}
                      required={a.required}
                      autoComplete="off"
                    />
                  </>
                )}
                {a.suggest && list.length > 0 && (
                  <datalist id={SUGGEST_ID[a.suggest]}>
                    {list.map((o) => (
                      <option key={o} value={o} />
                    ))}
                  </datalist>
                )}
              </label>
            );
          })}
          <div className="flex gap-2">
            <button type="submit" className="btn btn-primary">
              {tr(lang, 'Inserisci', 'Insert', 'Wstaw')}
            </button>
            <button type="button" className="btn" onClick={() => setPending(null)}>
              {tr(lang, 'Annulla', 'Cancel', 'Anuluj')}
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
