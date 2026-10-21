import test from 'node:test';
import assert from 'node:assert/strict';
import { xmlParse as parse } from '../../server/xmlParse.ts';
import { applyTagToRange, slugify, wrapWithTag } from './markup.ts';
import { buildEntryTemplate, fileNameFor } from './entryTemplate.ts';
import { FILE_NAME_RE, validateEntryXml } from './validateEntry.ts';

const template = buildEntryTemplate({
  kind: 'lexicon',
  title: 'Agalma',
  fileBase: 'lexicon_agalma',
  langs: ['en', 'it'],
  author: 'Anna Rossi',
  date: '2026-01-02',
});

test('slugify strips diacritics and separators', () => {
  assert.equal(slugify('Athens (Acropolis)'), 'athens_acropolis');
  assert.equal(slugify('Ἀπόλλων'), 'apollon');
  assert.equal(slugify('ἄγαλμα'), 'agalma');
});

test('wrapWithTag escapes attribute values and skips empty ones', () => {
  assert.equal(wrapWithTag('rs', { type: 'Activities', subtype: '' }, 'x'), '<rs type="Activities">x</rs>');
  assert.equal(wrapWithTag('ref', { corresp: '#a"b' }, 'x'), '<ref corresp="#a&quot;b">x</ref>');
});

test('applyTagToRange wraps the selection and reports the new selection', () => {
  const r = applyTagToRange('see Apollo here', 4, 10, 'persName', { type: 'divine', key: 'apollo' });
  assert.equal(r.text, 'see <persName type="divine" key="apollo">Apollo</persName> here');
  assert.equal(r.text.slice(r.selStart, r.selEnd), 'Apollo');
});

test('applyTagToRange inserts a placeholder when nothing is selected', () => {
  const r = applyTagToRange('ab', 1, 1, 'hi', { rend: 'italic' });
  assert.equal(r.text, 'a<hi rend="italic">text</hi>b');
});

test('file names follow the project convention', () => {
  assert.equal(fileNameFor('lexicon', 'Bar Mitzvah'), 'lexicon_bar_mitzvah.xml');
  assert.equal(fileNameFor('hom', 'Iliad XXV', ['hom_01_ilias_i.xml', 'hom_43_bibliography.xml']), 'hom_44_iliad_xxv.xml');
  assert.ok(FILE_NAME_RE.test('lexicon_Hebraios.xml'));
  assert.ok(FILE_NAME_RE.test('hom_01_ilias_i.xml'));
  assert.ok(!FILE_NAME_RE.test('lexicon_ἄγαλμα.xml'));
  assert.ok(!FILE_NAME_RE.test('../etc/passwd.xml'));
});

test('the generated template is a valid entry', () => {
  const errors = validateEntryXml(template, { parse, fileName: 'lexicon_agalma.xml' }).filter((i) => i.level === 'error');
  assert.deepEqual(errors, []);
});

test('malformed XML is reported as an error', () => {
  const issues = validateEntryXml(template.replace('</body>', ''), { parse });
  assert.ok(issues.some((i) => i.level === 'error' && i.code === 'not-well-formed'));
});

test('rs without type, duplicate ids and bad file names are errors', () => {
  const broken = template.replace('<p></p>', '<p><rs>x</rs><w xml:id="a"/><w xml:id="a"/></p>');
  const codes = validateEntryXml(broken, { parse, fileName: 'Bad Name.xml' })
    .filter((i) => i.level === 'error')
    .map((i) => i.code);
  assert.ok(codes.includes('rs-type'));
  assert.ok(codes.includes('duplicate-id'));
  assert.ok(codes.includes('file-name'));
});

test('unknown cross-reference targets are warned about', () => {
  const withRef = template.replace('<p></p>', '<p><ref corresp="lexicon_nowhere.html">x</ref></p>');
  const issues = validateEntryXml(withRef, { parse, knownEntryIds: ['lexicon_agalma'] });
  assert.ok(issues.some((i) => i.code === 'ref-target' && i.level === 'warning'));
});

test('every validation message exists in Italian, English and Polish', () => {
  const noisy = template
    .replace('<p></p>', '<p><rs>x</rs><w xml:id="a"/><w xml:id="a"/><persName>P</persName><placeName>Q</placeName><ref type="zzz">r</ref><ref/><ref corresp="lexicon_nowhere.html">n</ref><hi rend="bold">b</hi><odd/></p>')
    .replace('<idno type="filename">lexicon_agalma</idno>', '<idno type="filename">other</idno>')
    .replace(/<change [^>]*>[^<]*<\/change>/g, '');
  for (const lang of ['it', 'en', 'pl'] as const) {
    const issues = validateEntryXml(noisy, { parse, fileName: 'Bad Name.xml', knownEntryIds: [], lang });
    const codes = new Set(issues.map((i) => i.code));
    for (const c of ['file-name', 'idno-mismatch', 'revision', 'duplicate-id', 'rs-type', 'persName-key', 'placeName-key', 'ref-type', 'ref-empty', 'ref-target', 'hi-bold', 'unknown-tag']) assert.ok(codes.has(c), `${lang}: ${c}`);
    assert.ok(issues.every((i) => i.message && !/undefined/.test(i.message)), lang);
  }
  const broken = ['it', 'en', 'pl'].map((lang) => validateEntryXml('<TEI><a></TEI>', { parse, lang: lang as 'it' })[0].message);
  assert.equal(new Set(broken).size, 3); // the prefix is localised in every language
  const root = ['it', 'en', 'pl'].map((lang) => validateEntryXml('<a/>', { parse, lang: lang as 'it' })[0].message);
  assert.equal(new Set(root).size, 3);
});
