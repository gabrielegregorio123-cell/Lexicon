/**
 * lexiconSections.ts — editor a sezioni per le schede LARES (EpiDoc TEI)
 * ---------------------------------------------------------------------
 * Derivato dall'editor "Officina" di ILA (xmlSectionEditor.ts) e adattato
 * alla struttura delle schede del Lexicon.
 *
 * Filosofia (come in ILA):
 *   1. PATCH-ONLY: ogni modifica riscrive SOLO lo span dell'elemento toccato;
 *      tutto il resto del file resta byte per byte identico.
 *   2. Il modello è sempre DERIVATO dall'XML (scansione con offset), mai il
 *      contrario: lo stato dell'editor è la stringa XML.
 *   3. Tollerante: le varianti reali del corpus (più <div type="edition"> per
 *      la stessa lingua, textpart fuori dalle edizioni, traduzioni annidate,
 *      bibliografia come textpart) sono riconosciute e non vengono "normalizzate".
 *
 * Nessuna dipendenza: funziona in Node (test) e nel browser.
 */

/* ================================================================ */
/* Scanner con offset                                                */
/* ================================================================ */

export interface XNode {
  name: string;
  attrs: Record<string, string>;
  openStart: number;
  openEnd: number;
  /** = openEnd per gli elementi vuoti autochiusi */
  closeStart: number;
  closeEnd: number;
  selfClosing: boolean;
  children: XNode[];
}

const TAG_RE = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[[\s\S]*?\]\]>|<!DOCTYPE[^>]*>|<(\/?)([A-Za-z_][\w:.-]*)((?:\s+[^<>]*?)?)(\/?)\s*>/g;

export function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, '&');
}
export const escapeText = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export const escapeAttr = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

export function parseAttrs(s: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) attrs[m[1]] = decodeEntities(m[2] ?? m[3] ?? '');
  return attrs;
}

/** Scansiona l'intero documento e restituisce la radice (primo elemento). Lancia Error se malformato. */
export function scanXml(xml: string): XNode {
  const doc: XNode = { name: '#doc', attrs: {}, openStart: 0, openEnd: 0, closeStart: xml.length, closeEnd: xml.length, selfClosing: false, children: [] };
  const stack: XNode[] = [doc];
  TAG_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TAG_RE.exec(xml)) !== null) {
    const [whole, closing, name, rawAttrs, selfClose] = m;
    if (!name) continue; // commento, PI, CDATA, doctype
    const top = stack[stack.length - 1];
    if (closing) {
      if (top.name !== name) throw new Error(`</${name}> chiude <${top.name}> (offset ${m.index})`);
      top.closeStart = m.index;
      top.closeEnd = m.index + whole.length;
      stack.pop();
      continue;
    }
    const node: XNode = {
      name,
      attrs: parseAttrs(rawAttrs || ''),
      openStart: m.index,
      openEnd: m.index + whole.length,
      closeStart: m.index + whole.length,
      closeEnd: m.index + whole.length,
      selfClosing: !!selfClose,
      children: [],
    };
    top.children.push(node);
    if (!selfClose) stack.push(node);
  }
  if (stack.length > 1) throw new Error(`<${stack[stack.length - 1].name}> non è mai chiuso`);
  const root = doc.children[0];
  if (!root) throw new Error('Documento vuoto');
  return root;
}

