/**
 * Data structures for LARES Lexicon EpiDoc TEI XML parsing and indexing.
 */

export interface AuthorResp {
  name: string;
  role?: string;
  date?: string;
}

export interface RevisionItem {
  who?: string;
  date?: string;
  note?: string;
}

export interface SectionItem {
  id: string;
  head: string;
  level: number;
  rawText: string;
  html: string;
  /** True for the bibliography block that closes an entry. */
  isBibliography?: boolean;
}

export interface AncientSourceRef {
  id: string;
  type: 'lit' | 'ins' | 'pap' | string;
  text: string;
  entryId: string;
  entryTitle: string;
  sectionId?: string;
  sectionHead?: string;
}

export interface RealmRef {
  id: string;
  type: string;
  subtype: string;
  text: string;
  entryId: string;
  entryTitle: string;
  sectionId?: string;
  sectionHead?: string;
}

export interface TermRef {
  id: string;
  lemma: string;
  text: string;
  logeionUrl: string;
  entryId: string;
  entryTitle: string;
  sectionId?: string;
  sectionHead?: string;
}

export interface CharacterRef {
  id: string;
  name: string;
  type: 'divine' | 'hero' | 'myth' | 'literary' | string;
  key: string;
  entryId: string;
  entryTitle: string;
  sectionId?: string;
  sectionHead?: string;
}

export interface HistoricalFigureRef {
  id: string;
  name: string;
  key: string;
  entryId: string;
  entryTitle: string;
  sectionId?: string;
  sectionHead?: string;
}

export interface PlaceRef {
  id: string;
  name: string;
  key: string;
  entryId: string;
  entryTitle: string;
  sectionId?: string;
  sectionHead?: string;
}

export interface CrossLinkRef {
  id: string;
  corresp: string;
  text: string;
  targetEntryId?: string;
  sectionId?: string;
}

export interface BiblItem {
  id: string;
  author: string;
  date: string;
  title: string;
  fullCitation: string;
  citedInEntries: Array<{ id: string; title: string }>;
}

export type LexiconCollection = 'lexicon' | 'chapter';

/** Volumes of the book series "Blood sacrifice in Ancient Greece in the light of philological data". */
export type ChapterVolume = 'hom' | 'trag' | 'com' | 'cpch';

export interface EditionItem {
  /** xml:lang of the edition (`und` when the source gives none). */
  lang: string;
  sections: SectionItem[];
}

export interface LexiconEntry {
  id: string;
  fileName: string;
  title: string;
  lemma: string;
  originalScript?: string;
  authorShort?: string;
  xmlLang?: string;
  collection?: LexiconCollection;
  /** Book-series volume, for chapters. */
  volume?: ChapterVolume;
  /** Titles by language, from <titleStmt><title xml:lang>. */
  titles: Record<string, string>;
  /** Publication date (@when of publicationStmt/date). */
  date?: string;
  /** All editions found in the file (it / en / pl …). */
  editions: EditionItem[];
  /** Edition the indices are built from (the most heavily annotated one). */
  primaryLang: string;
  hasBreathingIssue?: boolean;
  breathingIssueDetails?: string;
  scriptType: 'Greek' | 'Latin' | 'Hebrew' | 'Other';
  authors: AuthorResp[];
  originalPublication?: string;
  revisions: RevisionItem[];
  sections: SectionItem[];
  excerpt: string;
  /** Source XML. Empty in the corpus index: fetched on demand (see utils/entryBody.ts). */
  rawXml: string;
  /** False when the section HTML was left out of the index and must be fetched. */
  bodyLoaded?: boolean;
  indexedData: {
    sources: AncientSourceRef[];
    realms: RealmRef[];
    terms: TermRef[];
    characters: CharacterRef[];
    historicalFigures: HistoricalFigureRef[];
    places: PlaceRef[];
    crossLinks: CrossLinkRef[];
    bibliography: BiblItem[];
  };
}

export interface ParseReport {
  totalFiles: number;
  successCount: number;
  failedCount: number;
  files: Array<{
    fileName: string;
    success: boolean;
    entryId?: string;
    title?: string;
    error?: string;
    unknownTags?: string[];
  }>;
  allUnknownTags: string[];
}

export type CategoryHighlightKey =
  | 'links'
  | 'practice'
  | 'belief'
  | 'fiction'
  | 'sign'
  | 'senses'
  | 'speech'
  | 'systems'
  | 'instruments'
  | 'structures';

export interface CategoryToggleState {
  links: boolean;
  practice: boolean;
  belief: boolean;
  fiction: boolean;
  sign: boolean;
  senses: boolean;
  speech: boolean;
  systems: boolean;
  instruments: boolean;
  structures: boolean;
}
