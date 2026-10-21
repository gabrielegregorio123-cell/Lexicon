import React, { useEffect, useMemo, useState } from 'react';
import type { Language } from '../i18n/translations.ts';
import { translations, tr } from '../i18n/translations.ts';
import { greekToLatin } from '../utils/greekNormalizer.ts';
import type { LexiconEntry } from '../types/lexicon.ts';
import {
  aggregateAncientSources,
  aggregateCharacters,
  aggregateHistoricalFigures,
  aggregatePlaces,
  aggregateRealms,
  aggregateTerms,
  SpotLink,
} from '../utils/indexAggregator.ts';
import {
  exportAncientSourcesCSV,
  exportCharactersCSV,
  exportHistoricalCSV,
  exportPlacesCSV,
  exportRealmsCSV,
  exportTermsCSV,
} from '../utils/csvExport.ts';

export type IndexTab = 'sources' | 'realms' | 'terms' | 'characters' | 'historical' | 'places';

interface IndicesViewProps {
  entries: LexiconEntry[];
  lang: Language;
  initialTab?: IndexTab;
  onNavigateToSpot: (entryId: string, spotId: string) => void;
}

const PAGE = 60;
const ABC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

interface Row {
  key: string;
  label: string;
  sub?: string;
  count: number;
  refs: SpotLink[];
  /** Latin initial (Greek is transliterated), '#' for anything else. */
  initial: string;
  sortKey: string;
  href?: string;
}

const initialOf = (label: string): { initial: string; sortKey: string } => {
  const latin = greekToLatin(label).replace(/^[^a-z0-9]+/, '');
  const ch = latin.charAt(0).toUpperCase();
  return { initial: /[A-Z]/.test(ch) ? ch : '#', sortKey: latin };
};

const SOURCE_TYPE: Record<string, [string, string, string]> = {
  lit: ['letteraria', 'literary', 'literacka'],
  ins: ['epigrafica', 'inscription', 'inskrypcja'],
  pap: ['papirologica', 'papyrus', 'papirus'],
  author: ['autore', 'author', 'autor'],
  myth: ['mito', 'myth', 'mit'],
};

const DESCRIPTIONS: Record<IndexTab, [string, string, string]> = {
  sources: ['Autori e opere antiche citati nelle schede, per tipo di fonte.', 'Ancient authors and works cited in the entries, by type of source.', 'Autorzy i dzieła starożytne cytowane w hasłach, według typu źródła.'],
  realms: ['I termini classificati per ambito del tesauro e sottocategoria.', 'Terms classified by thesaurus realm and subtype.', 'Terminy sklasyfikowane według dziedziny tezaurusa i podtypu.'],
  terms: ['Parole greche e latine con il loro lemma, collegate a Logeion.', 'Greek and Latin words with their lemma, linked to Logeion.', 'Słowa greckie i łacińskie z lematem, powiązane z Logeionem.'],
  characters: ['Divinità, eroi e figure mitiche o letterarie.', 'Deities, heroes and mythical or literary figures.', 'Bóstwa, herosi oraz postacie mityczne i literackie.'],
  historical: ['Persone storiche menzionate nelle schede.', 'Historical people mentioned in the entries.', 'Postacie historyczne wymienione w hasłach.'],
  places: ['Santuari, città e regioni.', 'Sanctuaries, cities and regions.', 'Sanktuaria, miasta i regiony.'],
};

