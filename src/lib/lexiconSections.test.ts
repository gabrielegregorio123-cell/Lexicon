import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import {
  buildModel, tokenize, serializeTokens, setHead, setContent, setTitles, addChange, setAttr,
  addEdition, wrapSlice, unwrapElement, inner, swapSiblings, removeNode,
} from './lexiconSections.ts';

const dir = new URL('../../public/data/', import.meta.url);
const files = readdirSync(dir).filter((f) => f.endsWith('.xml'));
const load = (f: string) => readFileSync(new URL(f, dir), 'utf8');

test('ogni file del corpus si scansiona e ha edizioni', () => {
  for (const f of files) {
    const m = buildModel(load(f));
    assert.ok(m.body, f);
    assert.ok(m.editions.length + m.bibliographies.length + m.others.length > 0, f);
  }
});

test('il contenuto dei textpart sopravvive a tokenize/serialize (a parte le entità)', () => {
  const norm = (s: string) => s.replace(/<([^<>]+)>/g, (_, x) => '<' + x.replace(/\s+/g, ' ').replace(/\s*=\s*/g, '=').replace(/ $/, '').replace(/ \//, '/') + '>').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/'([^'<>]*)'(?=[\s/>])/g, '"$1"');
  let bad = 0;
  for (const f of files) {
    const xml = load(f);
    for (const ed of buildModel(xml).editions)
      for (const tp of ed.textparts) {
        const c = xml.slice(tp.contentStart, tp.contentEnd);
        if (norm(serializeTokens(tokenize(c))) !== norm(c)) bad++;
      }
  }
  assert.equal(bad, 0);
});

test('le modifiche sono patch-only', () => {
  const xml = load('lexicon_keya.xml');
  const m = buildModel(xml);
  const tp = m.editions[0].textparts[0];
  const out = setHead(xml, tp, 'Morfologia');
  assert.match(out, /<div type="textpart">\n\s+<head>Morfologia<\/head>/);
  assert.equal(out.replace(/\n\s+<head>Morfologia<\/head>/, ''), xml);
  // contenuto: solo lo span del textpart cambia
  const out2 = setContent(xml, tp, '<p>x</p>');
  assert.equal(out2.slice(0, tp.contentStart), xml.slice(0, tp.contentStart));
  assert.equal(out2.slice(tp.contentStart + 8), xml.slice(tp.contentEnd));
});

test('titoli, revisioni, attributi, nuova edizione', () => {
  const xml = load('lexicon_keya.xml');
  let m = buildModel(xml);
  let out = setTitles(xml, m, [{ lang: 'grc', text: 'κηΰα' }, { lang: 'it', text: 'Keya' }]);
  m = buildModel(out);
  assert.deepEqual(m.titles.map((t) => t.text), ['κηΰα', 'Keya']);
  out = addChange(out, m, { when: '2026-11-11', who: 'GG', text: 'revisione' });
  m = buildModel(out);
  assert.equal(m.changes[0].who, 'GG');
  assert.equal(m.changes.length, 4);
  out = setAttr(out, m.editions[0].textparts[0].node, 'n', 'Lemma');
  m = buildModel(out);
  assert.equal(m.editions[0].textparts[0].n, 'Lemma');
  out = addEdition(out, m, 'de');
  m = buildModel(out);
  assert.equal(m.editions.length, 4);
  assert.equal(m.editions[3].lang, 'de');
  assert.equal(m.bibliographies.length, 1);
  const [a, b] = m.editions;
  out = swapSiblings(out, a.node, b.node);
  assert.equal(buildModel(out).editions[0].lang, 'en');
  out = removeNode(out, buildModel(out).editions[3].node);
  assert.equal(buildModel(out).editions.length, 3);
});

test('wrap e unwrap su token', () => {
  const toks = tokenize('<p>il termine κηΰα qui</p>');
  const p = toks[0];
  assert.equal(p.kind, 'el');
  const w = wrapSlice(toks, [0, 0], 11, [0, 0], 15, (s) => ({ kind: 'el', name: 'w', attrs: { lemma: 'κηΰα' }, children: s, selfClosing: false }));
  assert.equal(serializeTokens(w), '<p>il termine <w lemma="κηΰα">κηΰα</w> qui</p>');
  assert.equal(serializeTokens(unwrapElement(w, [0, 1])), '<p>il termine κηΰα qui</p>');
});

test('bibliografie riconosciute in entrambe le forme', () => {
  const xml = load('lexicon_fides.xml');
  const m = buildModel(xml);
  assert.ok(m.bibliographies.some((b) => b.form === 'textpart'));
  assert.ok(inner(xml, m.bibliographies[0].node).length > 0);
});

test('nuova scheda: sezioni del modello Ioudaios, @n uguale in tutte le lingue', async () => {
  const { buildEntryTemplate } = await import('./entryTemplate.ts');
  const { sectionTypeOf, SECTION_TYPES } = await import('./lexiconCatalogue.ts');
  const xml = buildEntryTemplate({ kind: 'lexicon', title: 'Prova', fileBase: 'lexicon_prova', langs: ['it', 'en'], author: 'GG', date: '2026-11-12' });
  const m = buildModel(xml);
  assert.equal(m.editions.length, 2);
  for (const ed of m.editions) {
    assert.deepEqual(ed.textparts.map((t) => t.n), SECTION_TYPES.map((t) => t.n));
    assert.ok(ed.textparts.every((t) => sectionTypeOf(t.n, '')));
  }
  assert.equal(inner(xml, m.editions[0].textparts[2].head!), 'Testimonianze');
  // riconosce anche le sezioni scritte a mano nel corpus
  assert.equal(sectionTypeOf('Poświadczenia', '')?.n, 'testimonies');
  assert.equal(sectionTypeOf('Discussion/Interpretation', '')?.n, 'discussion / interpretation');
  assert.equal(sectionTypeOf('', 'Testimonies')?.n, 'testimonies');
  assert.equal(sectionTypeOf('Etymology', 'Etymology')?.n, 'etymology');
});
