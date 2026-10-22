import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSuggestions, suggest } from './suggest.ts';
import type { LexiconEntry } from '../types/lexicon.ts';

const entry = (over: Partial<LexiconEntry> & { id: string; title: string }): LexiconEntry =>
  ({
    fileName: `${over.id}.xml`,
    titles: {},
    lemma: over.title,
    scriptType: 'Latin',
    authors: [],
    revisions: [],
    editions: [],
    primaryLang: 'en',
    sections: [],
    excerpt: '',
    rawXml: '',
    collection: 'lexicon',
    indexedData: { sources: [], realms: [], terms: [], characters: [], historicalFigures: [], places: [], crossLinks: [], bibliography: [] },
    ...over,
  }) as LexiconEntry;

const ref = { entryId: 'x', entryTitle: 'X', id: 'i' };
const index = buildSuggestions([
  entry({ id: 'lexicon_agalma', title: 'Agalma', originalScript: 'ἄγαλμα', indexedData: { sources: [], realms: [], terms: [{ ...ref, lemma: 'ἄγαλμα', text: 'ἄγαλμα', logeionUrl: '' }], characters: [{ ...ref, name: 'Apollo', type: 'divine', key: 'apollo' }], historicalFigures: [{ ...ref, name: 'Phidias', key: 'phidias' }], places: [{ ...ref, name: 'Athens (Acropolis)', key: 'athens' }], crossLinks: [], bibliography: [] } }),
  entry({ id: 'lexicon_agon', title: 'Agon' }),
  entry({ id: 'hom_01_ilias_i', title: 'Iliad, book I', collection: 'chapter', titles: { it: 'Iliade, canto I', pl: 'Iliada, pieśń I' } }),
]);

test('prefixes come first, entries before terms, shorter names first', () => {
  const r = suggest(index, 'ag');
  assert.deepEqual(r.slice(0, 3).map((s) => s.label), ['Agon', 'Agalma', 'ἄγαλμα']);
  assert.deepEqual(r.slice(0, 2).map((s) => s.kind), ['entry', 'entry']);
});

test('Greek is found from Latin letters and ignores accents', () => {
  assert.ok(suggest(index, 'agalma').some((s) => s.kind === 'term' && s.label === 'ἄγαλμα'));
  assert.ok(suggest(index, 'ἀγαλ').some((s) => s.label === 'Agalma'));
  assert.ok(suggest(index, 'apollo').some((s) => s.kind === 'character'));
});

test('titles in other languages match, and chapters open their own page', () => {
  const r = suggest(index, 'iliade');
  assert.equal(r[0].kind, 'chapter');
  assert.equal(r[0].entryId, 'hom_01_ilias_i');
  assert.equal(suggest(index, 'piesn')[0]?.entryId, 'hom_01_ilias_i'); // Polish title, typed without diacritics
});

test('words inside a name match; nothing is suggested for an empty query; the list is capped', () => {
  assert.ok(suggest(index, 'acropolis').some((s) => s.kind === 'place'));
  assert.deepEqual(suggest(index, ''), []);
  assert.ok(suggest(index, 'a', 2).length <= 2);
});

test('duplicates are collapsed', () => {
  const twice = buildSuggestions([entry({ id: 'a', title: 'Same' }), entry({ id: 'a', title: 'Same' })]);
  assert.equal(twice.length, 1);
});