export const child = (n: XNode | undefined, name: string) => n?.children.find((c) => c.name === name);
export const children = (n: XNode | undefined, name: string) => (n ? n.children.filter((c) => c.name === name) : []);
export function descendant(n: XNode | undefined, name: string, pred: (x: XNode) => boolean = () => true): XNode | undefined {
  if (!n) return undefined;
  for (const c of n.children) {
    if (c.name === name && pred(c)) return c;
    const d = descendant(c, name, pred);
    if (d) return d;
  }
  return undefined;
}
export const inner = (xml: string, n: XNode) => xml.slice(n.openEnd, n.closeStart);
export const outer = (xml: string, n: XNode) => xml.slice(n.openStart, n.closeEnd);
export const plain = (s: string) => decodeEntities(s.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();

/* ================================================================ */
/* Modello della scheda                                              */
/* ================================================================ */

export interface Textpart {
  node: XNode;
  n: string;
  subtype: string;
  head?: XNode;
  /** contenuto del textpart dopo il <head> (span sull'XML) */
  contentStart: number;
  contentEnd: number;
}

export interface Edition {
  node: XNode;
  lang: string;
  textparts: Textpart[];
  /** contenuto dell'edizione che non sta in un textpart (raro, ma esiste) */
  loose: XNode[];
}

export interface Bibliography {
  node: XNode;
  /** 'div' = <div type="bibliography">; 'textpart' = <div type="textpart" subtype="bibliography"> */
  form: 'div' | 'textpart';
  subtype: string;
  head?: XNode;
  items: XNode[];
}

export interface Change {
  node: XNode;
  when: string;
  who: string;
  text: string;
}

export interface LexiconModel {
  root: XNode;
  docLang: string;
  titleStmt?: XNode;
  titles: Array<{ node: XNode; lang: string; text: string }>;
  idno?: XNode;
  filename: string;
  date?: XNode;
  publisher?: XNode;
  licence?: XNode;
  sourceDesc?: XNode;
  msDesc?: XNode;
  listChange?: XNode;
  revisionDesc?: XNode;
  changes: Change[];
  body?: XNode;
  editions: Edition[];
  bibliographies: Bibliography[];
  /** figli del body non riconosciuti (textpart fuori edizione, div liberi…) */
  others: XNode[];
}

const BLOCKISH = new Set(['p', 'list', 'quote', 'lg', 'l', 'div', 'bibl', 'listBibl', 'table', 'note', 'ab']);

function toTextpart(_xml: string, node: XNode): Textpart {
  // il <head> conta solo se è il primo elemento figlio
  const head = node.children[0]?.name === 'head' ? node.children[0] : undefined;
  return {
    node,
    n: node.attrs.n || '',
    subtype: node.attrs.subtype || '',
    head,
    contentStart: head ? head.closeEnd : node.openEnd,
    contentEnd: node.closeStart,
  };
}

function isBibDiv(n: XNode): boolean {
  return n.name === 'div' && (n.attrs.type === 'bibliography' || (n.attrs.type === 'textpart' && n.attrs.subtype === 'bibliography'));
}

function toBibliography(c: XNode): Bibliography {
  return {
    node: c,
    form: c.attrs.type === 'bibliography' ? 'div' : 'textpart',
    subtype: c.attrs.type === 'bibliography' ? c.attrs.subtype || '' : '',
    head: child(c, 'head'),
    items: c.children.filter((x) => x.name !== 'head'),
  };
}

export function buildModel(xml: string): LexiconModel {
  const root = scanXml(xml);
  const header = child(root, 'teiHeader');
  const fileDesc = child(header, 'fileDesc');
  const titleStmt = child(fileDesc, 'titleStmt');
  const pub = child(fileDesc, 'publicationStmt');
  const idno = children(pub, 'idno').find((i) => i.attrs.type === 'filename') || child(pub, 'idno');
  const revisionDesc = child(header, 'revisionDesc');
  const listChange = child(revisionDesc, 'listChange');
  const sourceDesc = child(fileDesc, 'sourceDesc');
  const body = child(child(root, 'text'), 'body');

  const editions: Edition[] = [];
  const bibliographies: Bibliography[] = [];
  const others: XNode[] = [];
  for (const c of body?.children || []) {
    if (c.name === 'div' && c.attrs.type === 'edition') {
      const textparts: Textpart[] = [];
      const loose: XNode[] = [];
      for (const d of c.children) {
        if (isBibDiv(d)) bibliographies.push(toBibliography(d));
        else if (d.name === 'div' && d.attrs.type === 'textpart') textparts.push(toTextpart(xml, d));
        else loose.push(d);
      }
      editions.push({ node: c, lang: c.attrs['xml:lang'] || '', textparts, loose });
    } else if (isBibDiv(c)) {
      bibliographies.push(toBibliography(c));
    } else {
      others.push(c);
    }
  }

  return {
    root,
    docLang: root.attrs['xml:lang'] || '',
    titleStmt,
    titles: children(titleStmt, 'title').map((t) => ({ node: t, lang: t.attrs['xml:lang'] || '', text: inner(xml, t) })),
    idno,
    filename: idno ? plain(inner(xml, idno)) : '',
    date: child(pub, 'date'),
    publisher: child(pub, 'publisher'),
    licence: descendant(pub, 'licence'),
    sourceDesc,
    msDesc: child(sourceDesc, 'msDesc'),
    revisionDesc,
    listChange,
    changes: children(listChange, 'change').map((c) => ({ node: c, when: c.attrs.when || '', who: c.attrs.who || '', text: inner(xml, c) })),
    body,
    editions,
    bibliographies,
    others,
  };
}

/* ================================================================ */
/* Operazioni patch-only                                             */
/* ================================================================ */

export const splice = (xml: string, start: number, end: number, text: string) => xml.slice(0, start) + text + xml.slice(end);

/** Indentazione della riga su cui si apre il nodo. */
export function indentOf(xml: string, n: XNode): string {
  const ls = xml.lastIndexOf('\n', n.openStart - 1) + 1;
  const pre = xml.slice(ls, n.openStart);
  return /^\s*$/.test(pre) ? pre : (pre.match(/^\s*/)?.[0] ?? '');
}

/** Unità di indentazione usata dal file (4 spazi nel corpus). */
export function indentUnit(xml: string, m: LexiconModel): string {
  const a = m.body ? indentOf(xml, m.body) : '';
  const first = m.body?.children[0];
  const b = first ? indentOf(xml, first) : '';
  return b.length > a.length ? b.slice(a.length) : '    ';
}

export function replaceInner(xml: string, n: XNode, text: string): string {
  if (n.selfClosing) {
    const open = xml.slice(n.openStart, n.openEnd).replace(/\s*\/>$/, '>');
    return splice(xml, n.openStart, n.closeEnd, `${open}${text}</${n.name}>`);
  }
  return splice(xml, n.openEnd, n.closeStart, text);
}

/** Riscrive solo il tag di apertura, conservando ordine e forma degli altri attributi. */
export function setAttr(xml: string, n: XNode, name: string, value: string | null): string {
  let open = xml.slice(n.openStart, n.openEnd);
  const re = new RegExp(`\\s${name.replace(/[.:]/g, '\\$&')}\\s*=\\s*(?:"[^"]*"|'[^']*')`);
  if (value === null || value === '') open = open.replace(re, '');
  else if (re.test(open)) open = open.replace(re, ` ${name}="${escapeAttr(value)}"`);
  else open = open.replace(/\s*(\/?)>$/, (_, sc) => ` ${name}="${escapeAttr(value)}"${sc ? '/' : ''}>`);
  return splice(xml, n.openStart, n.openEnd, open);
}

/** Rimuove un nodo insieme agli spazi che lo precedono sulla sua riga. */
export function removeNode(xml: string, n: XNode): string {
  const ls = xml.lastIndexOf('\n', n.openStart - 1);
  const start = ls >= 0 && /^\s*$/.test(xml.slice(ls + 1, n.openStart)) ? ls : n.openStart;
  return splice(xml, start, n.closeEnd, '');
}

/** Inserisce un blocco come ultimo figlio di `parent`, su una nuova riga indentata. */
export function appendChildBlock(xml: string, parent: XNode, block: string, unit: string): string {
  const ind = indentOf(xml, parent);
  const last = parent.children[parent.children.length - 1];
  const at = last ? last.closeEnd : parent.openEnd;
  const lines = block.split('\n').map((l, i) => (i === 0 ? l : ind + unit + l)).join('\n');
  return splice(xml, at, at, `\n${ind}${unit}${lines}${last ? '' : `\n${ind}`}`);
}

/** Inserisce un blocco subito dopo `ref` (stesso livello). */
export function insertAfter(xml: string, ref: XNode, block: string): string {
  const ind = indentOf(xml, ref);
  const lines = block.split('\n').map((l, i) => (i === 0 ? l : ind + l)).join('\n');
  return splice(xml, ref.closeEnd, ref.closeEnd, `\n${ind}${lines}`);
}

/** Scambia due nodi fratelli (a precede b), lasciando invariato quel che sta in mezzo. */
export function swapSiblings(xml: string, a: XNode, b: XNode): string {
  const A = outer(xml, a), B = outer(xml, b);
  const mid = xml.slice(a.closeEnd, b.openStart);
  return xml.slice(0, a.openStart) + B + mid + A + xml.slice(b.closeEnd);
}

/* ── header ─────────────────────────────────────────────────────── */

export function setTitles(xml: string, m: LexiconModel, titles: Array<{ lang: string; text: string }>): string {
  if (!m.titleStmt) return xml;
  const ind = indentOf(xml, m.titleStmt);
  const unit = indentUnit(xml, m);
  const rows = titles
    .filter((t) => t.text.trim())
    .map((t) => `\n${ind}${unit}<title${t.lang ? ` xml:lang="${escapeAttr(t.lang)}"` : ''}>${t.text}</title>`)
    .join('');
  // conserva eventuali altri figli del titleStmt (author, editor, respStmt…)
  const rest = m.titleStmt.children.filter((c) => c.name !== 'title').map((c) => `\n${ind}${unit}${outer(xml, c)}`).join('');
  return replaceInner(xml, m.titleStmt, `${rows}${rest}\n${ind}`);
}

export function addChange(xml: string, m: LexiconModel, c: { when: string; who: string; text: string }): string {
  const tag = `<change when="${escapeAttr(c.when)}" who="${escapeAttr(c.who)}">${escapeText(c.text)}</change>`;
  if (m.listChange) {
    const first = m.listChange.children[0];
    if (first) {
      // il corpus elenca le revisioni dalla più recente: nuova riga in testa
      const ind = indentOf(xml, first);
      return splice(xml, first.openStart, first.openStart, `${tag}\n${ind}`);
    }
    return appendChildBlock(xml, m.listChange, tag, indentUnit(xml, m));
  }
  return xml;
}

/* ── edizioni ───────────────────────────────────────────────────── */

export function textpartBlock(n: string, head: string, unit: string): string {
  const nAttr = n ? ` n="${escapeAttr(n)}"` : '';
  return `<div type="textpart"${nAttr}>\n${unit}<head>${escapeText(head)}</head>\n${unit}<p></p>\n</div>`;
}

/** Imposta (o crea, o toglie) il <head> di un textpart. */
export function setHead(xml: string, tp: Textpart, text: string): string {
  if (tp.head) {
    if (!text.trim()) return removeNode(xml, tp.head);
    return replaceInner(xml, tp.head, text);
  }
  if (!text.trim()) return xml;
  const firstChild = tp.node.children[0];
  const ind = firstChild ? indentOf(xml, firstChild) : indentOf(xml, tp.node) + '    ';
  return splice(xml, tp.node.openEnd, tp.node.openEnd, `\n${ind}<head>${text}</head>`);
}

export function setContent(xml: string, tp: Textpart, content: string): string {
  return splice(xml, tp.contentStart, tp.contentEnd, content);
}

export function addEdition(xml: string, m: LexiconModel, lang: string): string {
  if (!m.body) return xml;
  const unit = indentUnit(xml, m);
  const tp = textpartBlock('', '', unit).split('\n').map((l) => unit + l).join('\n');
  const block = `<div type="edition" xml:lang="${escapeAttr(lang)}">\n${tp}\n</div>`;
  const lastEd = m.editions[m.editions.length - 1];
  if (lastEd) {
    const ind = indentOf(xml, lastEd.node);
    const lines = block.split('\n').map((l) => ind + l).join('\n');
    return splice(xml, lastEd.node.closeEnd, lastEd.node.closeEnd, `\n\n${lines}`);
  }
  return appendChildBlock(xml, m.body, block, unit);
}

/* ── bibliografia ───────────────────────────────────────────────── */

export function addBibliography(xml: string, m: LexiconModel): string {
  if (!m.body) return xml;
  const unit = indentUnit(xml, m);
  return appendChildBlock(xml, m.body, `<div type="bibliography">\n${unit}<p></p>\n</div>`, unit);
}

export function addBibItem(xml: string, b: Bibliography, text: string, unit: string): string {
  const tag = b.items[b.items.length - 1]?.name === 'bibl' ? 'bibl' : 'p';
  const last = b.items[b.items.length - 1];
  const item = `<${tag}>${text}</${tag}>`;
  return last ? insertAfter(xml, last, item) : appendChildBlock(xml, b.node, item, unit);
}

/* ================================================================ */
/* Token del markup inline (dall'EditionMarkupEditor di ILA)         */
/* ================================================================ */

export type MarkupToken =
  | { kind: 'text'; value: string }
  | { kind: 'raw'; value: string } // commenti, PI: conservati così come sono
  | { kind: 'el'; name: string; attrs: Record<string, string>; children: MarkupToken[]; selfClosing: boolean };

export type TokenPath = number[];

/** Tokenizza un frammento di contenuto misto. Lancia Error se malformato. */
export function tokenize(src: string): MarkupToken[] {
  const root: MarkupToken[] = [];
  const stack: Array<{ name: string; children: MarkupToken[] }> = [];
  const top = () => (stack.length ? stack[stack.length - 1].children : root);
  let last = 0;
  TAG_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TAG_RE.exec(src)) !== null) {
    if (m.index > last) top().push({ kind: 'text', value: decodeEntities(src.slice(last, m.index)) });
    const [whole, closing, name, rawAttrs, selfClose] = m;
    if (!name) top().push({ kind: 'raw', value: whole });
    else if (closing) {
      const f = stack.pop();
      if (!f || f.name !== name) throw new Error(`</${name}> senza apertura corrispondente`);
    } else {
      const el: MarkupToken = { kind: 'el', name, attrs: parseAttrs(rawAttrs || ''), children: [], selfClosing: !!selfClose };
      top().push(el);
      if (!selfClose) stack.push({ name, children: el.children });
    }
    last = m.index + whole.length;
  }
  if (last < src.length) top().push({ kind: 'text', value: decodeEntities(src.slice(last)) });
  if (stack.length) throw new Error(`<${stack[stack.length - 1].name}> non è mai chiuso`);
  return root;
}

