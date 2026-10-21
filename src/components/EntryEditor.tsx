import React, { useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Language } from '../i18n/translations.ts';
import type { LexiconEntry } from '../types/lexicon.ts';
import { parseEpiDocXml } from '../utils/xmlParser.ts';
import { downloadFile } from '../utils/csvExport.ts';
import { applyTagToRange } from '../lib/markup.ts';
import { browserParse, validateEntryXml, type Issue } from '../lib/validateEntry.ts';
import { entryIdFromFileName } from '../lib/entryTemplate.ts';
import { ApiError, saveEntry, type GithubResult } from '../lib/editorApi.ts';
import { MarkupToolbar, type Suggestions } from './MarkupToolbar.tsx';

interface Props {
  lang: Language;
  entries: LexiconEntry[];
  fileName: string;
  initialXml: string;
  isNew: boolean;
  onSaved: () => Promise<void> | void;
}

type Pane = 'preview' | 'issues' | 'indices';

const T = {
  it: {
    back: '← Tutte le schede',
    newEntry: 'Nuova scheda',
    unsaved: 'Modifiche non salvate',
    saved: 'Tutto salvato',
    save: 'Salva',
    saving: 'Salvataggio…',
    revert: 'Annulla modifiche',
    download: 'Scarica XML',
    preview: 'Anteprima',
    issues: 'Controlli',
    indices: 'Indici',
    noIssues: 'Nessun problema: la scheda è valida.',
    errorOne: 'errore',
    warnOne: 'avviso',
    revNote: 'Nota di revisione (facoltativa)',
    revWho: 'Sigla',
    line: 'Riga',
    col: 'Col.',
    confirmLeave: 'Ci sono modifiche non salvate. Uscire comunque?',
    cannotSave: 'Correggi gli errori prima di salvare.',
    savedLocal: 'Salvata. GitHub non è configurato: il file è solo sul disco del server.',
    savedGit: 'Salvata e pubblicata su GitHub',
    savedGitFail: 'Salvata sul server, ma la pubblicazione su GitHub è fallita',
    sources: 'Fonti antiche',
    realms: 'Ambiti',
    characters: 'Personaggi',
    historical: 'Figure storiche',
    places: 'Luoghi',
    terms: 'Termini',
    links: 'Rimandi',
    empty: 'Nessun elemento marcato. Seleziona del testo nell’XML e usa la barra dei tag.',
    previewFail: 'Anteprima non disponibile finché l’XML non è ben formato.',
    typeHere: 'Seleziona un passo del testo e premi un tag nella barra sopra.',
  },
  en: {
    back: '← All entries',
    newEntry: 'New entry',
    unsaved: 'Unsaved changes',
    saved: 'All saved',
    save: 'Save',
    saving: 'Saving…',
    revert: 'Discard changes',
    download: 'Download XML',
    preview: 'Preview',
    issues: 'Checks',
    indices: 'Indices',
    noIssues: 'No problems: the entry is valid.',
    errorOne: 'error',
    warnOne: 'warning',
    revNote: 'Revision note (optional)',
    revWho: 'Initials',
    line: 'Line',
    col: 'Col',
    confirmLeave: 'You have unsaved changes. Leave anyway?',
    cannotSave: 'Fix the errors before saving.',
    savedLocal: 'Saved. GitHub is not configured: the file is only on the server disk.',
    savedGit: 'Saved and published to GitHub',
    savedGitFail: 'Saved on the server, but publishing to GitHub failed',
    sources: 'Ancient sources',
    realms: 'Realms',
    characters: 'Characters',
    historical: 'Historical figures',
    places: 'Places',
    terms: 'Terms',
    links: 'Cross-references',
    empty: 'Nothing marked up yet. Select text in the XML and use the tag bar.',
    previewFail: 'Preview is unavailable until the XML is well-formed.',
    typeHere: 'Select a passage of the text and press a tag in the bar above.',
  },
  pl: {
    back: '← Wszystkie hasła',
    newEntry: 'Nowe hasło',
    unsaved: 'Niezapisane zmiany',
    saved: 'Wszystko zapisane',
    save: 'Zapisz',
    saving: 'Zapisywanie…',
    revert: 'Odrzuć zmiany',
    download: 'Pobierz XML',
    preview: 'Podgląd',
    issues: 'Kontrole',
    indices: 'Indeksy',
    noIssues: 'Brak problemów: hasło jest poprawne.',
    errorOne: 'błąd',
    warnOne: 'ostrzeżenie',
    revNote: 'Notatka o zmianie (opcjonalna)',
    revWho: 'Inicjały',
    line: 'Wiersz',
    col: 'Kol.',
    confirmLeave: 'Masz niezapisane zmiany. Wyjść mimo to?',
    cannotSave: 'Popraw błędy przed zapisem.',
    savedLocal: 'Zapisano. GitHub nie jest skonfigurowany: plik znajduje się tylko na dysku serwera.',
    savedGit: 'Zapisano i opublikowano na GitHubie',
    savedGitFail: 'Zapisano na serwerze, ale publikacja na GitHubie się nie powiodła',
    sources: 'Źródła starożytne',
    realms: 'Dziedziny',
    characters: 'Postacie',
    historical: 'Postacie historyczne',
    places: 'Miejsca',
    terms: 'Terminy',
    links: 'Odsyłacze',
    empty: 'Nic jeszcze nie oznaczono. Zaznacz tekst w XML i użyj paska znaczników.',
    previewFail: 'Podgląd jest niedostępny, dopóki XML nie jest poprawnie zbudowany.',
    typeHere: 'Zaznacz fragment tekstu i naciśnij znacznik na pasku powyżej.',
  },
} as const;

