import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateRealms, canonicalizeCase } from './indexAggregator.ts';
import type { LexiconEntry } from '../types/lexicon.ts';

test('canonicalizeCase properly formats strings', () => {
  assert.equal(canonicalizeCase('ritual practice'), 'Ritual practice');
  assert.equal(canonicalizeCase('Ritual Practice'), 'Ritual Practice');
});

test('aggregateRealms merges case variants and sums reference count', () => {
  const dummyEntries: LexiconEntry[] = [
    {
      id: 'entry-1',
      titles: {},
      editions: [],
      primaryLang: 'en',
      fileName: 'entry1.xml',
      title: 'Term One',
      lemma: 'term1',
      scriptType: 'Greek',
      authors: [],
      revisions: [],
      sections: [],
      excerpt: '',
      rawXml: '',
      indexedData: {
        sources: [],
        realms: [
          {
            id: 'spot-1',
            type: 'Activities',
            subtype: 'Ritual Practice',
            text: 'sacrifice',
            entryId: 'entry-1',
            entryTitle: 'Term One',
          },
        ],
        terms: [],
        characters: [],
        historicalFigures: [],
        places: [],
        crossLinks: [],
        bibliography: [],
      },
    },
    {
      id: 'entry-2',
      titles: {},
      editions: [],
      primaryLang: 'en',
      fileName: 'entry2.xml',
      title: 'Term Two',
      lemma: 'term2',
      scriptType: 'Latin',
      authors: [],
      revisions: [],
      sections: [],
      excerpt: '',
      rawXml: '',
      indexedData: {
        sources: [],
        realms: [
          {
            id: 'spot-2',
            type: 'activities', // lowercase variant
            subtype: 'ritual practice', // lowercase variant
            text: 'sacrifice',
            entryId: 'entry-2',
            entryTitle: 'Term Two',
          },
        ],
        terms: [],
        characters: [],
        historicalFigures: [],
        places: [],
        crossLinks: [],
        bibliography: [],
      },
    },
  ];

  const realms = aggregateRealms(dummyEntries);
  assert.equal(realms.length, 1);
  assert.equal(realms[0].count, 2);
  assert.equal(realms[0].entries.length, 2);
  assert.equal(realms[0].references.length, 2);
});
