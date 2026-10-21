import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { sha256Hex } from './sha256.ts';
import { ACCESS_HASH, fingerprint, passwordOk } from './gate.ts';

test('sha256Hex matches the reference implementation', () => {
  const samples = ['', 'abc', 'Babele', 'ἄγαλμα — Żółć', 'x'.repeat(55), 'x'.repeat(56), 'x'.repeat(64), 'x'.repeat(1000)];
  for (const s of samples) assert.equal(sha256Hex(s), createHash('sha256').update(s).digest('hex'), JSON.stringify(s.slice(0, 20)));
});

test('the access page accepts the right password and nothing else', () => {
  assert.ok(ACCESS_HASH.length === 64);
  assert.ok(passwordOk('Babele'));
  assert.ok(passwordOk('  Babele  ')); // surrounding blanks are ignored
  assert.ok(!passwordOk('babele'));
  assert.ok(!passwordOk('Babel'));
  assert.ok(!passwordOk(''));
  assert.notEqual(fingerprint('Babele'), sha256Hex('Babele')); // salted: not the bare hash of the word
});
