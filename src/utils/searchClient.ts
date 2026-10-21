import type { SearchFacetFilters, SearchResultItem } from './searchEngine.ts';

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
