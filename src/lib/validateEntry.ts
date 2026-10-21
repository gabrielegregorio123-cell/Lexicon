/**
 * Validation of a LARES file (lexicon entry or book chapter, EpiDoc TEI).
 *
 * Uses only the basic DOM API (getElementsByTagName / getAttribute) so the same
 * code runs in the browser (editor) and on the server (@xmldom/xmldom).
 */
import { SOURCE_TYPES } from './markup.ts';
import type { Language } from '../i18n/translations.ts';

type Msg = (a: string[]) => string;

/** Validation messages by code and language; `a` are the arguments passed with the issue. */
const MESSAGES: Record<Language, Record<string, Msg>> = {
  it: {
    'file-name': ([f]) => `Il nome file "${f}" non è valido: usa lexicon_<nome>.xml (o hom_, trag_, com_, cpch_ per i capitoli), solo lettere latine, cifre e "_".`,
    'not-well-formed': ([e]) => `XML non ben formato: ${e}`,
    root: () => 'L’elemento radice deve essere <TEI>.',
    title: () => 'Manca il titolo in <titleStmt><title>.',
    idno: () => 'Manca <idno type="filename"> in <publicationStmt>.',
    'idno-mismatch': ([i, b]) => `<idno type="filename"> ("${i}") non coincide con il nome del file ("${b}").`,
    revision: () => 'Manca la cronologia: <revisionDesc><listChange><change when="" who="">.',
    edition: () => 'Manca il testo: servono <div type="edition"> (it / en / pl) con le sezioni <div type="textpart">.',
    'edition-lang': () => 'Edizione senza xml:lang.',
    'textpart-head': () => '<div type="textpart"> senza <head> né @n.',
    'edition-empty': () => 'Edizione vuota.',
    'duplicate-id': ([id]) => `xml:id duplicato: "${id}".`,
    'rs-type': () => '<rs> senza @type (ambito del tesauro, es. practice, belief, speech…).',
    'rs-empty': () => '<rs> vuoto.',
    'persName-key': () => '<persName> senza @key: nell’indice verrà usato il testo.',
    'placeName-key': () => '<placeName> senza @key: nell’indice verrà usato il testo.',
    'ref-type': ([t, l]) => `<ref type="${t}"> non riconosciuto (attesi: ${l}).`,
    'ref-empty': () => '<ref> senza @type né @corresp: verrà ignorato.',
    'ref-target': ([c]) => `Il rimando "${c}" non corrisponde a nessuna scheda o capitolo esistente.`,
    'hi-bold': () => 'Per il grassetto la convenzione è <emph>, non <hi rend="bold">.',
    'unknown-tag': ([t]) => `Elemento <${t}> non gestito: sarà mostrato come testo semplice.`,
  },
  en: {
    'file-name': ([f]) => `The file name "${f}" is not valid: use lexicon_<name>.xml (or hom_, trag_, com_, cpch_ for chapters), Latin letters, digits and "_" only.`,
    'not-well-formed': ([e]) => `XML is not well-formed: ${e}`,
    root: () => 'The root element must be <TEI>.',
    title: () => 'The title is missing in <titleStmt><title>.',
    idno: () => '<idno type="filename"> is missing in <publicationStmt>.',
    'idno-mismatch': ([i, b]) => `<idno type="filename"> ("${i}") does not match the file name ("${b}").`,
    revision: () => 'The change log is missing: <revisionDesc><listChange><change when="" who="">.',
    edition: () => 'The text is missing: <div type="edition"> elements (it / en / pl) with <div type="textpart"> sections are required.',
    'edition-lang': () => 'Edition without xml:lang.',
    'textpart-head': () => '<div type="textpart"> without <head> or @n.',
    'edition-empty': () => 'Empty edition.',
    'duplicate-id': ([id]) => `Duplicate xml:id: "${id}".`,
    'rs-type': () => '<rs> without @type (thesaurus realm, e.g. practice, belief, speech…).',
    'rs-empty': () => 'Empty <rs>.',
    'persName-key': () => '<persName> without @key: the text will be used in the index.',
    'placeName-key': () => '<placeName> without @key: the text will be used in the index.',
    'ref-type': ([t, l]) => `<ref type="${t}"> not recognised (expected: ${l}).`,
    'ref-empty': () => '<ref> with neither @type nor @corresp: it will be ignored.',
    'ref-target': ([c]) => `The link "${c}" does not match any existing entry or chapter.`,
    'hi-bold': () => 'For bold the convention is <emph>, not <hi rend="bold">.',
    'unknown-tag': ([t]) => `Element <${t}> is not handled: it will be shown as plain text.`,
  },
  pl: {
    'file-name': ([f]) => `Nazwa pliku „${f}” jest nieprawidłowa: użyj lexicon_<nazwa>.xml (lub hom_, trag_, com_, cpch_ dla rozdziałów), tylko liter łacińskich, cyfr i „_”.`,
    'not-well-formed': ([e]) => `XML jest niepoprawnie zbudowany: ${e}`,
    root: () => 'Elementem głównym musi być <TEI>.',
    title: () => 'Brak tytułu w <titleStmt><title>.',
    idno: () => 'Brak <idno type="filename"> w <publicationStmt>.',
    'idno-mismatch': ([i, b]) => `<idno type="filename"> („${i}”) nie zgadza się z nazwą pliku („${b}”).`,
    revision: () => 'Brak historii zmian: <revisionDesc><listChange><change when="" who="">.',
    edition: () => 'Brak tekstu: wymagane są elementy <div type="edition"> (it / en / pl) z sekcjami <div type="textpart">.',
    'edition-lang': () => 'Edycja bez xml:lang.',
    'textpart-head': () => '<div type="textpart"> bez <head> i @n.',
    'edition-empty': () => 'Pusta edycja.',
    'duplicate-id': ([id]) => `Zduplikowany xml:id: „${id}”.`,
    'rs-type': () => '<rs> bez @type (dziedzina tezaurusa, np. practice, belief, speech…).',
    'rs-empty': () => 'Pusty <rs>.',
    'persName-key': () => '<persName> bez @key: w indeksie zostanie użyty tekst.',
    'placeName-key': () => '<placeName> bez @key: w indeksie zostanie użyty tekst.',
    'ref-type': ([t, l]) => `<ref type="${t}"> nie jest rozpoznawany (oczekiwane: ${l}).`,
    'ref-empty': () => '<ref> bez @type i @corresp: zostanie pominięty.',
    'ref-target': ([c]) => `Odsyłacz „${c}” nie odpowiada żadnemu istniejącemu hasłu ani rozdziałowi.`,
    'hi-bold': () => 'Do pogrubienia obowiązuje <emph>, a nie <hi rend="bold">.',
    'unknown-tag': ([t]) => `Element <${t}> nie jest obsługiwany: zostanie pokazany jako zwykły tekst.`,
  },
};


