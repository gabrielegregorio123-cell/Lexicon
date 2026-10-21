import type {
  AncientSourceRef,
  CharacterRef,
  HistoricalFigureRef,
  LexiconEntry,
  PlaceRef,
  RealmRef,
  TermRef,
} from '../types/lexicon.ts';
import { detectScriptType } from './xmlParser.ts';

export interface SpotLink {
  entryId: string;
  entryTitle: string;
  spotId: string;
  sectionHead?: string;
  sectionId?: string;
}

export interface AggregatedSource {
  key: string;
  source: string;
  type: string;
  count: number;
  entries: { id: string; title: string }[];
  references: SpotLink[];
}

export interface AggregatedRealm {
  key: string;
  type: string;
  subtype: string;
  term: string;
  count: number;
  entries: { id: string; title: string }[];
  references: SpotLink[];
}

export interface AggregatedTerm {
  key: string;
  lemma: string;
  script: string;
  logeionUrl: string;
  count: number;
  entries: { id: string; title: string }[];
  references: SpotLink[];
}

export interface AggregatedCharacter {
  key: string;
  name: string;
  type: string;
  canonicalKey: string;
  count: number;
  entries: { id: string; title: string }[];
  references: SpotLink[];
}

export interface AggregatedHistoricalFigure {
  key: string;
  name: string;
  canonicalKey: string;
  count: number;
  entries: { id: string; title: string }[];
  references: SpotLink[];
}

export interface AggregatedPlace {
  key: string;
  name: string;
  canonicalKey: string;
  count: number;
  entries: { id: string; title: string }[];
  references: SpotLink[];
}

export interface AggregatedBibl {
  key: string;
  author: string;
  date: string;
  title: string;
  fullCitation: string;
  citedInEntries: { id: string; title: string }[];
}

/**
 * Standardize capitalization to canonical title/sentence case
 */