export function serializeTokens(tokens: MarkupToken[]): string {
  return tokens
    .map((t) => {
      if (t.kind === 'text') return t.value.replace(/&/g, '&amp;').replace(/</g, '&lt;');
      if (t.kind === 'raw') return t.value;
      const attrs = Object.entries(t.attrs)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => ` ${k}="${escapeAttr(v)}"`)
        .join('');
      if (t.selfClosing) return `<${t.name}${attrs}/>`;
      return `<${t.name}${attrs}>${serializeTokens(t.children)}</${t.name}>`;
    })
    .join('');
}

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

export function getTokenAt(tokens: MarkupToken[], path: TokenPath): MarkupToken | null {
  let list = tokens;
  let tok: MarkupToken | null = null;
  for (const i of path) {
    tok = list[i] || null;
    if (!tok) return null;
    list = tok.kind === 'el' ? tok.children : [];
  }
  return tok;
}

function spliceAt(tokens: MarkupToken[], path: TokenPath, replacement: MarkupToken[]): MarkupToken[] {
  const out = clone(tokens);
  let list = out;
  for (let d = 0; d < path.length - 1; d++) {
    const t = list[path[d]];
    if (!t || t.kind !== 'el') return out;
    list = t.children;
  }
  list.splice(path[path.length - 1], 1, ...replacement);
  return out;
}

