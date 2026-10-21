import MiniSearch from 'minisearch';
import type { LexiconEntry } from '../types/lexicon.ts';
import { greekToLatin, stripDiacritics } from './greekNormalizer.ts';

export interface SearchFacetFilters {
  collection?: 'all' | 'lexicon' | 'chapter';
  realm?: string;
  sourceType?: string;
  author?: string;
  scriptType?: string;
}

export interface SearchResultItem {
  id: string;
  title: string;
  lemma: string;
  scriptType: string;
  collection: 'lexicon' | 'chapter';
  collectionLabel: string;
  authors: string[];
  excerpt: string;
  score: number;
  snippetHtml: string;
  matchedRealms: string[];
  matchedSources: string[];
}

interface IndexedDoc {
  id: string;
  title: string;
  lemma: string;
  scriptType: string;
  authorsStr: string;
  rawText: string;
  realmsStr: string;
  sourcesStr: string;
  charactersStr: string;
  placesStr: string;
  entry: LexiconEntry;
}

export class LexiconSearchEngine {
  private miniSearch: MiniSearch<IndexedDoc>;
  private entriesMap = new Map<string, LexiconEntry>();

  constructor() {
    this.miniSearch = new MiniSearch<IndexedDoc>({
      fields: ['title', 'lemma', 'authorsStr', 'rawText', 'realmsStr', 'sourcesStr', 'charactersStr', 'placesStr'],
      storeFields: ['id', 'title', 'lemma', 'scriptType', 'authorsStr'],
      tokenize: (text) => {
        if (!text) return [];
        const words = text.toLowerCase().split(/[\s,.;:!?"'()\[\]{}«»‹›—–/\\<>]+/g).filter(Boolean);
        const tokens: string[] = [];
        for (const w of words) {
          tokens.push(w);
          const stripped = stripDiacritics(w);
          if (stripped && stripped !== w) tokens.push(stripped);
          const transliterated = greekToLatin(w);
          if (transliterated && transliterated !== w && transliterated !== stripped) {
            tokens.push(transliterated);
          }
        }
        return tokens;
      },
      searchOptions: {
        boost: { lemma: 4, title: 3, realmsStr: 1.5, sourcesStr: 1.5 },
        prefix: true,
        fuzzy: 0.2,
      },
    });
  }

  public indexEntries(entries: LexiconEntry[]) {
    this.miniSearch.removeAll();
    this.entriesMap.clear();

    const docs: IndexedDoc[] = entries.map((entry) => {
      this.entriesMap.set(entry.id, entry);

      const authorsStr = entry.authors.map((a) => a.name).join(' ');
      // every edition is searchable (it / en / pl), not just the one the indices come from
      const editions = entry.editions?.length ? entry.editions : [{ lang: entry.primaryLang, sections: entry.sections }];
      const rawText = editions.flatMap((ed) => ed.sections.map((s) => `${s.head} ${s.rawText}`)).join(' ');
      const realmsStr = entry.indexedData.realms.map((r) => `${r.type} ${r.subtype} ${r.text}`).join(' ');
      const sourcesStr = entry.indexedData.sources.map((s) => `${s.type} ${s.text}`).join(' ');
      const charactersStr = entry.indexedData.characters.map((c) => `${c.name} ${c.key} ${c.type}`).join(' ');
      const placesStr = entry.indexedData.places.map((p) => `${p.name} ${p.key}`).join(' ');

      return {
        id: entry.id,
        title: entry.title,
        lemma: entry.lemma,
        scriptType: entry.scriptType,
        authorsStr,
        rawText,
        realmsStr,
        sourcesStr,
        charactersStr,
        placesStr,
        entry,
      };
    });

    this.miniSearch.addAll(docs);
  }

  public search(query: string, filters: SearchFacetFilters = {}, lang?: string): SearchResultItem[] {
    const trimmed = query.trim();
    let matchedIds: { id: string; score: number }[] = [];

    if (!trimmed) {
      // Empty query: list all entries
      matchedIds = Array.from(this.entriesMap.values()).map((e) => ({ id: e.id, score: 1 }));
    } else {
      const results = this.miniSearch.search(trimmed);
      matchedIds = results.map((r) => ({ id: r.id as string, score: r.score }));
    }

    // Apply Facet Filters
    const filteredResults: SearchResultItem[] = [];

    for (const item of matchedIds) {
      const entry = this.entriesMap.get(item.id);
      if (!entry) continue;

      // Collection filter check
      if (filters.collection && filters.collection !== 'all') {
        const itemCol = entry.collection || 'lexicon';
        if (itemCol !== filters.collection) continue;
      }

      // Facet filter checks
      if (filters.scriptType && entry.scriptType !== filters.scriptType) {
        continue;
      }
      if (filters.author && !entry.authors.some((a) => a.name.toLowerCase().includes(filters.author!.toLowerCase()))) {
        continue;
      }
      if (filters.sourceType && !entry.indexedData.sources.some((s) => s.type.toLowerCase() === filters.sourceType!.toLowerCase())) {
        continue;
      }
      if (filters.realm && !entry.indexedData.realms.some((r) => `${r.type} ${r.subtype}`.toLowerCase().includes(filters.realm!.toLowerCase()))) {
        continue;
      }

      // Build highlighted snippet
      const snippet = this.buildSnippet(entry, trimmed, lang);

      const col = entry.collection || 'lexicon';
      const collectionLabel = col === 'chapter' ? 'Book chapters' : 'LARES Lexicon';

      filteredResults.push({
        id: entry.id,
        title: entry.title,
        lemma: entry.lemma,
        scriptType: entry.scriptType,
        collection: col,
        collectionLabel,
        authors: entry.authors.map((a) => a.name),
        excerpt: entry.excerpt,
        score: item.score,
        snippetHtml: snippet,
        matchedRealms: Array.from(new Set(entry.indexedData.realms.map((r) => `${r.type}: ${r.subtype}`))).slice(0, 4),
        matchedSources: Array.from(new Set(entry.indexedData.sources.map((s) => s.text))).slice(0, 3),
      });
    }

    return filteredResults;
  }

  /** Snippet from the edition in the reader's language when it matches, else from any other edition. */
  private buildSnippet(entry: LexiconEntry, query: string, lang?: string): string {
    if (!query) return entry.excerpt || '';

    const editions = entry.editions?.length ? entry.editions : [{ lang: entry.primaryLang, sections: entry.sections }];
    const ordered = [...editions].sort((a, b) => Number(b.lang === lang) - Number(a.lang === lang));
    for (const ed of ordered) {
      const text = ed.sections.map((s) => s.rawText).join(' ');
      const found = snippetFrom(text, query);
      if (found) return found;
    }
    return entry.excerpt;
  }
}

const MARK = '<mark class="bg-amber-200 text-stone-900 font-semibold px-0.5 rounded-xs">';

/** Highlighted excerpt around the first word of `text` that matches `query` (accent- and script-insensitive), or null. */
function snippetFrom(text: string, query: string): string | null {
  const qLower = query.toLowerCase();
  const qStripped = stripDiacritics(qLower);
  const qLatin = greekToLatin(qStripped);
  const matches = (word: string) => {
    const w = word.toLowerCase();
    const stripped = stripDiacritics(w);
    return w.includes(qLower) || stripped.includes(qStripped) || greekToLatin(stripped).includes(qLatin);
  };

  const words = text.split(/\s+/);
  const at = words.findIndex(matches);
  if (at === -1) return null;

  const start = Math.max(0, at - 15);
  const end = Math.min(words.length, at + 25);
  const body = words
    .slice(start, end)
    .map((w) => (matches(w) ? `${MARK}${w}</mark>` : w))
    .join(' ');
  return `${start > 0 ? '… ' : ''}${body}${end < words.length ? ' …' : ''}`;
}

const engines = new WeakMap<LexiconEntry[], LexiconSearchEngine>();

/** One index per loaded corpus: revisiting the search page does not rebuild it. */
export function getSearchEngine(entries: LexiconEntry[]): LexiconSearchEngine {
  let engine = engines.get(entries);
  if (!engine) {
    engine = new LexiconSearchEngine();
    engine.indexEntries(entries);
    engines.set(entries, engine);
  }
  return engine;
}