export function canonicalizeCase(str: string): string {
  if (!str) return '';
  const trimmed = str.trim();
  // Return with first letter capitalized, preserving rest
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

/**
 * Aggregate all ancient sources from entries with case-variant merging
 */
export function aggregateAncientSources(entries: LexiconEntry[]): AggregatedSource[] {
  const map = new Map<string, AggregatedSource>();

  entries.forEach((entry) => {
    entry.indexedData.sources.forEach((s) => {
      const normKey = `${s.type.toLowerCase()}:${s.text.trim().toLowerCase()}`;
      const existing = map.get(normKey);

      const refLink: SpotLink = {
        entryId: entry.id,
        entryTitle: entry.title,
        spotId: s.id,
        sectionHead: s.sectionHead,
        sectionId: s.sectionId,
      };

      if (!existing) {
        map.set(normKey, {
          key: normKey,
          source: s.text.trim(),
          type: s.type.toLowerCase(),
          count: 1,
          entries: [{ id: entry.id, title: entry.title }],
          references: [refLink],
        });
      } else {
        existing.count += 1;
        if (!existing.entries.some((e) => e.id === entry.id)) {
          existing.entries.push({ id: entry.id, title: entry.title });
        }
        existing.references.push(refLink);
      }
    });
  });

  return Array.from(map.values()).sort((a, b) => a.source.localeCompare(b.source));
}

/**
 * Aggregate all realms from entries, merging case variants (e.g. "Ritual Practice" / "Ritual practice")
 */
export function aggregateRealms(entries: LexiconEntry[]): AggregatedRealm[] {
  const map = new Map<string, AggregatedRealm>();

  entries.forEach((entry) => {
    entry.indexedData.realms.forEach((r) => {
      const typeCanon = canonicalizeCase(r.type);
      const subtypeCanon = canonicalizeCase(r.subtype);
      const termCanon = r.text.trim();
      const normKey = `${typeCanon.toLowerCase()}|${subtypeCanon.toLowerCase()}|${termCanon.toLowerCase()}`;

      const refLink: SpotLink = {
        entryId: entry.id,
        entryTitle: entry.title,
        spotId: r.id,
        sectionHead: r.sectionHead,
        sectionId: r.sectionId,
      };

      const existing = map.get(normKey);
      if (!existing) {
        map.set(normKey, {
          key: normKey,
          type: typeCanon,
          subtype: subtypeCanon,
          term: termCanon,
          count: 1,
          entries: [{ id: entry.id, title: entry.title }],
          references: [refLink],
        });
      } else {
        existing.count += 1;
        if (!existing.entries.some((e) => e.id === entry.id)) {
          existing.entries.push({ id: entry.id, title: entry.title });
        }
        existing.references.push(refLink);
      }
    });
  });

  return Array.from(map.values()).sort((a, b) => {
    const typeCmp = a.type.localeCompare(b.type);
    if (typeCmp !== 0) return typeCmp;
    const subCmp = a.subtype.localeCompare(b.subtype);
    if (subCmp !== 0) return subCmp;
    return a.term.localeCompare(b.term);
  });
}

/**
 * Aggregate all terms (Greek & Latin lemmas)
 */
export function aggregateTerms(entries: LexiconEntry[]): AggregatedTerm[] {
  const map = new Map<string, AggregatedTerm>();

  entries.forEach((entry) => {
    entry.indexedData.terms.forEach((t) => {
      const lemmaCanon = t.lemma.trim();
      const normKey = lemmaCanon.toLowerCase();

      const refLink: SpotLink = {
        entryId: entry.id,
        entryTitle: entry.title,
        spotId: t.id,
        sectionHead: t.sectionHead,
        sectionId: t.sectionId,
      };

      const existing = map.get(normKey);
      if (!existing) {
        map.set(normKey, {
          key: normKey,
          lemma: lemmaCanon,
          script: detectScriptType(lemmaCanon),
          logeionUrl: t.logeionUrl,
          count: 1,
          entries: [{ id: entry.id, title: entry.title }],
          references: [refLink],
        });
      } else {
        existing.count += 1;
        if (!existing.entries.some((e) => e.id === entry.id)) {
          existing.entries.push({ id: entry.id, title: entry.title });
        }
        existing.references.push(refLink);
      }
    });
  });

  return Array.from(map.values()).sort((a, b) => a.lemma.localeCompare(b.lemma));
}

/**
 * Aggregate all characters (divine, hero, myth, literary)
 */
export function aggregateCharacters(entries: LexiconEntry[]): AggregatedCharacter[] {
  const map = new Map<string, AggregatedCharacter>();

  entries.forEach((entry) => {
    entry.indexedData.characters.forEach((c) => {
      const canonName = canonicalizeCase(c.name);
      const canonKey = c.key || canonName;
      const normKey = `${c.type.toLowerCase()}:${canonKey.toLowerCase()}`;

      const refLink: SpotLink = {
        entryId: entry.id,
        entryTitle: entry.title,
        spotId: c.id,
        sectionHead: c.sectionHead,
        sectionId: c.sectionId,
      };

      const existing = map.get(normKey);
      if (!existing) {
        map.set(normKey, {
          key: normKey,
          name: canonName,
          type: canonicalizeCase(c.type),
          canonicalKey: canonKey,
          count: 1,
          entries: [{ id: entry.id, title: entry.title }],
          references: [refLink],
        });
      } else {
        existing.count += 1;
        if (!existing.entries.some((e) => e.id === entry.id)) {
          existing.entries.push({ id: entry.id, title: entry.title });
        }
        existing.references.push(refLink);
      }
    });
  });

  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Aggregate all historical figures
 */
export function aggregateHistoricalFigures(entries: LexiconEntry[]): AggregatedHistoricalFigure[] {
  const map = new Map<string, AggregatedHistoricalFigure>();

  entries.forEach((entry) => {
    entry.indexedData.historicalFigures.forEach((h) => {
      const canonName = canonicalizeCase(h.name);
      const canonKey = h.key || canonName;
      const normKey = canonKey.toLowerCase();

      const refLink: SpotLink = {
        entryId: entry.id,
        entryTitle: entry.title,
        spotId: h.id,
        sectionHead: h.sectionHead,
        sectionId: h.sectionId,
      };

      const existing = map.get(normKey);
      if (!existing) {
        map.set(normKey, {
          key: normKey,
          name: canonName,
          canonicalKey: canonKey,
          count: 1,
          entries: [{ id: entry.id, title: entry.title }],
          references: [refLink],
        });
      } else {
        existing.count += 1;
        if (!existing.entries.some((e) => e.id === entry.id)) {
          existing.entries.push({ id: entry.id, title: entry.title });
        }
        existing.references.push(refLink);
      }
    });
  });

  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Aggregate all places
 */
export function aggregatePlaces(entries: LexiconEntry[]): AggregatedPlace[] {
  const map = new Map<string, AggregatedPlace>();

  entries.forEach((entry) => {
    entry.indexedData.places.forEach((p) => {
      const canonName = canonicalizeCase(p.name);
      const canonKey = p.key || canonName;
      const normKey = canonKey.toLowerCase();

      const refLink: SpotLink = {
        entryId: entry.id,
        entryTitle: entry.title,
        spotId: p.id,
        sectionHead: p.sectionHead,
        sectionId: p.sectionId,
      };

      const existing = map.get(normKey);
      if (!existing) {
        map.set(normKey, {
          key: normKey,
          name: canonName,
          canonicalKey: canonKey,
          count: 1,
          entries: [{ id: entry.id, title: entry.title }],
          references: [refLink],
        });
      } else {
        existing.count += 1;
        if (!existing.entries.some((e) => e.id === entry.id)) {
          existing.entries.push({ id: entry.id, title: entry.title });
        }
        existing.references.push(refLink);
      }
    });
  });

  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Aggregate and deduplicate bibliography entries, sorted by Author and Year
 */
export function aggregateBibliography(entries: LexiconEntry[]): AggregatedBibl[] {
  const map = new Map<string, AggregatedBibl>();

  entries.forEach((entry) => {
    entry.indexedData.bibliography.forEach((b) => {
      // Key by author + year or title
      const normKey = `${b.author.trim().toLowerCase()}_${b.date.trim().toLowerCase()}_${b.title.trim().toLowerCase()}`;
      const existing = map.get(normKey);

      if (!existing) {
        map.set(normKey, {
          key: normKey,
          author: b.author,
          date: b.date,
          title: b.title,
          fullCitation: b.fullCitation,
          citedInEntries: [{ id: entry.id, title: entry.title }],
        });
      } else {
        if (!existing.citedInEntries.some((e) => e.id === entry.id)) {
          existing.citedInEntries.push({ id: entry.id, title: entry.title });
        }
      }
    });
  });

  return Array.from(map.values()).sort((a, b) => {
    const authCmp = a.author.localeCompare(b.author);
    if (authCmp !== 0) return authCmp;
    return a.date.localeCompare(b.date);
  });
}