export function sliceText(tokens: MarkupToken[]): string {
  return tokens.map((t) => (t.kind === 'text' ? t.value : t.kind === 'raw' ? '' : sliceText(t.children))).join('');
}

/**
 * Avvolge l'intervallo da (startPath,startOffset) a (endPath,endOffset):
 * i due estremi sono token testo con lo stesso genitore; i fratelli
 * intermedi (anche elementi) finiscono dentro il nuovo elemento.
 */
export function wrapSlice(
  tokens: MarkupToken[],
  startPath: TokenPath,
  startOffset: number,
  endPath: TokenPath,
  endOffset: number,
  compose: (slice: MarkupToken[]) => MarkupToken
): MarkupToken[] {
  if (startPath.slice(0, -1).join('.') !== endPath.slice(0, -1).join('.')) return tokens;
  const out = clone(tokens);
  let list = out;
  for (const d of startPath.slice(0, -1)) {
    const t = list[d];
    if (!t || t.kind !== 'el') return tokens;
    list = t.children;
  }
  const si = startPath[startPath.length - 1];
  const ei = endPath[endPath.length - 1];
  const a = list[si], b = list[ei];
  if (!a || a.kind !== 'text' || !b || b.kind !== 'text') return tokens;
  const slice: MarkupToken[] = [];
  const replacement: MarkupToken[] = [];
  if (si === ei) {
    const [s, e] = [Math.min(startOffset, endOffset), Math.max(startOffset, endOffset)];
    if (a.value.slice(0, s)) replacement.push({ kind: 'text', value: a.value.slice(0, s) });
    slice.push({ kind: 'text', value: a.value.slice(s, e) });
    replacement.push(compose(slice));
    if (a.value.slice(e)) replacement.push({ kind: 'text', value: a.value.slice(e) });
  } else {
    if (a.value.slice(0, startOffset)) replacement.push({ kind: 'text', value: a.value.slice(0, startOffset) });
    if (a.value.slice(startOffset)) slice.push({ kind: 'text', value: a.value.slice(startOffset) });
    for (let i = si + 1; i < ei; i++) slice.push(list[i]);
    if (b.value.slice(0, endOffset)) slice.push({ kind: 'text', value: b.value.slice(0, endOffset) });
    replacement.push(compose(slice));
    if (b.value.slice(endOffset)) replacement.push({ kind: 'text', value: b.value.slice(endOffset) });
  }
  list.splice(si, ei - si + 1, ...replacement);
  return out;
}

/** Toglie il tag conservando il testo. */
export function unwrapElement(tokens: MarkupToken[], path: TokenPath): MarkupToken[] {
  const tok = getTokenAt(tokens, path);
  if (!tok || tok.kind !== 'el') return tokens;
  return spliceAt(tokens, path, tok.children);
}

export function removeToken(tokens: MarkupToken[], path: TokenPath): MarkupToken[] {
  return spliceAt(tokens, path, []);
}

export function replaceToken(tokens: MarkupToken[], path: TokenPath, replacement: MarkupToken[]): MarkupToken[] {
  return spliceAt(tokens, path, replacement);
}

export function setTokenAttrs(tokens: MarkupToken[], path: TokenPath, attrs: Record<string, string>): MarkupToken[] {
  const out = clone(tokens);
  const tok = getTokenAt(out, path);
  if (tok && tok.kind === 'el') {
    const next: Record<string, string> = {};
    for (const [k, v] of Object.entries(attrs)) if (k.trim() && v !== '') next[k.trim()] = v;
    tok.attrs = next;
  }
  return out;
}

/** Elementi resi come blocchi nel pannello di marcatura. */
export const BLOCK_ELEMENTS = new Set([...BLOCKISH, 'item', 'head', 'cit']);
