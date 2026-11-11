import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { tr } from '../i18n/translations.ts';
import type { Language } from '../i18n/translations.ts';
import { CHARACTER_TYPES, GROUP_LABELS, MARKUP_TAGS, REALM_TYPES, SOURCE_TYPES, TEXT_LANGS, slugify, type AttrDef, type MarkupTag } from '../lib/markup.ts';
import {
  BLOCK_ELEMENTS,
  getTokenAt,
  removeToken,
  replaceToken,
  serializeTokens,
  setTokenAttrs,
  sliceText,
  tokenize,
  unwrapElement,
  wrapSlice,
  type MarkupToken,
  type TokenPath,
} from '../lib/lexiconSections.ts';
import type { Suggestions } from './MarkupToolbar.tsx';

/* ================================================================
 * InlineMarkupEditor — marcatura assistita del testo di un textpart
 * Adattato dall'EditionMarkupEditor di ILA: il testo è un flusso di
 * token; si seleziona un passo e si sceglie il tag dal catalogo LARES
 * (lib/markup.ts), si clicca un tag per modificarne gli attributi o
 * toglierlo. Ogni paragrafo si può riscrivere come XML.
 * ================================================================ */

interface Props {
  value: string;
  onChange: (xml: string) => void;
  lang: Language;
  suggestions: Suggestions;
}

type El = MarkupToken & { kind: 'el' };

interface Sel {
  startPath: TokenPath;
  startOffset: number;
  endPath: TokenPath;
  endOffset: number;
  text: string;
}

interface Choice {
  tag: MarkupTag;
  preset: Record<string, string>;
  label: string;
}

interface MenuState {
  sel: Sel;
  x: number;
  y: number;
  choice?: Choice;
  values: Record<string, string>;
}

interface PopState {
  path: TokenPath;
  x: number;
  y: number;
  attrs: Array<[string, string]>;
}

const ATTR_OPTIONS: Record<string, Record<string, readonly string[]>> = {
  rs: { type: REALM_TYPES },
  persName: { type: CHARACTER_TYPES },
  ref: { type: SOURCE_TYPES },
  foreign: { 'xml:lang': TEXT_LANGS },
  hi: { rend: ['italic', 'bold', 'superscript'] },
};

/** Classe visiva per ciascun elemento inline. */
function inlineClass(t: El): string {
  switch (t.name) {
    case 'w':
      return 'mk mk-w';
    case 'ref':
      return t.attrs.type ? 'mk mk-source' : 'mk mk-link';
    case 'rs':
      return `mk mk-rs tag-highlight-${(t.attrs.type || '').split(';')[0].toLowerCase()}`;
    case 'persName':
      return 'mk mk-pers';
    case 'placeName':
      return 'mk mk-place';
    case 'foreign':
      return 'mk mk-foreign';
    case 'hi':
      return t.attrs.rend === 'bold' ? 'mk font-bold' : 'mk italic';
    case 'emph':
      return 'mk font-bold';
    case 'title':
      return 'mk italic';
    case 'quote':
      return 'mk mk-quote';
    default:
      return 'mk mk-other';
  }
}

function describe(t: El): string {
  const a = Object.entries(t.attrs)
    .map(([k, v]) => `${k}="${v}"`)
    .join(' ');
  return `<${t.name}${a ? ' ' + a : ''}>`;
}

const pathKey = (p: TokenPath) => p.join('.');

function choices(lang: Language): Array<{ group: string; items: Choice[] }> {
  const groups = new Map<string, Choice[]>();
  for (const tag of MARKUP_TAGS) {
    const g = tag.group;
    const list = groups.get(g) || [];
    if (tag.presets) tag.presets.forEach((p) => list.push({ tag, preset: p.attrs, label: p.label[lang] }));
    else list.push({ tag, preset: {}, label: tag.label[lang] });
    groups.set(g, list);
  }
  return Array.from(groups, ([group, items]) => ({ group: GROUP_LABELS[group as keyof typeof GROUP_LABELS]?.[lang] || group, items }));
}

