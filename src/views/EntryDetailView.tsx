import React, { useEffect, useRef, useState } from 'react';
import type { Language } from '../i18n/translations.ts';
import { translations, tr } from '../i18n/translations.ts';
import type { CategoryHighlightKey, CategoryToggleState, LexiconEntry } from '../types/lexicon.ts';
import { downloadFile } from '../utils/csvExport.ts';
import { VOLUMES } from '../lib/volumes.ts';
import { fetchRawXml, useEntryBody, useRawXml } from '../utils/entryBody.ts';
import { useCanEdit } from '../lib/editorApi.ts';

interface EntryDetailViewProps {
  entry: LexiconEntry;
  lang: Language;
  targetSpotId?: string;
  onNavigateEntry: (id: string) => void;
}

const CATEGORY_KEYS: CategoryHighlightKey[] = ['links', 'practice', 'belief', 'fiction', 'sign', 'senses', 'speech', 'systems', 'instruments', 'structures'];

const EDITION_NAMES: Record<string, string> = { en: 'English', it: 'Italiano', pl: 'Polski', grc: 'Ἑλληνικά', und: '—' };

const allToggles = (state: boolean): CategoryToggleState =>
  Object.fromEntries(CATEGORY_KEYS.map((k) => [k, state])) as unknown as CategoryToggleState;

function pickEdition(entry: LexiconEntry, lang: Language, deepLink: boolean): string {
  const have = entry.editions.filter((e) => e.sections.length).map((e) => e.lang);
  if (deepLink && have.includes(entry.primaryLang)) return entry.primaryLang; // spot ids only exist there
  if (have.includes(lang)) return lang;
  if (have.includes(entry.primaryLang)) return entry.primaryLang;
  return have[0] || entry.primaryLang;
}

