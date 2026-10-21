import React, { useEffect, useMemo, useState } from 'react';
import type { Language } from '../i18n/translations.ts';
import type { LexiconEntry } from '../types/lexicon.ts';
import { getSearchEngine, type SearchFacetFilters, type SearchResultItem } from '../utils/searchEngine.ts';
import { searchRemote } from '../utils/searchClient.ts';

interface SearchViewProps {
  entries: LexiconEntry[];
  lang: Language;
  initialQuery?: string;
}

const T = {
  en: {
    eyebrow: 'Search',
    title: 'Search the lexicon',
    lead: 'Accent- and diacritic-insensitive; Greek can be typed in Latin letters.',
    placeholder: '',
    collection: 'Collection',
    everything: 'Everything',
    lexicon: 'Lexicon',
    chapters: 'Book chapters',
    realm: 'Realm',
    source: 'Source type',
    author: 'Author',
    script: 'Script',
    any: 'Any',
    clear: 'Clear',
    found: (n: number) => `${n} result${n === 1 ? '' : 's'}`,
    none: 'No results. Try fewer words or remove a filter.',
    realms: 'Realms',
    more: (n: number) => `Showing the first ${n} results — refine the query to narrow them down.`,
  },
  it: {
    eyebrow: 'Ricerca',
    title: 'Cerca nel lessico',
    lead: 'Insensibile ad accenti e diacritici; il greco si può digitare anche in lettere latine.',
    placeholder: '',
    collection: 'Collezione',
    everything: 'Tutto',
    lexicon: 'Lessico',
    chapters: 'Capitoli dei volumi',
    realm: 'Ambito',
    source: 'Tipo di fonte',
    author: 'Autore',
    script: 'Scrittura',
    any: 'Qualsiasi',
    clear: 'Azzera',
    found: (n: number) => `${n} risultat${n === 1 ? 'o' : 'i'}`,
    none: 'Nessun risultato. Prova con meno parole o togli un filtro.',
    realms: 'Ambiti',
    more: (n: number) => `Primi ${n} risultati: affina la ricerca per restringerli.`,
  },
  pl: {
    eyebrow: 'Szukaj',
    title: 'Przeszukaj leksykon',
    lead: 'Wyszukiwanie nie zależy od akcentów i znaków diakrytycznych; grekę można wpisywać literami łacińskimi.',
    placeholder: '',
    collection: 'Kolekcja',
    everything: 'Wszystko',
    lexicon: 'Leksykon',
    chapters: 'Rozdziały tomów',
    realm: 'Dziedzina',
    source: 'Typ źródła',
    author: 'Autor',
    script: 'Pismo',
    any: 'Dowolne',
    clear: 'Wyczyść',
    found: (n: number) => `${n} ${n === 1 ? 'wynik' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 'wyniki' : 'wyników'}`,
    none: 'Brak wyników. Spróbuj z mniejszą liczbą słów lub usuń filtr.',
    realms: 'Dziedziny',
    more: (n: number) => `Pierwsze ${n} wyników — doprecyzuj zapytanie, aby je zawęzić.`,
  },
} as const;

const PAGE = 40;

