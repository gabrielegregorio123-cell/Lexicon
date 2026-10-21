/**
 * Full-text search, kept on the server: the index covers every edition (it / en / pl)
 * of every entry and is rebuilt whenever the corpus changes (a save, a delete, a pull),
 * so a new or edited entry is searchable on the very next request.
 */
import { LexiconSearchEngine, type SearchFacetFilters, type SearchResultItem } from '../src/utils/searchEngine.ts';
import type { Corpus } from './corpus.ts';

export interface SearchResponse {
  version: string;
  total: number;
  results: SearchResultItem[];
}

export class SearchService {
  private corpus: Corpus;
  private engine: LexiconSearchEngine | null = null;
  private builtFor = '';

  constructor(corpus: Corpus) {
    this.corpus = corpus;
  }

  search(query: string, filters: SearchFacetFilters, lang: string | undefined, limit = 200): SearchResponse {
    const version = this.corpus.version();
    if (!this.engine || this.builtFor !== version) {
      const engine = new LexiconSearchEngine();
      engine.indexEntries(this.corpus.entries());
      this.engine = engine;
      this.builtFor = version;
    }
    const all = this.engine.search(query, filters, lang);
    return { version, total: all.length, results: all.slice(0, limit) };
  }
}