const ANNOTATION_RE = /<(w|ref|rs|persName|placeName|hi)\b[^>]*>/g;

/** Finds the innermost annotation element enclosing `pos` (single-level scan). */
function findEnclosingTag(src: string, pos: number): { openStart: number; openEnd: number; closeStart: number; closeEnd: number } | null {
  let best: ReturnType<typeof findEnclosingTag> = null;
  for (const m of src.matchAll(ANNOTATION_RE)) {
    const openStart = m.index!;
    const openEnd = openStart + m[0].length;
    if (m[0].endsWith('/>')) continue;
    const close = `</${m[1]}>`;
    const closeStart = src.indexOf(close, openEnd);
    if (closeStart < 0) continue;
    const closeEnd = closeStart + close.length;
    if (openStart <= pos && pos <= closeEnd) best = { openStart, openEnd, closeStart, closeEnd };
  }
  return best;
}

export const EntryEditor: React.FC<Props> = ({ lang, entries, fileName, initialXml, isNew, onSaved }) => {
  const t = T[lang];
  const [xml, setXml] = useState(initialXml);
  const [pane, setPane] = useState<Pane>('preview');
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState<{ kind: 'ok' | 'warn' | 'error'; text: string } | null>(null);
  const [serverIssues, setServerIssues] = useState<Issue[] | null>(null);
  const [revNote, setRevNote] = useState('');
  const [revWho, setRevWho] = useState(() => {
    try {
      return localStorage.getItem('lares_editor_who') || '';
    } catch {
      return '';
    }
  });
  const [cursor, setCursor] = useState({ line: 1, col: 1 });
  const [created, setCreated] = useState(!isNew);

  const taRef = useRef<HTMLTextAreaElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const pendingSel = useRef<{ start: number; end: number } | null>(null);

  const dirty = xml.trimEnd() !== initialXml.trimEnd() || !created;
  const deferredXml = useDeferredValue(xml);

  // ── Derived data ───────────────────────────────────────────────────────────
  const knownIds = useMemo(() => entries.map((e) => e.id.toLowerCase()), [entries]);

  const suggestions: Suggestions = useMemo(() => {
    const uniq = (xs: string[]) => Array.from(new Set(xs.filter(Boolean))).sort((a, b) => a.localeCompare(b));
    return {
      subtypes: uniq(entries.flatMap((e) => e.indexedData.realms.map((r) => r.subtype))),
      placeKeys: uniq(entries.flatMap((e) => e.indexedData.places.map((p) => p.key))),
      personKeys: uniq(entries.flatMap((e) => [...e.indexedData.characters.map((c) => c.key), ...e.indexedData.historicalFigures.map((h) => h.key)])),
      entries: uniq(entries.map((e) => e.fileName.replace(/\.xml$/, ''))),
    };
  }, [entries]);

  const issues = useMemo(
    () => validateEntryXml(deferredXml, { parse: browserParse, fileName, knownEntryIds: knownIds, lang }),
    [deferredXml, fileName, knownIds, lang]
  );
  const errorCount = issues.filter((i) => i.level === 'error').length;
  const warnCount = issues.length - errorCount;

  const parsed = useMemo(() => {
    if (browserParse(deferredXml).errors.length) return null;
    const { entry } = parseEpiDocXml(deferredXml, fileName);
    return entry || null;
  }, [deferredXml, fileName]);

  useEffect(() => {
    const root = previewRef.current;
    if (!root) return;
    root.querySelectorAll<HTMLElement>('[data-tag-category]').forEach((el) => {
      el.classList.add(`tag-highlight-${el.getAttribute('data-tag-category')}`);
    });
  }, [parsed, pane]);

  // Warn before closing the tab with unsaved work.
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  // ── Text manipulation ──────────────────────────────────────────────────────
  useLayoutEffect(() => {
    if (pendingSel.current && taRef.current) {
      const { start, end } = pendingSel.current;
      taRef.current.setSelectionRange(start, end);
      pendingSel.current = null;
    }
  });

  /** Replaces [start,end) keeping the browser undo stack when possible. */
  const replaceRange = useCallback((start: number, end: number, text: string, selStart: number, selEnd: number) => {
    const ta = taRef.current;
    if (!ta) return;
    ta.focus();
    ta.setSelectionRange(start, end);
    const ok = typeof document.execCommand === 'function' && document.execCommand('insertText', false, text);
    if (!ok) {
      const next = ta.value.slice(0, start) + text + ta.value.slice(end);
      setXml(next);
    }
    pendingSel.current = { start: selStart, end: selEnd };
    // execCommand fires `input` synchronously; make sure the selection sticks afterwards.
    requestAnimationFrame(() => ta.setSelectionRange(selStart, selEnd));
  }, []);

  const handleApply = (element: string, attrs: Record<string, string>) => {
    const ta = taRef.current;
    if (!ta) return;
    const { selectionStart: s, selectionEnd: e, value } = ta;
    const { text, selStart, selEnd } = applyTagToRange(value, s, e, element, attrs);
    replaceRange(s, e, text.slice(s, text.length - (value.length - e)), selStart, selEnd);
  };

  const handleUnwrap = () => {
    const ta = taRef.current;
    if (!ta) return;
    const tag = findEnclosingTag(ta.value, ta.selectionStart);
    if (!tag) return;
    const inner = ta.value.slice(tag.openEnd, tag.closeStart);
    replaceRange(tag.openStart, tag.closeEnd, inner, tag.openStart, tag.openStart + inner.length);
  };

  const handleInsertBlock = (snippet: string) => {
    const ta = taRef.current;
    if (!ta) return;
    const pos = ta.selectionEnd;
    const lineEnd = ta.value.indexOf('\n', pos);
    const at = lineEnd < 0 ? ta.value.length : lineEnd + 1;
    replaceRange(at, at, snippet, at, at + snippet.length);
  };

  const updateCursor = () => {
    const ta = taRef.current;
    if (!ta) return;
    const before = ta.value.slice(0, ta.selectionStart);
    const line = before.split('\n').length;
    setCursor({ line, col: ta.selectionStart - before.lastIndexOf('\n') });
  };

  const jumpTo = (offset: number, length = 0) => {
    const ta = taRef.current;
    if (!ta) return;
    ta.focus();
    ta.setSelectionRange(offset, offset + length);
    const lineNo = ta.value.slice(0, offset).split('\n').length;
    ta.scrollTop = Math.max(0, (lineNo - 4) * 21);
    updateCursor();
  };

  const jumpToIssue = (issue: Issue) => {
    if (issue.line) {
      const lines = xml.split('\n');
      jumpTo(lines.slice(0, issue.line - 1).reduce((n, l) => n + l.length + 1, 0));
      return;
    }
    if (issue.snippet) {
      const needle = issue.snippet.replace(/…$/, '');
      const idx = xml.indexOf(needle);
      if (idx >= 0) jumpTo(idx, needle.length);
    }
  };

  // Tab inserts two spaces instead of leaving the field.
  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault();
      const ta = e.currentTarget;
      replaceRange(ta.selectionStart, ta.selectionEnd, '  ', ta.selectionStart + 2, ta.selectionStart + 2);
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      void handleSave();
    }
  };

  // ── Save ───────────────────────────────────────────────────────────────────
  const withRevision = (src: string): string => {
    if (!revNote.trim() || isNew) return src;
    const today = new Date().toISOString().slice(0, 10);
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
    const change = `      <change when="${today}" who="${esc(revWho.trim())}">${esc(revNote.trim())}</change>\n`;
    return src.includes('</revisionDesc>') ? src.replace(/(\s*)<\/revisionDesc>/, `\n${change.trimEnd()}$1</revisionDesc>`) : src;
  };

  const handleSave = async () => {
    if (saving) return;
    if (errorCount > 0) {
      setBanner({ kind: 'error', text: t.cannotSave });
      setPane('issues');
      return;
    }
    setSaving(true);
    setBanner(null);
    setServerIssues(null);
    try {
      const finalXml = withRevision(xml);
      try {
        if (revWho.trim()) localStorage.setItem('lares_editor_who', revWho.trim());
      } catch {
        /* preference not persisted */
      }
      const res = await saveEntry(fileName, finalXml, isNew && !created);
      setXml(finalXml);
      setRevNote('');
      const g: GithubResult = res.github;
      setBanner(
        g.status === 'committed'
          ? { kind: 'ok', text: t.savedGit }
          : g.status === 'failed'
            ? { kind: 'warn', text: `${t.savedGitFail}: ${g.error}` }
            : { kind: 'ok', text: t.savedLocal }
      );
      setCreated(true);
      await onSaved();
      if (isNew) window.location.hash = `#/editor/edit/${entryIdFromFileName(fileName)}`;
    } catch (e) {
      const err = e as ApiError;
      setBanner({ kind: 'error', text: err.message });
      if (err.issues) {
        setServerIssues(err.issues);
        setPane('issues');
      }
    } finally {
      setSaving(false);
    }
  };

  const shownIssues = serverIssues && errorCount === 0 ? serverIssues : issues;

  const indexGroups: Array<[string, Array<{ label: string; detail?: string }>]> = parsed
    ? [
        [t.sources, parsed.indexedData.sources.map((s) => ({ label: s.text, detail: s.type }))],
        [t.realms, parsed.indexedData.realms.map((r) => ({ label: r.text, detail: [r.type, r.subtype].filter(Boolean).join(' · ') }))],
        [t.characters, parsed.indexedData.characters.map((c) => ({ label: c.name, detail: `${c.type} · ${c.key}` }))],
        [t.historical, parsed.indexedData.historicalFigures.map((h) => ({ label: h.name, detail: h.key }))],
        [t.places, parsed.indexedData.places.map((p) => ({ label: p.name, detail: p.key }))],
        [t.terms, parsed.indexedData.terms.map((x) => ({ label: x.text, detail: x.lemma }))],
        [t.links, parsed.indexedData.crossLinks.map((l) => ({ label: l.text, detail: l.corresp }))],
      ]
    : [];
  const totalMarked = indexGroups.reduce((n, [, items]) => n + items.length, 0);

  const leave = (e: React.MouseEvent) => {
    if (dirty && !window.confirm(t.confirmLeave)) e.preventDefault();
  };

  return (
    <div className="space-y-4">
      {/* Action bar */}
      <div className="flex flex-wrap items-center gap-3 border-b border-line pb-4">
        <a href="#/editor" onClick={leave} className="text-sm text-muted hover:text-brand">
          {t.back}
        </a>
        <div className="min-w-[14rem] flex-1">
          <h1 className="truncate font-serif text-3xl font-medium">{parsed?.title || (isNew ? t.newEntry : fileName)}</h1>
          <p className="font-mono text-xs text-faint">
            {fileName} · <span className={dirty ? 'text-warn' : 'text-ok'}>{dirty ? t.unsaved : t.saved}</span>
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
        {!isNew && (
          <input
            className="field !w-28 !py-1.5 !text-xs"
            value={revWho}
            onChange={(e) => setRevWho(e.target.value)}
            placeholder={t.revWho}
            aria-label={t.revWho}
          />
        )}
        {!isNew && (
          <input
            className="field !w-56 !py-1.5 !text-xs"
            value={revNote}
            onChange={(e) => setRevNote(e.target.value)}
            placeholder={t.revNote}
            aria-label={t.revNote}
          />
        )}
        <button type="button" className="btn" onClick={() => downloadFile(xml, fileName, 'application/xml')}>
          {t.download}
        </button>
        <button
          type="button"
          className="btn"
          disabled={!dirty}
          onClick={() => {
            if (window.confirm(t.revert + '?')) {
              setXml(initialXml);
              setBanner(null);
            }
          }}
        >
          {t.revert}
        </button>
        <button type="button" className="btn btn-primary" onClick={handleSave} disabled={saving || (!dirty && !isNew)}>
          {saving ? t.saving : t.save}
          {errorCount > 0 && !saving && <span className="rounded bg-danger px-1.5 text-[0.625rem] text-white">{errorCount}</span>}
        </button>
        </div>
      </div>

      {banner && (
        <div
          role="status"
          className={`rounded-xl border px-4 py-2.5 text-sm ${
            banner.kind === 'ok' ? 'border-ok/40 bg-ok/10 text-ok' : banner.kind === 'warn' ? 'border-warn/40 bg-warn/10 text-warn' : 'border-danger/40 bg-danger/10 text-danger'
          }`}
        >
          {banner.text}
        </div>
      )}

      <MarkupToolbar
        lang={lang}
        suggestions={suggestions}
        getSelection={() => {
          const ta = taRef.current;
          return ta ? ta.value.slice(ta.selectionStart, ta.selectionEnd) : '';
        }}
        onApply={handleApply}
        onUnwrap={handleUnwrap}
        onInsertBlock={handleInsertBlock}
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        {/* Source */}
        <div className="card flex min-w-0 flex-col overflow-hidden">
          <textarea
            ref={taRef}
            value={xml}
            onChange={(e) => setXml(e.target.value)}
            onKeyDown={onKeyDown}
            onKeyUp={updateCursor}
            onClick={updateCursor}
            onSelect={updateCursor}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            wrap="off"
            aria-label="EpiDoc TEI XML"
            className="xml-editor h-[68vh] w-full bg-transparent p-4 text-ink outline-none"
          />
          <div className="flex items-center justify-between border-t border-line bg-surface-2 px-3 py-1.5 font-mono text-[0.6875rem] text-faint">
            <span>{t.typeHere}</span>
            <span>
              {t.line} {cursor.line}, {t.col} {cursor.col}
            </span>
          </div>
        </div>

        {/* Side panel */}
        <div className="card flex min-w-0 flex-col overflow-hidden">
          <div className="flex items-center gap-1 border-b border-line p-2" role="tablist">
            {(
              [
                ['preview', t.preview, null],
                ['issues', t.issues, errorCount + warnCount],
                ['indices', t.indices, totalMarked],
              ] as Array<[Pane, string, number | null]>
            ).map(([id, label, count]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={pane === id}
                onClick={() => setPane(id)}
                className={`rounded-lg px-3 py-1.5 text-base transition-colors ${
                  pane === id ? 'bg-brand-soft text-brand' : 'text-muted hover:bg-surface-2'
                }`}
              >
                {label}
                {count !== null && (
                  <span
                    className={`ml-1.5 rounded-full px-1.5 text-[0.6875rem] ${
                      id === 'issues' && errorCount > 0 ? 'bg-danger text-white' : id === 'issues' && warnCount > 0 ? 'bg-warn/20 text-warn' : 'bg-surface-2 text-faint'
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="h-[68vh] overflow-auto p-5 xl:h-[calc(68vh+2rem)]">
            {pane === 'preview' &&
              (parsed ? (
                <div ref={previewRef} className="space-y-6">
                  <div>
                    <h2 className="font-serif text-3xl font-medium">{parsed.title}</h2>
                    {parsed.lemma && parsed.lemma !== parsed.title && <p className="font-serif text-xl text-muted">{parsed.lemma}</p>}
                  </div>
                  {parsed.sections.map((s) => (
                    <section key={s.id} className="space-y-2">
                      <h3 className="border-b border-line pb-1 font-serif text-xl font-medium">{s.head}</h3>
                      <div className="scholarly-prose !text-[1.05rem]" dangerouslySetInnerHTML={{ __html: s.html }} />
                    </section>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-faint">{t.previewFail}</p>
              ))}

            {pane === 'issues' &&
              (shownIssues.length === 0 ? (
                <p className="rounded-xl border border-ok/40 bg-ok/10 px-4 py-3 text-sm text-ok">{t.noIssues}</p>
              ) : (
                <ul className="space-y-2">
                  {shownIssues.map((i, idx) => (
                    <li key={idx}>
                      <button
                        type="button"
                        onClick={() => jumpToIssue(i)}
                        className="w-full rounded-xl border border-line p-3 text-left transition-colors hover:border-brand"
                      >
                        <span className={`mr-2 rounded px-1.5 py-0.5 text-[0.625rem] font-semibold uppercase ${i.level === 'error' ? 'bg-danger text-white' : 'bg-warn/20 text-warn'}`}>
                          {i.level === 'error' ? t.errorOne : t.warnOne}
                        </span>
                        <span className="text-sm">{i.message}</span>
                        {i.snippet && <span className="mt-1 block truncate font-mono text-xs text-faint">“{i.snippet}”</span>}
                        {i.line && <span className="mt-1 block font-mono text-xs text-faint">{t.line} {i.line}</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              ))}

            {pane === 'indices' &&
              (totalMarked === 0 ? (
                <p className="text-sm text-faint">{parsed ? t.empty : t.previewFail}</p>
              ) : (
                <div className="space-y-5">
                  {indexGroups
                    .filter(([, items]) => items.length > 0)
                    .map(([label, items]) => (
                      <div key={label}>
                        <p className="label">
                          {label} <span className="text-faint">({items.length})</span>
                        </p>
                        <ul className="divide-y divide-line rounded-xl border border-line text-sm">
                          {items.map((it, i) => (
                            <li key={i} className="flex items-baseline justify-between gap-3 px-3 py-1.5">
                              <span className="truncate font-serif text-base">{it.label}</span>
                              {it.detail && <span className="shrink-0 font-mono text-xs text-faint">{it.detail}</span>}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
};