const Select = ({ label, value, options, onChange }: { label: string; value: string; options: Array<[string, string]>; onChange: (v: string) => void }) => (
  <label className="block min-w-0">
    <span className="label">{label}</span>
    <select value={value} onChange={(e) => onChange(e.target.value)} className="field !py-1.5 !text-base">
      {options.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  </label>
);



export const SearchView: React.FC<SearchViewProps> = ({ entries, lang, initialQuery = '' }) => {
  const t = T[lang];
  const [query, setQuery] = useState(initialQuery);
  const [filters, setFilters] = useState<SearchFacetFilters>({});

  // Full-text search runs on the server (every edition, always current); if it is unreachable
  // (static hosting) the browser falls back to its own, lighter index.
  const [remote, setRemote] = useState<{ results: SearchResultItem[]; total: number } | null>(null);
  const [failed, setFailed] = useState(false);
  const [pending, setPending] = useState(true);
  useEffect(() => {
    const ctl = new AbortController();
    setPending(true);
    const timer = setTimeout(
      () => {
        searchRemote(query, filters, lang, ctl.signal)
          .then((r) => {
            setRemote({ results: r.results, total: r.total });
            setFailed(false);
            setPending(false);
          })
          .catch(() => {
            if (ctl.signal.aborted) return;
            setFailed(true);
            setPending(false);
          });
      },
      query ? 160 : 0
    );
    return () => {
      clearTimeout(timer);
      ctl.abort();
    };
  }, [query, filters, lang, entries]);

  useEffect(() => setQuery(initialQuery), [initialQuery]);

  const facets = useMemo(() => {
    const realms = new Set<string>();
    const sources = new Set<string>();
    const authors = new Set<string>();
    const scripts = new Set<string>();
    entries.forEach((e) => {
      scripts.add(e.scriptType);
      e.authors.forEach((a) => authors.add(a.name));
      e.indexedData.sources.forEach((s) => sources.add(s.type));
      e.indexedData.realms.forEach((r) => realms.add(r.type));
    });
    const sort = (s: Set<string>) => Array.from(s).sort((a, b) => a.localeCompare(b));
    return { realms: sort(realms), sources: sort(sources), authors: sort(authors), scripts: sort(scripts) };
  }, [entries]);

  const local = useMemo(() => (failed ? getSearchEngine(entries).search(query, filters, lang) : null), [failed, entries, query, filters, lang]);
  const results = failed ? local ?? [] : remote?.results ?? [];
  const total = failed ? results.length : remote?.total ?? 0;
  const active = Boolean(query || filters.realm || filters.sourceType || filters.author || filters.scriptType || (filters.collection && filters.collection !== 'all'));

  const setQ = (v: string) => {
    setQuery(v);
    window.location.hash = v ? `#/search?q=${encodeURIComponent(v)}` : '#/search';
  };

  return (
    <div className="space-y-12">
      <header className="max-w-2xl space-y-3">
        <p className="eyebrow">{t.eyebrow}</p>
        <h1 className="page-title">{t.title}</h1>
        <p className="pt-2 text-xl italic leading-relaxed text-muted">{t.lead}</p>
      </header>

      <div className="no-print space-y-8">
        <div className="flex items-center gap-4 border-b border-line pb-2.5 transition-colors focus-within:border-brand">
          <input
            type="search"
            autoFocus
            value={query}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t.placeholder}
            className="min-w-0 flex-1 bg-transparent text-2xl text-ink outline-none placeholder:italic placeholder:text-faint"
            aria-label={t.title}
          />
          {active && (
            <button
              type="button"
              className="btn !border-transparent !px-0 hover:!bg-transparent"
              onClick={() => {
                setFilters({});
                setQ('');
              }}
            >
              {t.clear}
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-3">
          <Select
            label={t.collection}
            value={filters.collection || 'all'}
            options={[['all', t.everything], ['lexicon', t.lexicon], ['chapter', t.chapters]]}
            onChange={(v) => setFilters((p) => ({ ...p, collection: v as SearchFacetFilters['collection'] }))}
          />
          <Select label={t.realm} value={filters.realm || ''} options={[['', t.any], ...facets.realms.map((r): [string, string] => [r, r])]} onChange={(v) => setFilters((p) => ({ ...p, realm: v || undefined }))} />
          <Select label={t.source} value={filters.sourceType || ''} options={[['', t.any], ...facets.sources.map((r): [string, string] => [r, r])]} onChange={(v) => setFilters((p) => ({ ...p, sourceType: v || undefined }))} />
          <Select label={t.author} value={filters.author || ''} options={[['', t.any], ...facets.authors.map((r): [string, string] => [r, r])]} onChange={(v) => setFilters((p) => ({ ...p, author: v || undefined }))} />
          <Select label={t.script} value={filters.scriptType || ''} options={[['', t.any], ...facets.scripts.map((r): [string, string] => [r, r])]} onChange={(v) => setFilters((p) => ({ ...p, scriptType: v || undefined }))} />
        </div>
      </div>

      <section className="space-y-2">
        <div className="border-b border-line pb-3">
          <h2 className="eyebrow">{pending && !remote && !failed ? '…' : t.found(total)}</h2>
        </div>
        {results.length === 0 && (pending ? false : true) ? (
          <p className="py-10 italic text-faint">{t.none}</p>
        ) : (
          <ul>
            {results.slice(0, PAGE).map((res) => (
              <li key={res.id}>
                <a href={`#/entry/${res.id}`} className="group block space-y-1.5 border-b border-line/60 py-6">
                  <span className="flex flex-wrap items-baseline justify-between gap-x-4">
                    <span className="text-2xl transition-colors group-hover:text-brand">{res.title}</span>
                    <span className="text-sm text-faint">{res.collection === 'chapter' ? t.chapters : t.lexicon}</span>
                  </span>
                  <span className="block max-w-3xl leading-relaxed text-muted" dangerouslySetInnerHTML={{ __html: res.snippetHtml }} />
                  {res.matchedRealms.length > 0 && (
                    <span className="block text-sm text-faint">
                      {t.realms}: {res.matchedRealms.join(' · ')}
                    </span>
                  )}
                </a>
              </li>
            ))}
          </ul>
        )}
        {total > PAGE && <p className="pt-4 text-sm italic text-faint">{t.more(PAGE)}</p>}
      </section>
    </div>
  );
};
