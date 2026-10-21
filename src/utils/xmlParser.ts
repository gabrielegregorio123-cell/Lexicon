import type {
  AuthorResp,
  BiblItem,
  ChapterVolume,
  EditionItem,
  LexiconEntry,
  RevisionItem,
  SectionItem,
} from '../types/lexicon.ts';
import { kids, mapRsToCategory, renderNodes, sanitizeEntryId, textOf, type Collectors, type RenderContext } from './teiRender.ts';

export { mapRsToCategory, sanitizeEntryId };

/**
 * Parser for LARES EpiDoc files (lexicon entries and book chapters).
 *
 * Layout it understands (see docs/efes/):
 *   <teiHeader>  titleStmt/title[@xml:lang], publicationStmt (date, idno filename),
 *                revisionDesc/listChange/change[@who]
 *   <body>       div[@type=edition|translation][@xml:lang]
 *                  └ div[@type=textpart][@n] > head, p, quote, list…
 *                div[@type=bibliography] > p | bibl
 *
 * Only the basic DOM API is used so the same code runs in the browser and in Node tests.
 */

export function detectScriptType(text: string): 'Greek' | 'Latin' | 'Hebrew' | 'Other' {
  if (/[Ͱ-Ͽἀ-῿]/.test(text)) return 'Greek';
  if (/[֐-׿]/.test(text)) return 'Hebrew';
  if (/[a-zA-Z]/.test(text)) return 'Latin';
  return 'Other';
}

export const VOLUME_BY_PREFIX: Record<string, ChapterVolume> = { hom: 'hom', trag: 'trag', com: 'com', cpch: 'cpch' };

const LANG_PREFERENCE = ['en', 'it', 'pl'];
const ANNOTATION_TAGS = ['w', 'ref', 'rs', 'persName', 'placeName'];

function lname(node: any): string {
  return (node.localName || node.nodeName || '').replace(/^.*:/, '');
}

function attr(el: any, name: string): string {
  return (el && el.getAttribute && el.getAttribute(name)) || '';
}

function childEls(el: any, name?: string): any[] {
  return kids(el).filter((c) => c.nodeType === 1 && (!name || lname(c) === name));
}

function descendants(el: any, name: string): any[] {
  const list = el.getElementsByTagName(name);
  const out: any[] = [];
  for (let i = 0; i < list.length; i++) out.push(list[i]);
  return out;
}

function firstDesc(el: any, name: string): any | null {
  return descendants(el, name)[0] || null;
}

function annotationCount(el: any): number {
  return ANNOTATION_TAGS.reduce((n, t) => n + el.getElementsByTagName(t).length, 0);
}

function pickTitle(titles: Record<string, string>): string {
  for (const l of [...LANG_PREFERENCE, 'grc', 'la']) if (titles[l]) return titles[l];
  return Object.values(titles)[0] || '';
}