export const InlineMarkupEditor: React.FC<Props> = ({ value, onChange, lang, suggestions }) => {
  const [tokens, setTokens] = useState<MarkupToken[] | null>(() => {
    try {
      return tokenize(value);
    } catch {
      return null;
    }
  });
  const [parseError, setParseError] = useState<string | null>(null);
  const [mode, setMode] = useState<'visual' | 'xml'>(tokens ? 'visual' : 'xml');
  const [xmlDraft, setXmlDraft] = useState(value);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [pop, setPop] = useState<PopState | null>(null);
  const [editing, setEditing] = useState<{ path: TokenPath; draft: string; error?: string } | null>(null);
  const [adding, setAdding] = useState<{ draft: string; error?: string } | null>(null);
  const [warn, setWarn] = useState<string | null>(null);
  const lastEmitted = useRef(value);
  const rootRef = useRef<HTMLDivElement>(null);

  // Allinea lo stato a un valore cambiato dall'esterno (annulla, altra sezione…).
  useEffect(() => {
    if (value === lastEmitted.current) return;
    lastEmitted.current = value;
    setXmlDraft(value);
    try {
      setTokens(tokenize(value));
      setParseError(null);
    } catch (e) {
      setTokens(null);
      setParseError((e as Error).message);
    }
  }, [value]);

  const commit = useCallback(
    (next: MarkupToken[]) => {
      setTokens(next);
      const xml = serializeTokens(next);
      lastEmitted.current = xml;
      setXmlDraft(xml);
      onChange(xml);
    },
    [onChange]
  );

  const groups = useMemo(() => choices(lang), [lang]);

  /* ── selezione → menu dei tag ─────────────────────────────── */
  const onMouseUp = () => {
    if (editing) return;
    const s = window.getSelection();
    if (!s || s.isCollapsed || !s.rangeCount || !tokens) return;
    const range = s.getRangeAt(0);
    const host = (n: Node | null) => (n?.nodeType === 3 ? n.parentElement : (n as HTMLElement | null))?.closest('[data-tok]') as HTMLElement | null;
    const a = host(range.startContainer);
    const b = host(range.endContainer);
    if (!a || !b || !rootRef.current?.contains(a) || !rootRef.current.contains(b)) return;
    const pa = JSON.parse(a.dataset.tok!) as TokenPath;
    const pb = JSON.parse(b.dataset.tok!) as TokenPath;
    if (pathKey(pa.slice(0, -1)) !== pathKey(pb.slice(0, -1))) {
      setWarn(
        tr(
          lang,
          'La selezione deve iniziare e finire allo stesso livello (es. non a metà di un tag già presente).',
          'The selection must start and end at the same level (e.g. not halfway through an existing tag).',
          'Zaznaczenie musi zaczynać się i kończyć na tym samym poziomie (np. nie w połowie istniejącego znacznika).'
        )
      );
      return;
    }
    setWarn(null);
    const so = range.startContainer.nodeType === 3 ? range.startOffset : 0;
    const eo = range.endContainer.nodeType === 3 ? range.endOffset : (getTokenAt(tokens, pb) as { value?: string })?.value?.length || 0;
    const rect = range.getBoundingClientRect();
    setPop(null);
    setMenu({
      sel: { startPath: pa, startOffset: so, endPath: pb, endOffset: eo, text: s.toString() },
      x: Math.min(rect.left + rect.width / 2, window.innerWidth - 180),
      y: rect.bottom + 6,
      values: {},
    });
  };

  const visibleAttrs = (c: Choice): AttrDef[] => c.tag.attrs.filter((a) => !a.fixed && !(a.name in c.preset));

  const pick = (c: Choice) => {
    if (!menu) return;
    const vals: Record<string, string> = {};
    for (const a of visibleAttrs(c)) {
      vals[a.name] = a.fromSelection === 'slug' ? slugify(menu.sel.text) : a.fromSelection === 'text' ? menu.sel.text.trim() : a.kind === 'select' && a.options ? a.options[0] : '';
    }
    if (visibleAttrs(c).length === 0) return apply(c, vals);
    setMenu({ ...menu, choice: c, values: vals });
  };

  const apply = (c: Choice, vals: Record<string, string>) => {
    if (!menu || !tokens) return;
    const fixed = Object.fromEntries(c.tag.attrs.filter((a) => a.fixed).map((a) => [a.name, a.fixed!]));
    const attrs = Object.fromEntries(Object.entries({ ...fixed, ...c.preset, ...vals }).filter(([, v]) => v !== ''));
    const { sel } = menu;
    commit(wrapSlice(tokens, sel.startPath, sel.startOffset, sel.endPath, sel.endOffset, (slice) => ({ kind: 'el', name: c.tag.element, attrs, children: slice, selfClosing: false })));
    setMenu(null);
    window.getSelection()?.removeAllRanges();
  };

  /* ── clic su un tag → popover attributi ───────────────────── */
  const openPop = (e: React.MouseEvent, path: TokenPath, t: El) => {
    e.stopPropagation();
    if (window.getSelection()?.toString()) return;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setMenu(null);
    setPop({ path, x: Math.min(r.left, window.innerWidth - 340), y: r.bottom + 6, attrs: Object.entries(t.attrs) });
  };

  /* ── render ───────────────────────────────────────────────── */
  const render = (list: MarkupToken[], base: TokenPath, inBlockContainer: boolean): React.ReactNode =>
    list.map((t, i) => {
      const path = [...base, i];
      const k = pathKey(path);
      if (t.kind === 'raw') return null;
      if (t.kind === 'text') {
        if (inBlockContainer && /^\s*$/.test(t.value)) return null;
        return (
          <span key={k} data-tok={JSON.stringify(path)}>
            {t.value}
          </span>
        );
      }
      if (t.name === 'lb') return <br key={k} />;
      if (BLOCK_ELEMENTS.has(t.name) && !(t.name === 'quote' && !inBlockContainer)) {
        const isEditing = editing && pathKey(editing.path) === k;
        const containerKids = ['list', 'div', 'lg', 'listBibl', 'cit'].includes(t.name);
        return (
          <div key={k} className={`mk-block mk-block-${t.name} group relative`} data-label={t.name === 'div' ? t.attrs.type || 'div' : t.name}>
            {isEditing ? (
              <div className="space-y-2">
                <textarea
                  className="field xml-editor min-h-[6rem] w-full font-mono !text-xs"
                  value={editing.draft}
                  autoFocus
                  onChange={(e) => setEditing({ ...editing, draft: e.target.value })}
                />
                {editing.error && <p className="text-xs text-danger">{editing.error}</p>}
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="btn btn-primary !py-1 !text-xs"
                    onClick={() => {
                      try {
                        const kids = tokenize(editing.draft);
                        commit(replaceToken(tokens!, path, [{ ...t, children: kids, selfClosing: false }]));
                        setEditing(null);
                      } catch (err) {
                        setEditing({ ...editing, error: (err as Error).message });
                      }
                    }}
                  >
                    {tr(lang, 'Applica', 'Apply', 'Zastosuj')}
                  </button>
                  <button type="button" className="btn !py-1 !text-xs" onClick={() => setEditing(null)}>
                    {tr(lang, 'Annulla', 'Cancel', 'Anuluj')}
                  </button>
                </div>
              </div>
            ) : (
              <>
                {render(t.children, path, containerKids)}
                <span className="mk-block-tools no-print">
                  <button
                    type="button"
                    title={tr(lang, 'Riscrivi come XML', 'Rewrite as XML', 'Przepisz jako XML')}
                    onClick={() => setEditing({ path, draft: serializeTokens(t.children) })}
                  >
                    ✎
                  </button>
                  <button
                    type="button"
                    title={tr(lang, 'Elimina blocco', 'Delete block', 'Usuń blok')}
                    onClick={() => {
                      if (window.confirm(tr(lang, `Eliminare questo <${t.name}>?`, `Delete this <${t.name}>?`, `Usunąć ten <${t.name}>?`))) commit(removeToken(tokens!, path));
                    }}
                  >
                    ×
                  </button>
                </span>
              </>
            )}
          </div>
        );
      }
      return (
        <span key={k} className={inlineClass(t)} title={describe(t)} onClick={(e) => openPop(e, path, t)}>
          {t.children.length ? render(t.children, path, false) : <span className="text-faint">⟨{t.name}⟩</span>}
        </span>
      );
    });

  const popToken = pop && tokens ? (getTokenAt(tokens, pop.path) as El | null) : null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs">
        <div className="inline-flex overflow-hidden rounded-lg border border-line">
          {(['visual', 'xml'] as const).map((m) => (
            <button
              key={m}
              type="button"
              className={`px-2.5 py-1 ${mode === m ? 'bg-brand text-brand-ink' : 'text-muted hover:text-brand'}`}
              onClick={() => {
                if (m === 'visual') {
                  try {
                    const next = tokenize(xmlDraft);
                    if (xmlDraft !== lastEmitted.current) commit(next);
                    else setTokens(next);
                    setParseError(null);
                  } catch (e) {
                    setParseError((e as Error).message);
                    return;
                  }
                }
                setMode(m);
              }}
            >
              {m === 'visual' ? tr(lang, 'Marcatura', 'Markup', 'Znakowanie') : 'XML'}
            </button>
          ))}
        </div>
        {mode === 'visual' && (
          <span className="text-faint">
            {tr(lang, 'Seleziona un passo per marcarlo · clic su un tag per modificarlo', 'Select a passage to tag it · click a tag to edit it', 'Zaznacz fragment, aby go oznaczyć · kliknij znacznik, aby go edytować')}
          </span>
        )}
      </div>

      {parseError && <p className="text-xs text-danger">XML: {parseError}</p>}
      {warn && <p className="text-xs text-warn">{warn}</p>}

      {mode === 'xml' || !tokens ? (
        <div className="space-y-2">
          <textarea
            className="field xml-editor min-h-[10rem] w-full font-mono !text-xs"
            value={xmlDraft}
            spellCheck={false}
            onChange={(e) => setXmlDraft(e.target.value)}
            onBlur={() => {
              try {
                const next = tokenize(xmlDraft);
                setParseError(null);
                if (xmlDraft !== lastEmitted.current) {
                  setTokens(next);
                  lastEmitted.current = xmlDraft;
                  onChange(xmlDraft);
                }
              } catch (e) {
                setParseError((e as Error).message);
              }
            }}
          />
        </div>
      ) : (
        <div ref={rootRef} className="mk-root scholarly-prose" onMouseUp={onMouseUp}>
          {render(tokens, [], true)}
          {tokens.every((t) => t.kind !== 'el') && !sliceText(tokens).trim() && (
            <p className="text-sm italic text-faint">{tr(lang, 'Sezione vuota.', 'Empty section.', 'Pusta sekcja.')}</p>
          )}
        </div>
      )}

      {mode === 'visual' && tokens && (
        <div>
          {adding ? (
            <div className="space-y-2">
              <textarea
                className="field min-h-[5rem] w-full !text-sm"
                autoFocus
                placeholder={tr(lang, 'Testo del nuovo paragrafo (puoi includere tag XML)', 'New paragraph text (XML tags allowed)', 'Tekst nowego akapitu (dozwolone znaczniki XML)')}
                value={adding.draft}
                onChange={(e) => setAdding({ draft: e.target.value })}
              />
              {adding.error && <p className="text-xs text-danger">{adding.error}</p>}
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn btn-primary !py-1 !text-xs"
                  disabled={!adding.draft.trim()}
                  onClick={() => {
                    try {
                      const kids = tokenize(adding.draft.trim());
                      // indentazione: copia quella del primo blocco esistente
                      const ws = tokens.find((t) => t.kind === 'text' && /^\s*\n\s*$/.test(t.value)) as { value: string } | undefined;
                      const nl = ws ? ws.value.replace(/^[\s\S]*\n/, '\n') : '\n';
                      const trailing = tokens[tokens.length - 1];
                      const head = trailing?.kind === 'text' && /^\s*$/.test(trailing.value) ? tokens.slice(0, -1) : tokens;
                      const tail = trailing?.kind === 'text' && /^\s*$/.test(trailing.value) ? [trailing] : [];
                      commit([...head, { kind: 'text', value: nl }, { kind: 'el', name: 'p', attrs: {}, children: kids, selfClosing: false }, ...tail]);
                      setAdding(null);
                    } catch (err) {
                      setAdding({ ...adding, error: (err as Error).message });
                    }
                  }}
                >
                  {tr(lang, 'Aggiungi', 'Add', 'Dodaj')}
                </button>
                <button type="button" className="btn !py-1 !text-xs" onClick={() => setAdding(null)}>
                  {tr(lang, 'Annulla', 'Cancel', 'Anuluj')}
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className="chip" onClick={() => setAdding({ draft: '' })}>
              + {tr(lang, 'Paragrafo', 'Paragraph', 'Akapit')}
            </button>
          )}
        </div>
      )}

      {/* Menu dei tag sulla selezione */}
      {menu &&
        createPortal(
          <div className="fixed inset-0 z-40" onMouseDown={() => setMenu(null)}>
            <div
              className="card absolute z-50 max-h-[70vh] w-[22rem] overflow-y-auto p-3 shadow-xl"
              style={{ left: Math.max(8, menu.x - 176), top: Math.min(menu.y, window.innerHeight - 320) }}
              onMouseDown={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.key === 'Escape' && setMenu(null)}
            >
              <p className="mb-2 truncate text-xs text-faint">«{menu.sel.text.trim().slice(0, 60)}»</p>
              {!menu.choice ? (
                <div className="space-y-2">
                  {groups.map((g) => (
                    <div key={g.group}>
                      <p className="eyebrow !text-[0.6rem]">{g.group}</p>
                      <div className="flex flex-wrap gap-1">
                        {g.items.map((c) => (
                          <button key={c.tag.id + c.label} type="button" className="chip hover:!bg-brand-soft" title={`<${c.tag.element}>`} onClick={() => pick(c)}>
                            {c.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <form
                  className="space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const c = menu.choice!;
                    if (visibleAttrs(c).some((a) => a.required && !menu.values[a.name]?.trim())) return;
                    apply(c, menu.values);
                  }}
                >
                  <p className="font-medium">
                    {menu.choice.label} <code className="font-mono text-xs text-faint">&lt;{menu.choice.tag.element}&gt;</code>
                  </p>
                  {visibleAttrs(menu.choice).map((a, i) => {
                    const listId = a.suggest ? `ime-${a.suggest}` : undefined;
                    const opts = a.suggest === 'subtypes' ? suggestions.subtypes : a.suggest === 'placeKeys' ? suggestions.placeKeys : a.suggest === 'personKeys' ? suggestions.personKeys : a.suggest === 'entries' ? suggestions.entries.map((x) => `${x}.html`) : [];
                    const v = menu.values[a.name] ?? '';
                    const set = (x: string) => setMenu({ ...menu, values: { ...menu.values, [a.name]: x } });
                    return (
                      <label key={a.name} className="block">
                        <span className="label">
                          {a.label[lang]} <code className="normal-case text-faint">@{a.name}</code>
                        </span>
                        {a.kind === 'select' ? (
                          <select className="field !py-1.5" value={v} onChange={(e) => set(e.target.value)} autoFocus={i === 0}>
                            {a.options!.map((o) => (
                              <option key={o}>{o}</option>
                            ))}
                          </select>
                        ) : (
                          <input className="field !py-1.5" value={v} onChange={(e) => set(e.target.value)} list={listId} required={a.required} autoFocus={i === 0} autoComplete="off" />
                        )}
                        {listId && opts.length > 0 && (
                          <datalist id={listId}>
                            {opts.map((o) => (
                              <option key={o} value={o} />
                            ))}
                          </datalist>
                        )}
                      </label>
                    );
                  })}
                  <div className="flex gap-2">
                    <button type="submit" className="btn btn-primary !py-1">
                      {tr(lang, 'Inserisci', 'Insert', 'Wstaw')}
                    </button>
                    <button type="button" className="btn !py-1" onClick={() => setMenu({ ...menu, choice: undefined })}>
                      ←
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>,
          document.body
        )}

      {/* Popover su un tag esistente */}
      {pop &&
        popToken &&
        createPortal(
          <div className="fixed inset-0 z-40" onMouseDown={() => setPop(null)}>
            <div className="card absolute z-50 w-[21rem] space-y-3 p-3 shadow-xl" style={{ left: Math.max(8, pop.x), top: Math.min(pop.y, window.innerHeight - 300) }} onMouseDown={(e) => e.stopPropagation()}>
              <p className="font-mono text-xs text-brand">&lt;{popToken.name}&gt;</p>
              <p className="truncate text-sm">«{sliceText(popToken.children).trim().slice(0, 80)}»</p>
              <div className="space-y-1.5">
                {pop.attrs.map(([k, v], i) => {
                  const opts = ATTR_OPTIONS[popToken.name]?.[k];
                  const set = (nk: string, nv: string) => setPop({ ...pop, attrs: pop.attrs.map((x, j) => (j === i ? [nk, nv] : x)) });
                  return (
                    <div key={i} className="flex items-center gap-1">
                      <input className="field !w-24 !py-1 font-mono !text-xs" value={k} onChange={(e) => set(e.target.value, v)} aria-label="attributo" />
                      <input className="field !py-1 !text-xs" value={v} onChange={(e) => set(k, e.target.value)} list={opts ? `pop-${popToken.name}-${k}` : undefined} aria-label={k} />
                      {opts && (
                        <datalist id={`pop-${popToken.name}-${k}`}>
                          {opts.map((o) => (
                            <option key={o} value={o} />
                          ))}
                        </datalist>
                      )}
                      <button type="button" className="px-1 text-faint hover:text-danger" onClick={() => setPop({ ...pop, attrs: pop.attrs.filter((_, j) => j !== i) })}>
                        ×
                      </button>
                    </div>
                  );
                })}
                <button type="button" className="text-xs text-muted hover:text-brand" onClick={() => setPop({ ...pop, attrs: [...pop.attrs, ['', '']] })}>
                  + {tr(lang, 'attributo', 'attribute', 'atrybut')}
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn btn-primary !py-1 !text-xs"
                  onClick={() => {
                    commit(setTokenAttrs(tokens!, pop.path, Object.fromEntries(pop.attrs)));
                    setPop(null);
                  }}
                >
                  {tr(lang, 'Applica', 'Apply', 'Zastosuj')}
                </button>
                <button
                  type="button"
                  className="btn !py-1 !text-xs"
                  onClick={() => {
                    commit(unwrapElement(tokens!, pop.path));
                    setPop(null);
                  }}
                >
                  {tr(lang, 'Togli il tag', 'Remove tag', 'Usuń znacznik')}
                </button>
                <button
                  type="button"
                  className="btn btn-danger !py-1 !text-xs"
                  onClick={() => {
                    commit(removeToken(tokens!, pop.path));
                    setPop(null);
                  }}
                >
                  {tr(lang, 'Elimina con il testo', 'Delete with text', 'Usuń z tekstem')}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
