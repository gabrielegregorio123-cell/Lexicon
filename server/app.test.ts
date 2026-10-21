import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { createApp } from './app.ts';
import { buildEntryTemplate } from '../src/lib/entryTemplate.ts';

const TOKEN = 'secret-token';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lares-test-'));
const dataDir = path.join(tmp, 'data');
const backupDir = path.join(tmp, 'backups');
fs.mkdirSync(dataDir);

const xmlFor = (title: string, extra = '') =>
  buildEntryTemplate({ kind: 'lexicon', title, fileBase: `lexicon_${title.toLowerCase()}`, langs: ['en'], author: 'Test Author', date: '2026-01-01' }).replace(
    '<p></p>',
    `<p>Text <persName type="divine" key="zeus">Zeus</persName> ${extra}</p>`
  );
fs.writeFileSync(path.join(dataDir, 'lexicon_alpha.xml'), xmlFor('Alpha'));

delete process.env.GITHUB_REPO;
delete process.env.GITHUB_TOKEN;
const { app, close } = await createApp({
  dataDir,
  distDir: path.join(tmp, 'dist'),
  production: false,
  editorToken: TOKEN,
  pullIntervalMin: 0,
  stateFile: path.join(tmp, 'state.json'),
  backupDir,
  vite: false,
});
const server = app.listen(0);
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
test.after(() => {
  close();
  server.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

const put = (name: string, xml: string, token = TOKEN, isNew = false) =>
  fetch(`${base}/api/entries/${name}`, { method: 'PUT', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ xml, isNew }) });

test('the corpus index is slim: no HTML, no raw XML, bodies flagged as not loaded', async () => {
  const res = await fetch(`${base}/api/corpus`);
  assert.equal(res.status, 200);
  const { entries, failed } = await res.json();
  assert.deepEqual(failed, []);
  assert.equal(entries.length, 1);
  const e = entries[0];
  assert.equal(e.id, 'lexicon_alpha');
  assert.equal(e.rawXml, undefined);
  assert.equal(e.bodyLoaded, false);
  assert.ok(e.editions[0].sections.every((s: any) => s.html === ''));
  assert.equal(e.indexedData.characters[0].key, 'zeus');
});

test('the corpus is cached by ETag and revalidates with 304', async () => {
  const first = await fetch(`${base}/api/corpus`);
  const etag = first.headers.get('etag')!;
  assert.ok(etag);
  const again = await fetch(`${base}/api/corpus`, { headers: { 'if-none-match': etag } });
  assert.equal(again.status, 304);
});

test('an entry body (rendered HTML) is served on demand', async () => {
  const res = await fetch(`${base}/api/entries/lexicon_alpha/body`);
  const { sections } = await res.json();
  assert.ok(Object.values(sections).some((h) => /tei-person/.test(h as string)));
  assert.equal((await fetch(`${base}/api/entries/nope/body`)).status, 404);
});

test('responses carry basic security headers', async () => {
  const res = await fetch(`${base}/api/health`);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(res.headers.get('x-powered-by'), null);
  assert.equal((await res.json()).ok, true);
});

test('writes need the token; creating, updating, backing up and deleting work', async () => {
  assert.equal((await put('lexicon_beta.xml', xmlFor('Beta'), '')).status, 401);

  const created = await put('lexicon_beta.xml', xmlFor('Beta'), TOKEN, true);
  assert.equal(created.status, 200);
  assert.ok(fs.existsSync(path.join(dataDir, 'lexicon_beta.xml')));
  assert.ok(JSON.parse(fs.readFileSync(path.join(dataDir, 'manifest.json'), 'utf8')).includes('lexicon_beta.xml'));

  const { entries } = await (await fetch(`${base}/api/corpus`)).json();
  assert.ok(entries.some((e: any) => e.id === 'lexicon_beta')); // cache invalidated by the write

  assert.equal((await put('lexicon_beta.xml', xmlFor('Beta'), TOKEN, true)).status, 409); // already exists

  assert.equal((await put('lexicon_beta.xml', xmlFor('Beta', 'edited'))).status, 200);
  const backups = fs.readdirSync(backupDir).filter((f) => f.startsWith('lexicon_beta.'));
  assert.equal(backups.length, 1);
  assert.match(fs.readFileSync(path.join(backupDir, backups[0]), 'utf8'), /<p>Text/);
  assert.ok(!fs.readdirSync(dataDir).some((f) => f.includes('.tmp-'))); // atomic writes leave nothing behind

  const del = await fetch(`${base}/api/entries/lexicon_beta.xml`, { method: 'DELETE', headers: { authorization: `Bearer ${TOKEN}` } });
  assert.equal(del.status, 200);
  assert.ok(!fs.existsSync(path.join(dataDir, 'lexicon_beta.xml')));
  assert.equal(fs.readdirSync(backupDir).filter((f) => f.startsWith('lexicon_beta.')).length, 2);
});

