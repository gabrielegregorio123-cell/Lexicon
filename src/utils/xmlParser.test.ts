import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DOMParser } from '@xmldom/xmldom';
import { parseEpiDocXml } from './xmlParser.ts';

const parser = new DOMParser({ onError: () => {} }) as any;
const parse = (xml: string, fileName: string) => parseEpiDocXml(xml, fileName, parser);

const wrap = (body: string, header = '', rootAttrs = '') => `<?xml version="1.0" encoding="UTF-8"?>
<TEI xmlns="http://www.tei-c.org/ns/1.0"${rootAttrs}>
  <teiHeader><fileDesc>
    <titleStmt><title xml:lang="en">Sample</title>${header}</titleStmt>
    <publicationStmt><date when="2023"/><idno type="filename">something_else</idno></publicationStmt>
    <sourceDesc><p>Born digital document.</p></sourceDesc>
  </fileDesc>
  <revisionDesc><listChange>
    <change when="2023-01-01" who="PedroGiménezDeAragón">encoded in XML</change>
    <change when="2023-01-02" who="Caterina_Borgatti">written contents</change>
  </listChange></revisionDesc></teiHeader>
  <text><body>${body}</body></text>
</TEI>`;

test('the file name, not <idno>, is the entry id', () => {
  const { entry } = parse(wrap('<div type="edition" xml:lang="en"><div type="textpart" n="a"><p>x</p></div></div>'), 'lexicon_sample.xml');
  assert.equal(entry!.id, 'lexicon_sample');
  assert.equal(entry!.collection, 'lexicon');
});

test('author names are normalised (underscores, CamelCase) and writers win over encoders', () => {
  const { entry } = parse(wrap('<div type="edition" xml:lang="en"><div type="textpart" n="a"><p>x</p></div></div>'), 'lexicon_sample.xml');
  assert.deepEqual(entry!.authors.map((a) => a.name), ['Caterina Borgatti']);
  assert.deepEqual(entry!.revisions.map((r) => r.who), ['Pedro Giménez De Aragón', 'Caterina Borgatti']);
});

test('editions of the same language are merged in document order', () => {
  const { entry } = parse(
    wrap(`<div type="edition" xml:lang="en"><div type="textpart" n="One"><head>One</head><p>a</p></div></div>
          <div type="edition" xml:lang="en"><div type="textpart" n="Two"><head>Two</head><p>b <div type="translation" xml:lang="en"><p>t</p></div></p></div></div>
          <div type="edition" xml:lang="it"><div type="textpart" n="Uno"><head>Uno</head><p>c</p></div></div>`),
    'lexicon_sample.xml'
  );
  const en = entry!.editions.find((e) => e.lang === 'en')!;
  assert.deepEqual(en.sections.map((s) => s.head), ['One', 'Two']);
  assert.equal(entry!.editions.length, 2);
});

test('an unlabelled edition in a chapter is the Polish original; "intro" gets a localised head', () => {
  const { entry } = parse(wrap('<div type="edition"><div type="textpart" n="intro"><p>Wstęp</p></div></div>'), 'hom_00_intro.xml');
  assert.equal(entry!.collection, 'chapter');
  assert.equal(entry!.volume, 'hom');
  assert.equal(entry!.editions[0].lang, 'pl');
  assert.equal(entry!.editions[0].sections[0].head, 'Wstęp');
});

test('textparts directly in the body (no edition div) are still split into sections', () => {
  const { entry } = parse(wrap('<div type="textpart" n="Etimologia"><p>a</p></div><div type="textpart" n="Attestazioni"><p>b</p></div><div type="bibliography"><p>Rossi, M. (2001). Titolo.</p></div>'), 'lexicon_anathema.xml');
  assert.deepEqual(entry!.sections.map((s) => s.head), ['Etimologia', 'Attestazioni', 'Bibliography']);
  assert.equal(entry!.indexedData.bibliography[0].date, '2001');
});

test('annotations feed the indices; bare <w> and variant spellings are handled', () => {
  const { entry } = parse(
    wrap(`<div type="edition" xml:lang="en"><div type="textpart" n="a"><p>
      <w lemma="ἄγαλμα">ἀγάλματα</w> <w>plain</w>
      <ref type="lit">Od. 3.438</ref> <ref type="author">Homer</ref>
      <rs type="Activities" subtype="Ritual_Practice">rite</rs> <rs key="practice">other</rs> <rs type="practice;belief" subtype="a;b">multi</rs> <rs key="place">Delphi</rs>
      <persName type="devine" key="apollo">Apollo</persName> <persName type="Myth" key="x">X</persName> <persName type="attested" key="plato">Plato</persName> <persName key="solon">Solon</persName>
      <placeName key="athens">Athens</placeName>
      <ref corresp="lexicon_fides.html">fides</ref> <ref corresp="https://example.org/a?b=1&amp;c=2"></ref>
    </p></div></div>`),
    'lexicon_sample.xml'
  );
  const d = entry!.indexedData;
  assert.deepEqual(d.terms.map((t) => t.lemma), ['ἄγαλμα']); // bare <w> is not a term
  assert.deepEqual(d.sources.map((s) => s.type), ['lit', 'author']);
  assert.ok(d.realms.some((r) => r.type === 'Activities' && r.subtype === 'Ritual Practice'));
  assert.ok(d.realms.some((r) => r.type === 'practice' && r.text === 'other')); // key as type
  assert.equal(d.realms.filter((r) => r.text === 'multi').length, 2); // "a;b" values split
  assert.deepEqual(d.characters.map((c) => `${c.type}:${c.key}`), ['divine:apollo', 'myth:x']);
  assert.deepEqual(d.historicalFigures.map((h) => h.key), ['plato', 'solon']);
  assert.deepEqual(d.places.map((p) => p.name).sort(), ['Athens', 'Delphi']);
  assert.equal(d.crossLinks[0].targetEntryId, 'lexicon_fides');
  const html = entry!.sections[0].html;
  assert.match(html, /href="#\/entry\/lexicon_fides"/);
  assert.match(html, /class="tei-ext" href="https:\/\/example.org\/a\?b=1&amp;c=2"/);
  assert.doesNotMatch(html, /<ref|<w |<persName|<rs /); // no TEI element leaks into the page
});

test('verse quotations render one line per <lb/>', () => {
  const { entry } = parse(wrap('<div type="edition" xml:lang="en"><div type="textpart" n="a"><quote><lb/>one<lb n="5"/>two</quote></div></div>'), 'hom_01_x.xml');
  assert.match(entry!.sections[0].html, /<blockquote class="tei-quote">one<br><span class="tei-ln">5<\/span>two<\/blockquote>/);
});

test('files that start with blanks before the XML declaration still parse', () => {
  const xml = '\n  ' + wrap('<div type="edition" xml:lang="en"><div type="textpart" n="a"><p>x</p></div></div>');
  assert.ok(parse(xml, 'lexicon_oneiropolos.xml').entry);
});

test('the real corpus parses without errors', { skip: !fs.existsSync('public/data') }, () => {
  const files = fs.readdirSync('public/data').filter((f) => f.endsWith('.xml'));
  const bad = files.map((f) => ({ f, r: parse(fs.readFileSync(`public/data/${f}`, 'utf8'), f) })).filter((x) => !x.r.entry);
  assert.deepEqual(bad.map((b) => `${b.f}: ${b.r.error}`), []);
  const ids = files.map((f) => f.replace(/\.xml$/, '').toLowerCase());
  assert.equal(new Set(ids).size, ids.length);
});
