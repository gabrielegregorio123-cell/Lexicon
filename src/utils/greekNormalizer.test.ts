import test from 'node:test';
import assert from 'node:assert/strict';
import { stripDiacritics, greekToLatin, matchesQuery, getSearchTokens } from './greekNormalizer.ts';

test('Greek diacritic stripping handles polytonic accents', () => {
  assert.equal(stripDiacritics('ἄγαλμα'), 'αγαλμα');
  assert.equal(stripDiacritics('Ἀπόλλων'), 'απολλων');
  assert.equal(stripDiacritics('πίστις'), 'πιστισ'); // final sigma normalized to sigma
  assert.equal(stripDiacritics('θεός'), 'θεοσ');
});

test('Greek to Latin transliteration works correctly', () => {
  assert.equal(greekToLatin('ἄγαλμα'), 'agalma');
  assert.equal(greekToLatin('πίστις'), 'pistis');
  assert.equal(greekToLatin('ἀνάθημα'), 'anathema');
});

test('Greek diacritic- and accent-insensitive matching works', () => {
  // Query in polytonic Greek matches plain Greek
  assert.equal(matchesQuery('ἄγαλμα', 'αγαλμα'), true);
  // Plain Greek matches polytonic
  assert.equal(matchesQuery('ἀνάθημα', 'αναθημα'), true);
  // Latin transliteration matches Greek
  assert.equal(matchesQuery('ἄγαλμα', 'agalma'), true);
  assert.equal(matchesQuery('πίστις', 'pistis'), true);
  // Uppercase matches lowercase
  assert.equal(matchesQuery('Fides', 'fides'), true);
  assert.equal(matchesQuery('HEREM', 'herem'), true);
  // Non-matching term returns false
  assert.equal(matchesQuery('ἄγαλμα', 'zeus'), false);
});

test('Search token extraction returns comprehensive variants', () => {
  const tokens = getSearchTokens('ἄγαλμα Δελφοί');
  assert.ok(tokens.includes('ἄγαλμα'));
  assert.ok(tokens.includes('αγαλμα'));
  assert.ok(tokens.includes('agalma'));
  assert.ok(tokens.includes('δελφοι'));
});