function slug(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** "Beeks, Robert (2009). Etymological…" → author / year, best effort. */
function toBiblItem(p: any, entryId: string, entryTitle: string, n: number): BiblItem {
  const full = textOf(p);
  const year = /\((\d{4}[a-z]?)\)/.exec(full)?.[1] || /\b(1[5-9]\d\d|20\d\d)\b/.exec(full)?.[1] || 'n.d.';
  const author = (/^(.*?)\s*[\(\.]/.exec(full)?.[1] || full.slice(0, 40)).trim() || 'Unknown author';
  return {
    id: attr(p, 'xml:id') || `bibl-${entryId}-${n}`,
    author,
    date: year,
    title: textOf(firstDesc(p, 'title')) || '',
    fullCitation: full,
    citedInEntries: [{ id: entryId, title: entryTitle }],
  };
}

export function parseEpiDocXml(
  xmlContent: string,
  fileName: string,
  docParser?: { parseFromString: (xml: string, mime: string) => Document }
): { entry?: LexiconEntry; error?: string; unknownTags: string[] } {
  try {
    const parser = docParser || (typeof DOMParser !== 'undefined' ? new DOMParser() : null);
    if (!parser) throw new Error('No XML parser available in this environment.');
    // Real files sometimes start with blanks/BOM before the XML declaration, which strict parsers reject.
    const doc: any = parser.parseFromString(xmlContent.replace(/^[\uFEFF\s]+/, ''), 'text/xml');
    const perr = doc.getElementsByTagName('parsererror')[0];
    if (perr) throw new Error(textOf(perr).slice(0, 200) || 'XML parse error');

    const root = doc.documentElement;
    if (!root || lname(root) !== 'TEI') throw new Error('Root element is not <TEI>.');

    // ── Identity ─────────────────────────────────────────────────────────────
    const baseName = fileName.replace(/\.xml$/i, '');
    // The file name is the identity (some files carry a copy-pasted <idno type="filename">).
    const entryId = sanitizeEntryId(baseName);
    const prefix = baseName.split('_')[0].toLowerCase();
    const collection = prefix === 'lexicon' ? 'lexicon' : 'chapter';
    const volume = VOLUME_BY_PREFIX[prefix];

    // ── Header ───────────────────────────────────────────────────────────────
    const titleStmt = firstDesc(doc, 'titleStmt');
    const titles: Record<string, string> = {};
    if (titleStmt) {
      childEls(titleStmt, 'title').forEach((t) => {
        const text = textOf(t).normalize('NFC');
        const lang = attr(t, 'xml:lang') || 'und';
        if (text && !titles[lang]) titles[lang] = text;
      });
    }
    const title = pickTitle(titles) || baseName;

    // Names are sometimes written with underscores (Caterina_Borgatti)
    // ...or run together in CamelCase (PedroGiménezDeAragón)
    const person = (v: string) =>
      v
        .replace(/_/g, ' ')
        .replace(/([a-zà-öø-ÿ])([A-ZÀ-ÖØ-Þ])/g, '$1 $2')
        .replace(/\s+/g, ' ')
        .trim();
    const revisions: RevisionItem[] = descendants(doc, 'change').map((c) => ({
      who: person(attr(c, 'who')) || undefined,
      date: attr(c, 'when') || undefined,
      note: textOf(c) || undefined,
    }));

    const authorsMap = new Map<string, AuthorResp>();
    if (titleStmt) {
      childEls(titleStmt, 'author').forEach((a) => {
        const name = textOf(a);
        if (name) authorsMap.set(name, { name, role: 'Author' });
      });
    }
    if (authorsMap.size === 0) {
      const content = revisions.filter((r) => r.who && /content|written|created|redazion|testo|author/i.test(r.note || ''));
      (content.length ? content : revisions).forEach((r) => {
        if (r.who && !authorsMap.has(r.who)) authorsMap.set(r.who, { name: r.who, role: content.length ? 'Author' : 'Contributor', date: r.date });
      });
    }
    const authors = Array.from(authorsMap.values());

    const pubStmt = firstDesc(doc, 'publicationStmt');
    const date = attr(pubStmt && firstDesc(pubStmt, 'date'), 'when') || undefined;

    const srcText = textOf(firstDesc(firstDesc(doc, 'sourceDesc') || doc, 'p'));
    const originalPublication = srcText && !/born[- ]digital/i.test(srcText) ? srcText : undefined;

    // ── Body: editions + bibliography ────────────────────────────────────────
    const body = firstDesc(doc, 'body');
    if (!body) throw new Error('Missing <body>.');
    const rootLang = attr(root, 'xml:lang');

    const bodyDivs = childEls(body, 'div');
    const editionEls = bodyDivs.filter((d) => /^(edition|translation)$/.test(attr(d, 'type')));
    const biblDivs = bodyDivs.filter((d) => attr(d, 'type') === 'bibliography');
    // Files with no explicit edition: the whole body is one edition. In the Polish-original
    // chapters an unlabelled edition is the Polish text (the files carry a comment saying so).
    const defaultLang = rootLang || (collection === 'chapter' ? 'pl' : 'und');
    const sources: Array<{ lang: string; el: any }> = editionEls.length
      ? editionEls.map((el) => ({ lang: attr(el, 'xml:lang') || defaultLang, el }))
      : [{ lang: defaultLang, el: body }];

    // Several <div type="edition"|"translation"> of the same language are parts of one text:
    // they are merged, in document order.
    const byLang = new Map<string, any[]>();
    sources.forEach((src) => byLang.set(src.lang, [...(byLang.get(src.lang) || []), src.el]));

    // The edition the indices come from: the most annotated, ties broken en > it > pl.
    const rank = (lang: string) => {
      const pos = LANG_PREFERENCE.indexOf(lang);
      return (byLang.get(lang) || []).reduce((n, el) => n + annotationCount(el), 0) * 10 - (pos < 0 ? 9 : pos);
    };
    const primaryLang = [...byLang.keys()].sort((a, b) => rank(b) - rank(a))[0];

    const collectors: Collectors = { sources: [], realms: [], terms: [], characters: [], historicalFigures: [], places: [], crossLinks: [] };
    let spot = 0;
    const mkCtx = (id: string, head: string, indexed: boolean): RenderContext => ({
      entryId,
      entryTitle: title,
      sectionId: id,
      sectionHead: head,
      collectors: indexed ? collectors : undefined,
      nextSpotId: () => `spot-${entryId}-${++spot}`,
    });

    const isHead = (n: any) => n.nodeType === 1 && lname(n) === 'head';
    const isBiblDiv = (n: any) => n.nodeType === 1 && lname(n) === 'div' && attr(n, 'type') === 'bibliography';
    const BIBLIOGRAPHY: Record<string, string> = { it: 'Bibliografia', pl: 'Bibliografia' };
    const INTRO: Record<string, string> = { it: 'Introduzione', pl: 'Wstęp' };
    const headFor = (part: any, lang: string) => {
      const explicit = textOf(childEls(part, 'head')[0]);
      if (explicit) return explicit;
      const n = attr(part, 'n').replace(/_/g, ' ').trim();
      return /^intro$/i.test(n) ? INTRO[lang] || 'Introduction' : n;
    };

    const editions: EditionItem[] = [...byLang.entries()].map(([lang, els]) => {
      const indexed = lang === primaryLang;
      const sections: SectionItem[] = [];
      let k = 0;
      els.forEach((el) => {
        const parts = childEls(el, 'div').filter((d) => !isBiblDiv(d));
        if (parts.length === 0) {
          const id = `sec-${lang}-${++k}`;
          const nodes = kids(el).filter((n) => !isHead(n) && !isBiblDiv(n));
          const html = renderNodes(nodes, mkCtx(id, '', indexed));
          // chapters made only of a bibliography have no running text
          if (html.replace(/<[^>]*>/g, '').trim()) sections.push({ id, head: '', level: 2, rawText: textOf(el), html });
        } else {
          parts.forEach((part) => {
            const head = headFor(part, lang);
            const id = `sec-${lang}-${++k}`;
            sections.push({ id, head, level: 2, rawText: textOf(part), html: renderNodes(kids(part).filter((c) => !isHead(c)), mkCtx(id, head, indexed)) });
          });
        }
      });
      return { lang, sections };
    });

    // The bibliography is shared: it closes every edition and feeds the bibliography data.
    const bibliography: BiblItem[] = [];
    biblDivs.forEach((bd) => {
      [...childEls(bd, 'p'), ...descendants(bd, 'bibl')].forEach((p) => bibliography.push(toBiblItem(p, entryId, title, bibliography.length + 1)));
    });
    if (biblDivs.length) {
      const html = biblDivs
        .map((bd) => `<div class="tei-bibliography">${renderNodes(childEls(bd), mkCtx('bibliography', 'Bibliography', false)).replace(/<p class="tei-p">/g, '<p class="tei-bibl">')}</div>`)
        .join('');
      editions.forEach((ed) => {
        ed.sections.push({ id: `sec-${ed.lang}-bibliography`, head: BIBLIOGRAPHY[ed.lang] || 'Bibliography', level: 2, rawText: biblDivs.map(textOf).join(' '), html, isBibliography: true });
      });
    }

    const primaryEdition = editions.find((e) => e.lang === primaryLang) || editions[0];
    const sections = primaryEdition ? primaryEdition.sections : [];

    // ── Derived fields ───────────────────────────────────────────────────────
    const lemma = (collectors.terms[0]?.lemma || title).normalize('NFC');
    const primaryEls = byLang.get(primaryLang) || [];
    const langEl = primaryEls.flatMap((el) => [...descendants(el, 'w'), ...descendants(el, 'foreign')]).find((e) => attr(e, 'xml:lang'));
    const xmlLang = attr(langEl, 'xml:lang') || undefined;

    let excerpt = '';
    for (const sec of sections.filter((s) => !s.isBibliography)) {
      const bodyText = (sec.head && sec.rawText.startsWith(sec.head) ? sec.rawText.slice(sec.head.length) : sec.rawText).replace(/\s+/g, ' ').trim();
      if (bodyText) {
        excerpt = bodyText.length > 220 ? `${bodyText.slice(0, 220)}…` : bodyText;
        break;
      }
    }

    const first = authors[0]?.name;
    const authorShort = !first
      ? ''
      : (() => {
          const parts = first.trim().split(/\s+/);
          return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).map((p) => `${p[0]}.`).join(' ')} ${parts[parts.length - 1]}`;
        })();

    const entry: LexiconEntry = {
      id: entryId,
      fileName,
      title,
      titles,
      lemma,
      originalScript: lemma !== title ? lemma : undefined,
      authorShort,
      xmlLang,
      collection,
      volume,
      date,
      scriptType: detectScriptType(lemma || title),
      authors,
      originalPublication,
      revisions,
      editions,
      primaryLang,
      sections,
      excerpt,
      rawXml: xmlContent,
      indexedData: { ...collectors, bibliography },
    };

    return { entry, unknownTags: [] };
  } catch (err: any) {
    return { error: err?.message || 'Failed to parse XML', unknownTags: [] };
  }
}
