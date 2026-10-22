import type { ChapterVolume, LexiconEntry } from '../types/lexicon.ts';
import { greekToLatin } from './greekNormalizer.ts';

export type SuggestionKind = 'entry' | 'chapter' | 'term' | 'character' | 'person' | 'place';

export interface Suggestion {
  kind: SuggestionKind;
  label: string;
  /** Opens this entry/chapter; absent for terms, people and places (those run a search). */
  entryId?: string;
  /** Volume of a chapter, to tell apart chapters that share a title (two "Supplices"). */
  volume?: ChapterVolume;
  /** Chapter number within its volume (from the file name). */
  number?: number;
  /** Text matched against what the reader types: accent-insensitive, Greek transliterated. */
  key: string;
  /** Alternative spellings that also match (other languages, original script). */
  aliases: string[];
}

const norm = (s: string) => greekToLatin(s).replace(/\s+/g, ' ').trim();

/** Every name a reader might start typing: entries, chapters, and the terms/people/places of the indices. */
export function buildSuggestions(entries: LexiconEntry[]): Suggestion[] {
  const out: Suggestion[] = [];
  const seen = new Set<string>();
  const add = (kind: SuggestionKind, label: string, entryId?: string, aliases: string[] = [], volume?: ChapterVolume, number?: number) => {
    const text = label.trim();
    if (!text) return;
    const id = `${kind}:${entryId || ''}:${norm(text)}`;
    if (seen.has(id)) return;
    seen.add(id);
    out.push({ kind, label: text, entryId, volume, number, key: norm(text), aliases: aliases.map(norm).filter((a) => a && a !== norm(text)) });
  };

  for (const e of entries) {
    const names = [...new Set([e.title, ...Object.values(e.titles || {}), e.originalScript || ''].filter(Boolean))];
    add(e.collection === 'chapter' ? 'chapter' : 'entry', e.title, e.id, names.filter((n) => n !== e.title), e.volume, Number(/_(\d+)_/.exec(e.fileName)?.[1]) || undefined);
    const d = e.indexedData;
    d.terms.forEach((t) => add('term', t.lemma));
    d.characters.forEach((c) => add('character', c.name));
    d.historicalFigures.forEach((h) => add('person', h.name));
    d.places.forEach((p) => add('place', p.name));
  }
  return out;
}

const KIND_ORDER: Record<SuggestionKind, number> = { entry: 0, chapter: 1, term: 2, character: 3, person: 4, place: 5 };

/** Best matches for what has been typed so far: prefixes first, then word starts, then substrings. */
export function suggest(index: Suggestion[], query: string, limit = 8): Suggestion[] {
  const q = norm(query);
  if (q.length < 1) return [];
  const scored: Array<{ s: Suggestion; rank: number }> = [];
  for (const s of index) {
    const haystack = [s.key, ...s.aliases];
    let rank = Infinity;
    for (const h of haystack) {
      if (h.startsWith(q)) rank = Math.min(rank, 0);
      else if (h.includes(` ${q}`) || h.includes(`(${q}`)) rank = Math.min(rank, 1);
      else if (q.length >= 2 && h.includes(q)) rank = Math.min(rank, 2);
    }
    if (rank < Infinity) scored.push({ s, rank });
  }
  scored.sort((a, b) => a.rank - b.rank || KIND_ORDER[a.s.kind] - KIND_ORDER[b.s.kind] || a.s.key.length - b.s.key.length || a.s.key.localeCompare(b.s.key));
  return scored.slice(0, limit).map((x) => x.s);
}
