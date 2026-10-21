import test from 'node:test';
import assert from 'node:assert/strict';
import { LexiconSearchEngine } from './searchEngine.ts';
import type { LexiconEntry } from '../types/lexicon.ts';

test('LexiconSearchEngine matches polytonic, monotonic, and Latin transliteration', () => {
  const engine = new LexiconSearchEngine();

  const dummyEntries: LexiconEntry[] = [
    {
      id: 'agalma',
      titles: {},
      editions: [],
      primaryLang: 'en',
      fileName: 'agalma.xml',
      title: 'Agalma (ἄγαλμα)',
      lemma: 'ἄγαλμα',
      scriptType: 'Greek',
      authors: [{ name: 'Eleni Chronopoulou', role: 'Author' }],
      revisions: [],
      sections: [
        {
          id: 's1',
          head: 'Etymology',
          level: 2,
          rawText: 'The substantive ἄγαλμα is an ornament for Zeus and Apollo in Delphi and Olympia.',
          html: '<p>The substantive ἄγαλμα...</p>',
        },
      ],
      excerpt: 'The substantive ἄγαλμα is an ornament.',
      rawXml: '',
      indexedData: {
        sources: [{ id: 'src-1', type: 'lit', text: 'Homer, Il. 4.144', entryId: 'agalma', entryTitle: 'Agalma' }],
        realms: [{ id: 'r-1', type: 'Activities', subtype: 'Ritual Practice', text: 'dedication', entryId: 'agalma', entryTitle: 'Agalma' }],
        terms: [],
        characters: [],
        historicalFigures: [],
        places: [],
        crossLinks: [],
        bibliography: [],
      },
    },
    {
      id: 'fides',
      titles: {},
      editions: [],
      primaryLang: 'en',
      fileName: 'fides.xml',
      title: 'Fides',
      lemma: 'fides',
      scriptType: 'Latin',
      authors: [{ name: 'Marco Santamaria', role: 'Author' }],
      revisions: [],
      sections: [
        {
          id: 's2',
          head: 'Meaning',
          level: 2,
          rawText: 'The Latin noun fides designates mutual good faith and sacred oath in Rome.',
          html: '<p>The Latin noun fides...</p>',
        },
      ],
      excerpt: 'The Latin noun fides designates mutual good faith.',
      rawXml: '',
      indexedData: {
        sources: [{ id: 'src-2', type: 'ins', text: 'CIL I 583', entryId: 'fides', entryTitle: 'Fides' }],
        realms: [{ id: 'r-2', type: 'Beliefs', subtype: 'Moral Values', text: 'good faith', entryId: 'fides', entryTitle: 'Fides' }],
        terms: [],
        characters: [],
        historicalFigures: [],
        places: [],
        crossLinks: [],
        bibliography: [],
      },
    },
  ];

  engine.indexEntries(dummyEntries);

  // Search using polytonic Greek
  const res1 = engine.search('ἄγαλμα');
  assert.equal(res1.length, 1);
  assert.equal(res1[0].id, 'agalma');

  // Search using monotonic Greek
  const res2 = engine.search('αγαλμα');
  assert.equal(res2.length, 1);
  assert.equal(res2[0].id, 'agalma');

  // Search using Latin transliteration
  const res3 = engine.search('agalma');
  assert.equal(res3.length, 1);
  assert.equal(res3[0].id, 'agalma');

  // Search for Latin term
  const res4 = engine.search('fides');
  assert.equal(res4.length, 1);
  assert.equal(res4[0].id, 'fides');

  // Facet filtering by script
  const res5 = engine.search('', { scriptType: 'Latin' });
  assert.equal(res5.length, 1);
  assert.equal(res5[0].id, 'fides');
});