export const IndicesView: React.FC<IndicesViewProps> = ({
  entries,
  lang,
  initialTab = 'sources',
  onNavigateToSpot,
}) => {
  const [activeTab, setActiveTab] = useState<IndexTab>(initialTab);
  // The router keeps this view mounted when only the sub-route changes
  React.useEffect(() => setActiveTab(initialTab), [initialTab]);
  const [collectionFilter, setCollectionFilter] = useState<'all' | 'lexicon' | 'chapter'>('all');
  const [filterQuery, setFilterQuery] = useState('');
  const [sortBy, setSortBy] = useState<'alpha' | 'count'>('alpha');
  const [letter, setLetter] = useState<string>('');
  const [shown, setShown] = useState(PAGE);
  const t = translations[lang];

  const lexiconCount = useMemo(() => entries.filter((e) => (e.collection || 'lexicon') === 'lexicon').length, [entries]);
  const sacrificiumCount = useMemo(() => entries.filter((e) => e.collection === 'chapter').length, [entries]);

  const filteredEntriesByCollection = useMemo(() => {
    if (collectionFilter === 'all') return entries;
    return entries.filter((e) => (e.collection || 'lexicon') === collectionFilter);
  }, [entries, collectionFilter]);

  const sourcesData = useMemo(() => aggregateAncientSources(filteredEntriesByCollection), [filteredEntriesByCollection]);
  const realmsData = useMemo(() => aggregateRealms(filteredEntriesByCollection), [filteredEntriesByCollection]);
  const termsData = useMemo(() => aggregateTerms(filteredEntriesByCollection), [filteredEntriesByCollection]);
  const charactersData = useMemo(() => aggregateCharacters(filteredEntriesByCollection), [filteredEntriesByCollection]);
  const historicalData = useMemo(() => aggregateHistoricalFigures(filteredEntriesByCollection), [filteredEntriesByCollection]);
  const placesData = useMemo(() => aggregatePlaces(filteredEntriesByCollection), [filteredEntriesByCollection]);

  const tabs = [
    { key: 'sources', label: t.idxSources, count: sourcesData.length },
    { key: 'realms', label: t.idxRealms, count: realmsData.length },
    { key: 'terms', label: t.idxTerms, count: termsData.length },
    { key: 'characters', label: t.idxCharacters, count: charactersData.length },
    { key: 'historical', label: t.idxHistorical, count: historicalData.length },
    { key: 'places', label: t.idxPlaces, count: placesData.length },
  ];

  const handleExportCSV = () => {
    switch (activeTab) {
      case 'sources':
        exportAncientSourcesCSV(
          sourcesData.map((s) => ({
            source: s.source,
            type: s.type,
            entries: s.entries.map((e) => e.title),
            count: s.count,
          }))
        );
        break;
      case 'realms':
        exportRealmsCSV(
          realmsData.map((r) => ({
            type: r.type,
            subtype: r.subtype,
            term: r.term,
            entries: r.entries.map((e) => e.title),
            count: r.count,
          }))
        );
        break;
      case 'terms':
        exportTermsCSV(
          termsData.map((t) => ({
            lemma: t.lemma,
            script: t.script,
            logeionUrl: t.logeionUrl,
            entries: t.entries.map((e) => e.title),
            count: t.count,
          }))
        );
        break;
      case 'characters':
        exportCharactersCSV(
          charactersData.map((c) => ({
            name: c.name,
            type: c.type,
            key: c.canonicalKey,
            entries: c.entries.map((e) => e.title),
            count: c.count,
          }))
        );
        break;
      case 'historical':
        exportHistoricalCSV(
          historicalData.map((h) => ({
            name: h.name,
            key: h.canonicalKey,
            entries: h.entries.map((e) => e.title),
            count: h.count,
          }))
        );
        break;
      case 'places':
        exportPlacesCSV(
          placesData.map((p) => ({
            name: p.name,
            key: p.canonicalKey,
            entries: p.entries.map((e) => e.title),
            count: p.count,
          }))
        );
        break;
    }
  };

  // ── Rows: every index is shown in the same shape ───────────────────────────
  const rows: Row[] = useMemo(() => {
    const mk = (key: string, label: string, count: number, refs: SpotLink[], sub?: string, href?: string): Row => ({ key, label, sub, count, refs, href, ...initialOf(label) });
    switch (activeTab) {
      case 'sources':
        return sourcesData.map((s) => mk(s.key, s.source, s.count, s.references, SOURCE_TYPE[s.type] ? SOURCE_TYPE[s.type][lang === 'it' ? 0 : lang === 'pl' ? 2 : 1] : s.type));
      case 'realms':
        return realmsData.map((r) => mk(r.key, r.term, r.count, r.references, [r.type, r.subtype].filter(Boolean).join(' · ')));
      case 'terms':
        return termsData.map((x) => mk(x.key, x.lemma, x.count, x.references, undefined, x.logeionUrl));
      case 'characters':
        return charactersData.map((c) => mk(c.key, c.name, c.count, c.references, [c.type, c.canonicalKey !== c.name ? c.canonicalKey : ''].filter(Boolean).join(' · ')));
      case 'historical':
        return historicalData.map((h) => mk(h.key, h.name, h.count, h.references, h.canonicalKey !== h.name ? h.canonicalKey : undefined));
      case 'places':
        return placesData.map((p) => mk(p.key, p.name, p.count, p.references, p.canonicalKey !== p.name ? p.canonicalKey : undefined));
    }
  }, [activeTab, sourcesData, realmsData, termsData, charactersData, historicalData, placesData, lang]);

  const query = greekToLatin(filterQuery.trim());
  const searched = useMemo(
    () => (query ? rows.filter((r) => greekToLatin(`${r.label} ${r.sub || ''}`).includes(query)) : rows),
    [rows, query]
  );
  const available = useMemo(() => new Set(searched.map((r) => r.initial)), [searched]);
  const visible = useMemo(() => {
    const list = letter && !query ? searched.filter((r) => r.initial === letter) : searched;
    const alpha = (a: Row, b: Row) => Number(a.initial === '#') - Number(b.initial === '#') || a.sortKey.localeCompare(b.sortKey); // digits and symbols last
    return [...list].sort((a, b) => (sortBy === 'count' ? b.count - a.count || alpha(a, b) : alpha(a, b)));
  }, [searched, letter, query, sortBy]);

  // New tab / filter / collection: back to the first page
  useEffect(() => {
    setShown(PAGE);
    setLetter('');
  }, [activeTab, collectionFilter, filterQuery, sortBy]);

  const page = visible.slice(0, shown);
  const grouped = sortBy === 'alpha';

  const RefList: React.FC<{ refs: SpotLink[] }> = ({ refs }) => {
    const [open, setOpen] = useState(false);
    const list = open ? refs : refs.slice(0, 4);
    return (
      <span className="text-[0.95rem] leading-relaxed text-muted">
        {list.map((ref, idx) => (
          <React.Fragment key={`${ref.entryId}-${ref.spotId}-${idx}`}>
            {idx > 0 && <span className="text-faint"> · </span>}
            <button
              type="button"
              onClick={() => onNavigateToSpot(ref.entryId, ref.spotId)}
              className="text-brand underline decoration-line underline-offset-2 transition-opacity hover:opacity-70"
              title={`${ref.entryTitle}${ref.sectionHead ? ' › ' + ref.sectionHead : ''}`}
            >
              {ref.entryTitle}
            </button>
          </React.Fragment>
        ))}
        {refs.length > 4 && (
          <button type="button" onClick={() => setOpen((o) => !o)} className="ml-2 text-faint hover:text-brand">
            {open ? tr(lang, 'meno', 'less', 'mniej') : `+${refs.length - 4}`}
          </button>
        )}
      </span>
    );
  };

  let lastInitial = '';

  return (
    <div className="space-y-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl space-y-3">
          <p className="eyebrow">{tr(lang, 'Riferimenti incrociati', 'Cross-references', 'Odsyłacze')}</p>
          <h1 className="page-title">{t.navIndices}</h1>
        </div>
        <button type="button" onClick={handleExportCSV} className="no-print btn">
          {t.exportCsv}
        </button>
      </header>

      {/* One index at a time */}
      <nav className="no-print grid gap-x-8 gap-y-1 border-y border-line py-3 sm:grid-cols-2 lg:grid-cols-3" role="tablist" aria-label={t.navIndices}>
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.key}
            onClick={() => {
              setActiveTab(tab.key as IndexTab);
              window.location.hash = `#/indices/${tab.key}`;
            }}
            className={`flex items-baseline justify-between gap-3 border-l-2 py-1.5 pl-3 text-left text-lg transition-colors ${
              activeTab === tab.key ? 'border-brand text-brand' : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            <span>{tab.label}</span>
            <span className="text-sm tabular-nums text-slate-ink">{tab.count}</span>
          </button>
        ))}
      </nav>

      <p className="-mt-4 max-w-2xl text-lg italic text-muted">{DESCRIPTIONS[activeTab][lang === 'it' ? 0 : lang === 'pl' ? 2 : 1]}</p>

      {/* Find: filter, collection, sort */}
      <div className="no-print space-y-5">
        <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
          <label className="block min-w-[14rem] flex-1">
            <span className="label">{tr(lang, 'Cerca nell’indice', 'Search this index', 'Szukaj w indeksie')}</span>
            <input type="search" value={filterQuery} onChange={(e) => setFilterQuery(e.target.value)} className="field" />
          </label>
          <div className="flex flex-wrap items-center gap-x-1 gap-y-1">
            {([
              ['all', `${tr(lang, 'Tutto', 'All', 'Wszystko')} (${entries.length})`],
              ['lexicon', `${tr(lang, 'Lessico', 'Lexicon', 'Leksykon')} (${lexiconCount})`],
              ['chapter', `${tr(lang, 'Capitoli', 'Chapters', 'Rozdziały')} (${sacrificiumCount})`],
            ] as const).map(([key, label]) => (
              <button key={key} type="button" className="chip" data-active={collectionFilter === key} onClick={() => setCollectionFilter(key)}>
                {label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 text-muted">
            <button type="button" className="chip" data-active={sortBy === 'alpha'} onClick={() => setSortBy('alpha')}>
              A–Z
            </button>
            <button type="button" className="chip" data-active={sortBy === 'count'} onClick={() => setSortBy('count')}>
              {tr(lang, 'più citati', 'most cited', 'najczęstsze')}
            </button>
          </div>
        </div>

        {/* A–Z jump strip: pick a letter to see only those entries */}
        {sortBy === 'alpha' && !query && (
          <div className="flex flex-wrap items-center gap-x-0.5 gap-y-1" aria-label="A–Z">
            <button type="button" className="chip" data-active={letter === ''} onClick={() => setLetter('')}>
              {tr(lang, 'Tutte', 'All', 'Wszystkie')}
            </button>
            {[...ABC, '#'].map((ch) =>
              available.has(ch) ? (
                <button key={ch} type="button" className="chip !px-2" data-active={letter === ch} onClick={() => setLetter(ch)}>
                  {ch}
                </button>
              ) : (
                <span key={ch} className="px-2 text-line select-none">
                  {ch}
                </span>
              )
            )}
          </div>
        )}
      </div>

      {/* The list */}
      <section aria-live="polite">
        <p className="mb-2 text-sm text-faint">
          {visible.length} {tr(lang, 'voci', 'entries', 'pozycji')}
        </p>
        {visible.length === 0 ? (
          <p className="py-10 italic text-faint">{t.noResults}</p>
        ) : (
          <ul>
            {page.map((r) => {
              const newGroup = grouped && r.initial !== lastInitial;
              lastInitial = r.initial;
              return (
                <li key={r.key}>
                  {newGroup && <div className="mb-1 mt-10 border-b border-line pb-1 text-3xl text-brand first:mt-0">{r.initial}</div>}
                  <div className="grid gap-x-8 gap-y-1 border-b border-line/60 py-4 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
                    <div className="min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span className="break-words text-xl">{r.label}</span>
                        {r.href && (
                          <a href={r.href} target="_blank" rel="noopener noreferrer" className="text-sm text-faint hover:text-brand" title="Logeion">
                            ↗
                          </a>
                        )}
                        <span className="ml-auto shrink-0 text-sm tabular-nums text-slate-ink md:hidden">{r.count}</span>
                      </div>
                      {r.sub && <div className="text-sm text-slate-ink">{r.sub}</div>}
                    </div>
                    <div className="flex items-baseline gap-4">
                      <div className="min-w-0 flex-1">
                        <RefList refs={r.refs} />
                      </div>
                      <span className="hidden shrink-0 text-sm tabular-nums text-slate-ink md:inline" title={t.count}>
                        {r.count}
                      </span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {visible.length > shown && (
          <div className="flex justify-center pt-8">
            <button type="button" className="btn" onClick={() => setShown((n) => n + PAGE)}>
              {tr(lang, 'Mostra altre', 'Show more', 'Pokaż więcej')} ({visible.length - shown})
            </button>
          </div>
        )}
      </section>
    </div>
  );
};