test('invalid XML and unsafe names are rejected without touching the disk', async () => {
  const bad = await put('lexicon_bad.xml', '<TEI><a></TEI>');
  assert.equal(bad.status, 422);
  assert.ok((await bad.json()).issues.some((i: any) => i.code === 'not-well-formed'));
  assert.ok(!fs.existsSync(path.join(dataDir, 'lexicon_bad.xml')));

  const traversal = await put('..%2Fescape.xml', xmlFor('X'));
  assert.equal(traversal.status, 422);
  assert.ok(!fs.existsSync(path.join(tmp, 'escape.xml')));
});

const twoEditions = (word: string) => {
  const base = buildEntryTemplate({ kind: 'lexicon', title: 'Delta', fileBase: 'lexicon_delta', langs: ['en', 'it'], author: 'Test Author', date: '2026-01-01' });
  // English edition carries the annotations (so it is the one the indices use); the word lives only in the Italian one
  const en = base.replace('<p></p>', '<p>Text <persName type="divine" key="zeus">Zeus</persName> <persName type="hero" key="x">X</persName></p>');
  const at = en.indexOf('<div type="edition" xml:lang="it">');
  return en.slice(0, at) + en.slice(at).replace('<p></p>', `<p>Parola ${word} soltanto in italiano.</p>`);
};
const search = async (q: string, lang = 'it') => (await (await fetch(`${base}/api/search?q=${encodeURIComponent(q)}&lang=${lang}`)).json()) as { total: number; results: Array<{ id: string; snippetHtml: string }> };

test('search covers every edition and follows the corpus: new, edited and deleted entries', async () => {
  const v0 = (await (await fetch(`${base}/api/corpus/version`)).json()).version;

  assert.equal((await put('lexicon_delta.xml', twoEditions('zzxilofono'), TOKEN, true)).status, 200);
  const v1 = (await (await fetch(`${base}/api/corpus/version`)).json()).version;
  assert.notEqual(v1, v0); // clients polling the version learn about the change

  let r = await search('zzxilofono');
  assert.deepEqual(r.results.map((x) => x.id), ['lexicon_delta']); // found in the non-indexed Italian edition, right after the save
  assert.match(r.results[0].snippetHtml, /<mark[^>]*>zzxilofono<\/mark>/);

  assert.equal((await put('lexicon_delta.xml', twoEditions('zzcitara'))).status, 200);
  assert.equal((await search('zzxilofono')).total, 0); // the old word is gone
  assert.equal((await search('zzcitara')).total, 1); // the new one is there

  assert.equal((await search('zeus')).results.some((x) => x.id === 'lexicon_delta'), true); // annotations are searchable too
  const filtered = await (await fetch(`${base}/api/search?q=zeus&collection=chapter`)).json();
  assert.equal(filtered.total, 0); // facet filters apply

  await fetch(`${base}/api/entries/lexicon_delta.xml`, { method: 'DELETE', headers: { authorization: `Bearer ${TOKEN}` } });
  assert.equal((await search('zzcitara')).total, 0);
});

test('repeated wrong tokens are throttled', async () => {
  let last = 0;
  for (let i = 0; i < 12; i++) last = (await put('lexicon_gamma.xml', xmlFor('Gamma'), `wrong-${i}`)).status;
  assert.equal(last, 429);
  // even the right token waits out the window from the same address
  assert.equal((await put('lexicon_gamma.xml', xmlFor('Gamma'))).status, 429);
});
