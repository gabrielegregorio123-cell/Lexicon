/**
 * TEI → HTML renderer for LARES entries and static pages.
 *
 * Works on any DOM that offers childNodes / getAttribute / textContent
 * (browser DOMParser and @xmldom/xmldom), and produces a clean HTML string:
 * no TEI element ever reaches the page. While rendering it can also collect
 * the annotations (terms, sources, realms, people, places, cross-links) that
 * feed the indices.
 */
import type {
  AncientSourceRef,
  CharacterRef,
  CrossLinkRef,
  HistoricalFigureRef,
  PlaceRef,
  RealmRef,
  TermRef,
} from '../types/lexicon.ts';

export interface Collectors {
  sources: AncientSourceRef[];
  realms: RealmRef[];
  terms: TermRef[];
  characters: CharacterRef[];
  historicalFigures: HistoricalFigureRef[];
  places: PlaceRef[];
  crossLinks: CrossLinkRef[];
}

export interface RenderContext {
  entryId: string;
  entryTitle: string;
  sectionId: string;
  sectionHead: string;
  /** Present only for the edition the indices are built from. */
  collectors?: Collectors;
  nextSpotId: () => string;
}

const ENTRY_LINK_RE = /^(?:\.\/|\/)?(?:#)?((?:lexicon|hom|trag|com|cpch)_[A-Za-z0-9_]+)(?:\.html|\.xml)?(?:#.*)?$/;
const PAGE_LINKS: Record<string, string> = {
  'bibliography.html': '#/bibliography',
  'team.html': '#/team',
};

/** Character types: the dataset spells them inconsistently, so they are normalised. */
const CHARACTER_TYPE_MAP: Record<string, 'divine' | 'hero' | 'myth' | 'literary' | 'biblical'> = {
  divine: 'divine',
  devine: 'divine',
  hero: 'hero',
  myth: 'myth',
  mith: 'myth',
  literary: 'literary',
  lit: 'literary',
  biblical: 'biblical',
};

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function sanitizeEntryId(raw: string): string {
  return raw
    .replace(/\.(xml|html)$/i, '')
    .replace(/^#/, '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-');
}

/** Maps a realm type / key / subtype to one of the 10 highlight categories. */
export function mapRsToCategory(type: string = '', subtype: string = ''): string {
  const combined = `${type} ${subtype}`.toLowerCase().replace(/_/g, ' ');
  if (/belief|theology|moral|doctrine|concept|cosmology|dogma|piety|myth|virtue|eschatolog/.test(combined)) return 'belief';
  if (/fiction|narrative|legend|epic|fable|symbol/.test(combined)) return 'fiction';
  if (/\bsign|gesture|omen|portent|prodigy|icon/.test(combined)) return 'sign';
  if (/senses|sense|meaning|emotion|perception|smell|sight|hearing|touch|feeling/.test(combined)) return 'senses';
  if (/speech|prayer|curse|formula|oath|vow|hymn|invocation|rhetoric/.test(combined)) return 'speech';
  if (/system|law|code|calendar|order|hierarchy|priesthood|magistracy|institution|knowledge depository/.test(combined)) return 'systems';
  if (/instrument|object|altar|vessel|knife|statue|garment|relic|tool|juridical/.test(combined)) return 'instruments';
  if (/structure|temple|sanctuary|precinct|shrine|tomb|monument|space/.test(combined)) return 'structures';
  return 'practice';
}

function lname(node: any): string {
  return (node.localName || node.nodeName || '').replace(/^.*:/, '');
}

function attr(el: any, name: string): string {
  return (el.getAttribute && el.getAttribute(name)) || '';
}

export function kids(el: any): any[] {
  const out: any[] = [];
  for (let c = el.firstChild; c; c = c.nextSibling) out.push(c);
  return out;
}

export function textOf(el: any): string {
  return ((el && el.textContent) || '').replace(/\s+/g, ' ').trim();
}

const pretty = (v: string) => v.replace(/_/g, ' ').trim();

/** Splits a multi-value attribute ("a;b") into its trimmed values. */
function multi(v: string): string[] {
  return v
    .split(';')
    .map((x) => x.trim())
    .filter(Boolean);
}

export function renderNodes(nodes: any[], ctx: RenderContext): string {
  return nodes.map((n) => renderNode(n, ctx)).join('');
}

export function renderChildren(el: any, ctx: RenderContext): string {
  return kids(el)
    .map((c) => renderNode(c, ctx))
    .join('');
}

function span(cls: string, inner: string, extra = ''): string {
  return `<span class="${cls}"${extra}>${inner}</span>`;
}

export function renderNode(node: any, ctx: RenderContext): string {
  if (node.nodeType === 3 || node.nodeType === 4) return escapeHtml(node.nodeValue || '');
  if (node.nodeType !== 1) return '';

  const name = lname(node);
  const col = ctx.collectors;

  switch (name) {
    case 'p':
      return `<p class="tei-p">${renderChildren(node, ctx)}</p>`;

    case 'head':
      return `<h3 class="tei-head">${renderChildren(node, ctx)}</h3>`;

    case 'div':
      if (attr(node, 'type') === 'translation') {
        const lang = attr(node, 'xml:lang');
        return `<div class="tei-translation"${lang ? ` lang="${escapeHtml(lang)}"` : ''}>${renderChildren(node, ctx)}</div>`;
      }
      return `<div class="tei-div">${renderChildren(node, ctx)}</div>`;
    case 'lg':
      return `<div class="tei-div">${renderChildren(node, ctx)}</div>`;

    case 'list': {
      const items = kids(node).filter((c) => c.nodeType === 1 && lname(c) === 'item');
      const numbered = items.some((i) => attr(i, 'n'));
      const body = kids(node)
        .map((c) => {
          if (c.nodeType !== 1) return '';
          if (lname(c) === 'item') return `<li${attr(c, 'n') ? ` value="${escapeHtml(attr(c, 'n'))}"` : ''}>${renderChildren(c, ctx)}</li>`;
          return renderNode(c, ctx);
        })
        .join('');
      return numbered ? `<ol class="tei-list">${body}</ol>` : `<ul class="tei-list">${body}</ul>`;
    }

    case 'listBibl':
      return `<div class="tei-listbibl">${renderChildren(node, ctx)}</div>`;
    case 'bibl':
      return `<p class="tei-bibl"${attr(node, 'xml:id') ? ` id="${escapeHtml(attr(node, 'xml:id'))}"` : ''}>${renderChildren(node, ctx)}</p>`;

    case 'quote': {
      const inner = renderChildren(node, ctx).replace(/^\s*(?:<br>\s*)+/, '');
      return `<blockquote class="tei-quote">${inner}</blockquote>`;
    }
    case 'lb': {
      const n = attr(node, 'n');
      return `<br>${n ? span('tei-ln', escapeHtml(n)) : ''}`;
    }
    case 'l':
      return `<span class="tei-l">${renderChildren(node, ctx)}</span>`;

    case 'emph':
      return `<strong class="tei-emph">${renderChildren(node, ctx)}</strong>`;
    case 'hi': {
      const rend = attr(node, 'rend');
      const inner = renderChildren(node, ctx);
      if (/bold/.test(rend)) return `<strong>${inner}</strong>`;
      if (/sup/.test(rend)) return `<sup>${inner}</sup>`;
      if (/sub/.test(rend)) return `<sub>${inner}</sub>`;
      if (/underline/.test(rend)) return `<u>${inner}</u>`;
      return `<em>${inner}</em>`;
    }
    case 'foreign': {
      // Latin is left unmarked: EB Garamond's Latin locale draws the lowercase u like a v
      const lang = attr(node, 'xml:lang');
      return `<em class="tei-foreign"${lang && lang !== 'la' ? ` lang="${escapeHtml(lang)}"` : ''}>${renderChildren(node, ctx)}</em>`;
    }
    case 'title':
      return `<em class="tei-title">${renderChildren(node, ctx)}</em>`;
    case 'note':
      return span('tei-note', ` [${renderChildren(node, ctx)}]`);
    case 'supplied':
      return span('tei-supplied', `[${renderChildren(node, ctx)}]`);
    case 'add':
      return span('tei-add', `⟨${renderChildren(node, ctx)}⟩`);
    case 'del':
      return `<del class="tei-del">${renderChildren(node, ctx)}</del>`;

    // ── Annotations that feed the indices ───────────────────────────────────
    case 'w': {
      // Only <w lemma="…"> is a dictionary term (index + Logeion link); a bare <w> is just a word.
      if (!attr(node, 'lemma').trim()) return renderChildren(node, ctx);
      const text = textOf(node);
      const lemma = attr(node, 'lemma').trim();
      const logeionUrl = `https://logeion.uchicago.edu/${encodeURIComponent(lemma)}`;
      const id = attr(node, 'xml:id') || (col ? ctx.nextSpotId() : '');
      col?.terms.push({ id, lemma, text, logeionUrl, entryId: ctx.entryId, entryTitle: ctx.entryTitle, sectionId: ctx.sectionId, sectionHead: ctx.sectionHead });
      return `<a${id ? ` id="${escapeHtml(id)}"` : ''} class="tei-term" href="${logeionUrl}" target="_blank" rel="noopener noreferrer" data-tag-type="term" data-lemma="${escapeHtml(lemma)}" title="${escapeHtml(lemma)} — Logeion">${renderChildren(node, ctx)}</a>`;
    }

    case 'ref': {
      const type = attr(node, 'type').trim().toLowerCase();
      const corresp = (attr(node, 'corresp') || attr(node, 'target')).trim();
      const text = textOf(node);
      const id = attr(node, 'xml:id') || (col ? ctx.nextSpotId() : '');
      const idAttr = id ? ` id="${escapeHtml(id)}"` : '';

      if (/^(lit|ins|pap|author|myth)$/.test(type)) {
        col?.sources.push({ id, type, text, entryId: ctx.entryId, entryTitle: ctx.entryTitle, sectionId: ctx.sectionId, sectionHead: ctx.sectionHead });
        return `<span${idAttr} class="tei-source" data-tag-category="sources" data-source-type="${type}" title="${escapeHtml(type)}">${renderChildren(node, ctx)}</span>`;
      }

      if (!corresp) return renderChildren(node, ctx);

      const entryMatch = ENTRY_LINK_RE.exec(corresp);
      if (entryMatch) {
        const targetId = sanitizeEntryId(entryMatch[1]);
        col?.crossLinks.push({ id, corresp, text, targetEntryId: targetId, sectionId: ctx.sectionId });
        return `<a${idAttr} class="tei-crosslink" href="#/entry/${targetId}" data-tag-category="links" data-corresp="${escapeHtml(corresp)}">${renderChildren(node, ctx)}</a>`;
      }

      const page = PAGE_LINKS[corresp.replace(/#.*$/, '')];
      if (page) return `<a${idAttr} class="tei-crosslink" href="${page}">${renderChildren(node, ctx)}</a>`;

      if (/^https?:\/\//i.test(corresp)) {
        const inner = renderChildren(node, ctx);
        return `<a${idAttr} class="tei-ext" href="${escapeHtml(corresp)}" target="_blank" rel="noopener noreferrer"${inner.trim() ? '' : ' aria-label="Open source"'}>${inner.trim() ? inner : '↗'}</a>`;
      }
      return renderChildren(node, ctx);
    }

    case 'rs': {
      const rawType = attr(node, 'type');
      const key = attr(node, 'key');
      const rawSubtype = attr(node, 'subtype');
      const text = textOf(node);
      const id = attr(node, 'xml:id') || (col ? ctx.nextSpotId() : '');

      // <rs key="place"> is the dataset's way of tagging a place
      if (!rawType && key.toLowerCase() === 'place') {
        col?.places.push({ id, name: text, key: text, entryId: ctx.entryId, entryTitle: ctx.entryTitle, sectionId: ctx.sectionId, sectionHead: ctx.sectionHead });
        return `<span${id ? ` id="${escapeHtml(id)}"` : ''} class="tei-place" data-tag-category="places" data-tag-type="place">${renderChildren(node, ctx)}</span>`;
      }

      const types = multi(rawType || key);
      const subtypes = multi(rawSubtype);
      const category = mapRsToCategory(types.join(' '), subtypes.join(' '));
      (types.length ? types : ['General']).forEach((t, i) => {
        col?.realms.push({
          id,
          type: pretty(t),
          subtype: pretty(subtypes[i] ?? subtypes[0] ?? ''),
          text,
          entryId: ctx.entryId,
          entryTitle: ctx.entryTitle,
          sectionId: ctx.sectionId,
          sectionHead: ctx.sectionHead,
        });
      });
      return `<span${id ? ` id="${escapeHtml(id)}"` : ''} class="tei-realm" data-tag-category="${category}" data-tag-type="realm" title="${escapeHtml(pretty(types.join(' · ')))}">${renderChildren(node, ctx)}</span>`;
    }

    case 'persName': {
      const rawType = attr(node, 'type').trim().toLowerCase();
      const text = textOf(node);
      const key = attr(node, 'key').trim() || text;
      const id = attr(node, 'xml:id') || (col ? ctx.nextSpotId() : '');
      const charType = CHARACTER_TYPE_MAP[rawType];
      if (charType) {
        col?.characters.push({ id, name: text || key, type: charType, key, entryId: ctx.entryId, entryTitle: ctx.entryTitle, sectionId: ctx.sectionId, sectionHead: ctx.sectionHead });
        return `<span${id ? ` id="${escapeHtml(id)}"` : ''} class="tei-person" data-tag-category="fiction" data-tag-type="character" data-key="${escapeHtml(key)}" title="${escapeHtml(charType)}: ${escapeHtml(key)}">${renderChildren(node, ctx)}</span>`;
      }
      col?.historicalFigures.push({ id, name: text || key, key, entryId: ctx.entryId, entryTitle: ctx.entryTitle, sectionId: ctx.sectionId, sectionHead: ctx.sectionHead });
      return `<span${id ? ` id="${escapeHtml(id)}"` : ''} class="tei-person" data-tag-type="historical" data-key="${escapeHtml(key)}" title="${escapeHtml(key)}">${renderChildren(node, ctx)}</span>`;
    }

    case 'placeName': {
      const text = textOf(node);
      const key = attr(node, 'key').trim() || text;
      const id = attr(node, 'xml:id') || (col ? ctx.nextSpotId() : '');
      if (text) col?.places.push({ id, name: text, key, entryId: ctx.entryId, entryTitle: ctx.entryTitle, sectionId: ctx.sectionId, sectionHead: ctx.sectionHead });
      return `<span${id ? ` id="${escapeHtml(id)}"` : ''} class="tei-place" data-tag-category="places" data-tag-type="place" data-key="${escapeHtml(key)}" title="${escapeHtml(key)}">${renderChildren(node, ctx)}</span>`;
    }

    // Anything else (date, author, name, ptr, unknown…): keep the text, drop the element.
    default:
      return renderChildren(node, ctx);
  }
}
