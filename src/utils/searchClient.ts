import type { LexiconEntry } from '../types/lexicon.ts';
import type { SearchFacetFilters, SearchResultItem } from './searchEngine.ts';
import { endpoints } from './endpoints.ts';

export interface RemoteSearch {
  version: string;
  total: number;
  results: SearchResultItem[];
}

/** Full-text search on the server (all editions, always in step with the corpus). */
export async function searchRemote(query: string, filters: SearchFacetFilters, lang: string, signal?: AbortSignal): Promise<RemoteSearch> {
  const p = new URLSearchParams({ lang });
  if (query.trim()) p.set('q', query.trim());
  (Object.entries(filters) as Array<[string, string | undefined]>).forEach(([k, v]) => v && v !== 'all' && p.set(k, v));
  const res = await fetch(`/api/search?${p}`, { signal, cache: 'no-store' });
  if (!res.ok) throw new Error(`search: ${res.status}`);
  return res.json();
}

let textsPromise: Promise<Record<string, Record<string, string[]>>> | null = null;

/**
 * Static site: there is no search server, so the pre-generated running text of every
 * edition (api/search-corpus.json, made at build time) is merged into the entries and
 * the browser builds the same index the server would.
 */
export async function hydrateEntries(entries: LexiconEntry[]): Promise<LexiconEntry[]> {
  textsPromise ||= fetch(endpoints.searchCorpus())
    .then((r) => (r.ok ? r.json() : { texts: {} }))
    .then((j) => j.texts as Record<string, Record<string, string[]>>)
    .catch(() => ({}));
  const texts = await textsPromise;
  return entries.map((e) => {
    const editions = e.editions.map((ed) => ({
      ...ed,
      sections: ed.sections.map((s, i) => ({ ...s, rawText: texts[e.id]?.[ed.lang]?.[i] ?? s.rawText })),
    }));
    return { ...e, editions, sections: (editions.find((x) => x.lang === e.primaryLang) || editions[0])?.sections ?? e.sections };
  });
}