export const EntryDetailView: React.FC<EntryDetailViewProps> = ({ entry, lang, targetSpotId, onNavigateEntry }) => {
  const t = translations[lang];
  const [activeTab, setActiveTab] = useState<'reading' | 'xml'>('reading');
  const [toggles, setToggles] = useState<CategoryToggleState>(allToggles(true));
  const [editionLang, setEditionLang] = useState(() => pickEdition(entry, lang, Boolean(targetSpotId)));
  const contentRef = useRef<HTMLElement>(null);
  const canEdit = useCanEdit();
  const body = useEntryBody(entry);
  const raw = useRawXml(entry, activeTab === 'xml');
  const htmlOf = (sec: { id: string; html: string }) => (entry.bodyLoaded === false ? body.value?.[sec.id] ?? '' : sec.html);
  const bodyPending = entry.bodyLoaded === false && !body.value;

  // Opening another entry, or following a deep link, re-selects the edition.
  useEffect(() => {
    setEditionLang(pickEdition(entry, lang, Boolean(targetSpotId)));
    setActiveTab('reading');
  }, [entry.id, targetSpotId]);

  const edition = entry.editions.find((e) => e.lang === editionLang) || entry.editions[0];
  const sections = edition ? edition.sections : entry.sections;
  const editionsAvailable = entry.editions.filter((e) => e.sections.length);
  const title = entry.titles[editionLang] || entry.title;

  const volume = VOLUMES.find((v) => v.id === entry.volume);
  const backHref = entry.collection === 'chapter' ? `#/book-chapters/${entry.volume || ''}` : '#/lexicon';
  const backLabel = entry.collection === 'chapter' ? volume?.title[lang] || (tr(lang, 'Capitoli', 'Book chapters', 'Rozdziały tomów')) : t.navLexicon;

  // Category highlights
  useEffect(() => {
    if (!contentRef.current || activeTab !== 'reading') return;
    CATEGORY_KEYS.forEach((cat) => {
      contentRef.current?.querySelectorAll(`[data-tag-category="${cat}"]`).forEach((el) => el.classList.toggle(`tag-highlight-${cat}`, toggles[cat]));
    });
  }, [toggles, activeTab, entry, editionLang, body.value]);

  // Deep link: scroll to the annotated spot and flash it
  useEffect(() => {
    if (!targetSpotId || activeTab !== 'reading') return;
    const timer = setTimeout(() => {
      const el = document.getElementById(targetSpotId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.remove('spot-highlighted');
        void (el as HTMLElement).offsetWidth;
        el.classList.add('spot-highlighted');
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [targetSpotId, activeTab, entry, editionLang, body.value]);

  const handleContentClick = (e: React.MouseEvent<HTMLElement>) => {
    const a = (e.target as HTMLElement).closest('a');
    const href = a?.getAttribute('href');
    if (href && href.startsWith('#/entry/')) {
      e.preventDefault();
      onNavigateEntry(href.replace('#/entry/', ''));
    }
  };

  const scrollToSection = (id: string) => (e: React.MouseEvent) => {
    e.preventDefault(); // hash routing: a plain #id link would navigate away
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const meta = [
    entry.authors.map((a) => a.name).join(', '),
    entry.date ? entry.date.slice(0, 4) : '',
    entry.collection === 'lexicon' && entry.scriptType !== 'Latin' ? entry.scriptType : '',
  ].filter(Boolean);

  return (
    <div className="space-y-14">
      {/* Navigation row */}
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <a href={backHref} className="text-muted hover:text-brand">
          ← {backLabel}
        </a>
        <div className="flex flex-wrap items-center gap-2">
          {(['reading', 'xml'] as const).map((id) => (
            <button key={id} type="button" className="chip" data-active={activeTab === id} onClick={() => setActiveTab(id)}>
              {id === 'reading' ? t.readingView : t.viewXml}
            </button>
          ))}
          <button
            type="button"
            onClick={async () => downloadFile(entry.rawXml || (await fetchRawXml(entry.fileName)), entry.fileName, 'application/xml')}
            className="btn"
          >
            {t.downloadXml}
          </button>
          <button type="button" onClick={() => window.print()} className="btn">
            {tr(lang, 'Stampa', 'Print', 'Drukuj')}
          </button>
          {canEdit && (
            <a href={`#/editor/edit/${entry.id}`} className="btn btn-primary">
              {tr(lang, 'Modifica', 'Edit', 'Edytuj')}
            </a>
          )}
        </div>
      </div>

      {/* Title */}
      <header className="space-y-5">
        <p className="eyebrow">{entry.collection === 'chapter' ? `${tr(lang, 'Capitolo', 'Chapter', 'Rozdział')} · ${volume?.title[lang] || ''}` : tr(lang, 'LARES · Lessico', 'LARES Lexicon', 'LARES · Leksykon')}</p>
        <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
          <h1 className="page-title">{title}</h1>
          {entry.collection === 'lexicon' && entry.originalScript && entry.originalScript !== title && (
            <span className="text-3xl text-muted" lang={entry.xmlLang}>
              {entry.originalScript}
            </span>
          )}
        </div>
        {meta.length > 0 && <p className="text-lg text-muted">{meta.join(' · ')}</p>}
        {entry.originalPublication && <p className="max-w-3xl text-[0.95rem] italic leading-snug text-faint">{entry.originalPublication}</p>}

        {editionsAvailable.length > 1 && (
          <div className="no-print flex items-center gap-1 pt-1" role="tablist" aria-label={tr(lang, 'Lingua del testo', 'Text language', 'Język tekstu')}>
            {editionsAvailable.map((ed) => (
              <button key={ed.lang} type="button" role="tab" aria-selected={ed.lang === editionLang} className="chip chip-box" data-active={ed.lang === editionLang} onClick={() => setEditionLang(ed.lang)}>
                {EDITION_NAMES[ed.lang] || ed.lang}
              </button>
            ))}
          </div>
        )}
      </header>

      {activeTab === 'reading' && (
        <div className="grid items-start gap-14 xl:grid-cols-[11rem_minmax(0,1fr)]">
          <aside className="no-print xl:sticky xl:top-10">
            {/* narrow screens: one folded block; wide screens: a quiet margin column */}
            <details className="border-y border-line py-3 xl:hidden">
              <summary className="cursor-pointer select-none text-muted hover:text-brand">
                {tr(lang, 'Indice e evidenziazioni', 'Contents and highlights', 'Spis treści i wyróżnienia')}
              </summary>
              <div className="mt-6 space-y-8">
            {sections.filter((sec) => sec.head).length > 1 && (
              <nav aria-label="Table of contents">
                <p className="label">{t.tableOfContents}</p>
                <ul className="space-y-1.5">
                  {sections.filter((sec) => sec.head).map((sec) => (
                    <li key={sec.id}>
                      <a href={`#${sec.id}`} onClick={scrollToSection(sec.id)} className="block py-0.5 leading-snug text-muted hover:text-brand">
                        {sec.head || '—'}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            )}
            <div className="tag-highlight-toolbar border-t border-line pt-5">
              <div className="mb-2 flex items-center justify-between">
                <p className="label !mb-0">{t.showHideHighlights}</p>
                <div className="flex gap-2 text-sm text-faint">
                  <button type="button" onClick={() => setToggles(allToggles(true))} className="hover:text-brand">
                    {t.showAll}
                  </button>
                  <span>·</span>
                  <button type="button" onClick={() => setToggles(allToggles(false))} className="hover:text-brand">
                    {t.hideAll}
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-x-1 gap-y-0.5">
                {CATEGORY_KEYS.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setToggles((p) => ({ ...p, [cat]: !p[cat] }))}
                    aria-pressed={toggles[cat]}
                    className="chip"
                    data-active={toggles[cat]}
                  >
                    {t[`cat${cat.charAt(0).toUpperCase() + cat.slice(1)}` as keyof typeof t] || cat}
                  </button>
                ))}
              </div>
            </div>
              </div>
            </details>
            <div className="hidden space-y-8 xl:block">
            {sections.filter((sec) => sec.head).length > 1 && (
              <nav aria-label="Table of contents">
                <p className="label">{t.tableOfContents}</p>
                <ul className="space-y-1.5">
                  {sections.filter((sec) => sec.head).map((sec) => (
                    <li key={sec.id}>
                      <a href={`#${sec.id}`} onClick={scrollToSection(sec.id)} className="block py-0.5 leading-snug text-muted hover:text-brand">
                        {sec.head || '—'}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            )}
            <div className="tag-highlight-toolbar border-t border-line pt-5">
              <div className="mb-2 flex items-center justify-between">
                <p className="label !mb-0">{t.showHideHighlights}</p>
                <div className="flex gap-2 text-sm text-faint">
                  <button type="button" onClick={() => setToggles(allToggles(true))} className="hover:text-brand">
                    {t.showAll}
                  </button>
                  <span>·</span>
                  <button type="button" onClick={() => setToggles(allToggles(false))} className="hover:text-brand">
                    {t.hideAll}
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-x-1 gap-y-0.5">
                {CATEGORY_KEYS.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setToggles((p) => ({ ...p, [cat]: !p[cat] }))}
                    aria-pressed={toggles[cat]}
                    className="chip"
                    data-active={toggles[cat]}
                  >
                    {t[`cat${cat.charAt(0).toUpperCase() + cat.slice(1)}` as keyof typeof t] || cat}
                  </button>
                ))}
              </div>
            </div>
            </div>
          </aside>

          <article ref={contentRef} onClick={handleContentClick} className="min-w-0 space-y-16">
            {sections.map((sec) => (
              <section key={sec.id} id={sec.id} className="scroll-mt-10 space-y-5">
                {sec.head && <h2 className="border-b border-line pb-2 text-3xl font-medium">{sec.head}</h2>}
                {bodyPending ? (
                  <div className="space-y-3" aria-busy="true" aria-label="…">
                    <div className="h-4 w-full animate-pulse rounded bg-slate-soft" />
                    <div className="h-4 w-11/12 animate-pulse rounded bg-slate-soft" />
                    <div className="h-4 w-4/5 animate-pulse rounded bg-slate-soft" />
                  </div>
                ) : (
                  <div className="entry-html-content scholarly-prose" dangerouslySetInnerHTML={{ __html: htmlOf(sec) }} />
                )}
              </section>
            ))}
          </article>
        </div>
      )}

      {activeTab === 'xml' && (
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-line bg-surface-2 px-4 py-2 font-mono text-xs text-faint">
            <span>{entry.fileName} — EpiDoc TEI XML</span>
            {canEdit && (
              <a href={`#/editor/edit/${entry.id}`} className="text-brand hover:underline">
                {tr(lang, 'Apri nell’editor', 'Open in editor', 'Otwórz w edytorze')}
              </a>
            )}
          </div>
          <pre className="max-h-[720px] overflow-auto p-4 font-mono text-[0.8125rem] leading-relaxed">
            <code>{raw.value ?? (raw.error ? raw.error : '…')}</code>
          </pre>
        </div>
      )}
    </div>
  );
};