export type IssueLevel = 'error' | 'warning';

export interface Issue {
  level: IssueLevel;
  code: string;
  message: string;
  /** Text of the offending element, to help locate it. */
  snippet?: string;
  line?: number;
}

export interface ParsedXml {
  doc: any | null;
  /** Well-formedness errors reported by the XML parser. */
  errors: string[];
}

export type XmlParseFn = (xml: string) => ParsedXml;

/** Project convention: Latin letters, digits and "_" only (no spaces, no Greek). */
export const FILE_NAME_RE = /^(lexicon|hom|trag|com|cpch)_[A-Za-z0-9_]+\.xml$/;

/** Internal links point at another file: lexicon_x.html, hom_01_ilias_i.html… */
export const ENTRY_LINK_RE = /^(?:\.\/|\/)?(?:#)?((?:lexicon|hom|trag|com|cpch)_[A-Za-z0-9_]+)(?:\.html|\.xml)?(?:#.*)?$/;

const KNOWN_TAGS = new Set(
  (
    'TEI teiHeader fileDesc titleStmt title author respStmt resp name publicationStmt publisher authority pubPlace date idno ' +
    'availability licence p notesStmt note sourceDesc revisionDesc listChange change text body div head ' +
    'w ref rs persName placeName listBibl bibl hi emph foreign list item lb l lg gap unclear supplied add del orig reg ' +
    'quote cit ptr time msDesc physDesc objectDesc supportDesc support width origin provenance repository editionStmt ' +
    'seriesStmt encodingDesc profileDesc langUsage language graphic'
  ).split(' ')
);

function all(doc: any, tag: string): any[] {
  const list = doc.getElementsByTagName(tag);
  const out: any[] = [];
  for (let i = 0; i < list.length; i++) out.push(list[i]);
  return out;
}

function text(el: any): string {
  return ((el && el.textContent) || '').replace(/\s+/g, ' ').trim();
}

function snip(el: any): string {
  const t = text(el);
  return t.length > 60 ? `${t.slice(0, 57)}…` : t;
}

const attrOf = (el: any, n: string): string => (el.getAttribute && el.getAttribute(n)) || '';

export function validateEntryXml(
  xml: string,
  opts: { parse: XmlParseFn; fileName?: string; knownEntryIds?: string[]; lang?: Language }
): Issue[] {
  const issues: Issue[] = [];
  const catalogue = MESSAGES[opts.lang || 'it'];
  const push = (level: IssueLevel, code: string, args: string[] = [], el?: any) =>
    issues.push({ level, code, message: catalogue[code](args), snippet: el ? snip(el) : undefined });

  if (opts.fileName !== undefined && !FILE_NAME_RE.test(opts.fileName)) {
    push('error', 'file-name', [opts.fileName]);
  }

  const { doc, errors } = opts.parse(xml.replace(/^[﻿\s]+/, ''));
  if (!doc || errors.length > 0) {
    (errors.length ? errors : ['?']).forEach((e) => {
      const line = /line[:\s]+(\d+)/i.exec(e)?.[1];
      issues.push({ level: 'error', code: 'not-well-formed', message: catalogue['not-well-formed']([e]), line: line ? Number(line) : undefined });
    });
    return issues;
  }

  const root = doc.documentElement;
  if (!root || root.tagName !== 'TEI') {
    push('error', 'root');
    return issues;
  }

  // ── Header ─────────────────────────────────────────────────────────────────
  const titles = all(doc, 'title').filter((t) => t.parentNode?.tagName === 'titleStmt');
  if (!titles.length || !titles.some((t) => text(t))) push('error', 'title');

  const idno = all(doc, 'idno').find((i) => attrOf(i, 'type') === 'filename');
  if (!idno || !text(idno)) {
    push('warning', 'idno');
  } else if (opts.fileName && text(idno) !== opts.fileName.replace(/\.xml$/, '')) {
    push('warning', 'idno-mismatch', [text(idno), opts.fileName.replace(/\.xml$/, '')], idno);
  }

  if (!all(doc, 'change').some((c) => attrOf(c, 'who'))) {
    push('warning', 'revision');
  }

  // ── Body ───────────────────────────────────────────────────────────────────
  const divs = all(doc, 'div');
  const editions = divs.filter((d) => /^(edition|translation)$/.test(attrOf(d, 'type')));
  const hasStructure = divs.some((d) => /^(textpart|bibliography)$/.test(attrOf(d, 'type')));
  if (!editions.length && !hasStructure) {
    push('error', 'edition');
  }
  editions.forEach((ed) => {
    if (!attrOf(ed, 'xml:lang') && editions.length > 1) push('warning', 'edition-lang', [], ed);
    let parts = 0;
    for (let c = ed.firstChild; c; c = c.nextSibling) {
      if (c.tagName === 'div') {
        parts++;
        let head: any = null;
        for (let h = c.firstChild; h; h = h.nextSibling) if (h.tagName === 'head') head = h;
        if (!head && !attrOf(c, 'n')) push('warning', 'textpart-head', [], c);
      }
    }
    if (!parts && !text(ed)) push('warning', 'edition-empty', [], ed);
  });

  const seen = new Set<string>();
  all(doc, '*').forEach((el) => {
    const id = attrOf(el, 'xml:id');
    if (!id) return;
    if (seen.has(id)) push('error', 'duplicate-id', [id], el);
    seen.add(id);
  });

  // ── Annotation tags ────────────────────────────────────────────────────────
  all(doc, 'rs').forEach((el) => {
    if (!attrOf(el, 'type') && !attrOf(el, 'key')) push('error', 'rs-type', [], el);
    if (!text(el)) push('warning', 'rs-empty', [], el);
  });

  all(doc, 'persName').forEach((el) => {
    if (!attrOf(el, 'key')) push('warning', 'persName-key', [], el);
  });

  all(doc, 'placeName').forEach((el) => {
    if (!attrOf(el, 'key')) push('warning', 'placeName-key', [], el);
  });

  all(doc, 'ref').forEach((el) => {
    const type = attrOf(el, 'type').toLowerCase();
    const corresp = (attrOf(el, 'corresp') || attrOf(el, 'target')).trim();
    if (type && !(SOURCE_TYPES as readonly string[]).includes(type) && type !== 'myth') {
      push('warning', 'ref-type', [type, SOURCE_TYPES.join(', ')], el);
    } else if (!type && !corresp) {
      push('warning', 'ref-empty', [], el);
    }
    const m = corresp ? ENTRY_LINK_RE.exec(corresp) : null;
    if (m && opts.knownEntryIds && !opts.knownEntryIds.includes(m[1].toLowerCase())) {
      push('warning', 'ref-target', [corresp], el);
    }
  });

  all(doc, 'hi').forEach((el) => {
    if (/bold/.test(attrOf(el, 'rend'))) push('warning', 'hi-bold', [], el);
  });

  const unknown = new Set<string>();
  all(doc, '*').forEach((el) => {
    if (!KNOWN_TAGS.has(el.tagName)) unknown.add(el.tagName);
  });
  unknown.forEach((t) => push('warning', 'unknown-tag', [t]));

  return issues;
}

/** Browser parser: DOMParser + <parsererror> detection. */
export function browserParse(xml: string): ParsedXml {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  const err = doc.getElementsByTagName('parsererror')[0];
  if (err) {
    const msg = (err.textContent || 'parse error').replace(/\s+/g, ' ').trim();
    return { doc: null, errors: [msg.slice(0, 240)] };
  }
  return { doc, errors: [] };
}
