/**
 * Catalogo delle parti di una scheda del Lexicon, sul modello di lexicon_Ioudaios.xml.
 *
 * È la fonte unica per i menù a tendina dell'editor a sezioni e per il modello delle
 * nuove schede: sezioni (textpart), sottosezioni dentro Testimonianze/Catalogo,
 * occorrenze, blocchi di testo e sottotitoli della bibliografia.
 */
import { escapeXml } from './markup.ts';

export type TextLang = 'it' | 'en' | 'pl';
type Tr = Record<TextLang, string>;

const pick = (t: Tr, lang: string) => t[(lang as TextLang)] ?? t.en;

/* ── Sezioni (div type="textpart") ───────────────────────────────── */

export interface SectionType {
  /** valore di @n, uguale in tutte le lingue (come in Ioudaios) */
  n: string;
  head: Tr;
  /** altri titoli o @n già usati nel corpus per la stessa sezione */
  aliases?: string[];
}

export const SECTION_TYPES: SectionType[] = [
  { n: 'morphology', head: { en: 'Morphology', it: 'Morfologia', pl: 'Morfologia' } },
  { n: 'etymology', head: { en: 'Etymology', it: 'Etimologia', pl: 'Etymologia' } },
  { n: 'testimonies', head: { en: 'Testimonies', it: 'Testimonianze', pl: 'Poświadczenia' }, aliases: ['attestazioni', 'attestations', 'świadectwa'] },
  { n: 'catalogue of occurrences', head: { en: 'Catalogue of occurrences', it: 'Catalogo delle occorrenze', pl: 'Katalog wystąpień' }, aliases: ['catalogue', 'occorrenze', 'occurrences', 'wystąpienia'] },
  { n: 'discussion / interpretation', head: { en: 'Discussion / interpretation', it: 'Discussione / interpretazione', pl: 'Dyskusja / interpretacja' }, aliases: ['discussion', 'discussione', 'dyskusja', 'interpretation'] },
];

export const sectionHead = (s: SectionType, lang: string) => pick(s.head, lang);

const norm = (s: string) => s.toLowerCase().replace(/[_\s]+/g, ' ').replace(/\s*\/\s*/g, ' / ').trim();

/** Riconosce il tipo di un textpart esistente da @n o dal titolo, in qualunque lingua. */
export function sectionTypeOf(n: string, head: string): SectionType | undefined {
  const keys = [norm(n), norm(head)];
  return SECTION_TYPES.find((s) => keys.some((k) => k && (k === s.n || Object.values(s.head).some((h) => norm(h) === k) || (s.aliases || []).includes(k))));
}

/* ── Sottosezioni e blocchi aggiungibili dentro una sezione ──────── */

export interface BlockOption {
  id: string;
  group: 'sub' | 'occ' | 'text';
  label: Tr;
  /** true se serve un testo da scrivere prima di inserire */
  needsText: boolean;
  placeholder?: Tr;
  /** XML del blocco; `lang` è la lingua dell'edizione */
  build: (text: string, lang: string) => string;
}

const subheading = (label: Tr): BlockOption['build'] => (_t, lang) => `<p><emph rend="italics">${escapeXml(pick(label, lang))}</emph></p>`;

const SUB_INS: Tr = { en: 'Inscriptions', it: 'Epigrafi', pl: 'Inskrypcje' };
const SUB_PAP: Tr = { en: 'Papyri', it: 'Papiri', pl: 'Papirusy' };
const SUB_LIT: Tr = { en: 'Literary sources', it: 'Fonti letterarie', pl: 'Źródła literackie' };
const SUB_NOTES: Tr = { en: 'Notes', it: 'Note', pl: 'Uwagi' };

/** Contenuto libero: può contenere tag XML scritti a mano; altrimenti è testo semplice. */
const content = (t: string) => (/[<>]/.test(t) ? t.trim() : escapeXml(t.trim()));

export const BLOCK_OPTIONS: BlockOption[] = [
  { id: 'sub-ins', group: 'sub', label: { it: 'Sottosezione: Epigrafi', en: 'Subsection: Inscriptions', pl: 'Podsekcja: Inskrypcje' }, needsText: false, build: subheading(SUB_INS) },
  { id: 'sub-pap', group: 'sub', label: { it: 'Sottosezione: Papiri', en: 'Subsection: Papyri', pl: 'Podsekcja: Papirusy' }, needsText: false, build: subheading(SUB_PAP) },
  { id: 'sub-lit', group: 'sub', label: { it: 'Sottosezione: Fonti letterarie', en: 'Subsection: Literary sources', pl: 'Podsekcja: Źródła literackie' }, needsText: false, build: subheading(SUB_LIT) },
  { id: 'sub-notes', group: 'sub', label: { it: 'Sottosezione: Note', en: 'Subsection: Notes', pl: 'Podsekcja: Uwagi' }, needsText: false, build: subheading(SUB_NOTES) },
  {
    id: 'occ-ins', group: 'occ', label: { it: 'Occorrenza epigrafica', en: 'Inscription occurrence', pl: 'Wystąpienie w inskrypcji' }, needsText: true,
    placeholder: { it: 'es. IJudO I Ach 45', en: 'e.g. IJudO I Ach 45', pl: 'np. IJudO I Ach 45' },
    build: (t) => `<p><ref type="ins">${content(t)}</ref></p>`,
  },
  {
    id: 'occ-pap', group: 'occ', label: { it: 'Occorrenza papiracea', en: 'Papyrus occurrence', pl: 'Wystąpienie w papirusie' }, needsText: true,
    placeholder: { it: 'es. CPJ I 8', en: 'e.g. CPJ I 8', pl: 'np. CPJ I 8' },
    build: (t) => `<p><ref type="pap">${content(t)}</ref></p>`,
  },
  {
    id: 'occ-lit', group: 'occ', label: { it: 'Occorrenza letteraria', en: 'Literary occurrence', pl: 'Wystąpienie literackie' }, needsText: true,
    placeholder: { it: 'es. Ios. AJ 11.173', en: 'e.g. Jos. AJ 11.173', pl: 'np. Jos. AJ 11.173' },
    build: (t) => `<p><ref type="lit">${content(t)}</ref></p>`,
  },
  { id: 'p', group: 'text', label: { it: 'Paragrafo', en: 'Paragraph', pl: 'Akapit' }, needsText: true, build: (t) => `<p>${content(t)}</p>` },
  {
    id: 'quote', group: 'text', label: { it: 'Citazione (testo antico)', en: 'Quotation (ancient text)', pl: 'Cytat (tekst starożytny)' }, needsText: true,
    build: (t) => `<p><quote>${content(t)}</quote></p>`,
  },
  {
    id: 'list', group: 'text', label: { it: 'Elenco puntato', en: 'Bulleted list', pl: 'Lista punktowana' }, needsText: true,
    placeholder: { it: 'una voce per riga', en: 'one item per line', pl: 'jedna pozycja w wierszu' },
    build: (t) => `<list rend="bulleted">${t.split('\n').filter((l) => l.trim()).map((l) => `<item>${content(l)}</item>`).join('')}</list>`,
  },
];

export const BLOCK_GROUP_LABEL: Record<BlockOption['group'], Tr> = {
  sub: { it: 'Sottosezioni', en: 'Subsections', pl: 'Podsekcje' },
  occ: { it: 'Occorrenze', en: 'Occurrences', pl: 'Wystąpienia' },
  text: { it: 'Testo', en: 'Text', pl: 'Tekst' },
};

/** Ordine delle voci del menù secondo la sezione: nel Catalogo prima le occorrenze. */
export function blockOptionsFor(section: SectionType | undefined): BlockOption[] {
  const order: BlockOption['group'][] =
    section?.n === 'catalogue of occurrences' ? ['sub', 'occ', 'text'] : section?.n === 'testimonies' ? ['sub', 'text', 'occ'] : ['text', 'sub', 'occ'];
  return order.flatMap((g) => BLOCK_OPTIONS.filter((o) => o.group === g));
}

/* ── Bibliografia ───────────────────────────────────────────────── */

export const BIB_HEADINGS: Tr[] = [
  { en: 'Corpora:', it: 'Corpora:', pl: 'Korpusy:' },
  { en: 'Editions:', it: 'Edizioni:', pl: 'Wydania:' },
  { en: 'Studies:', it: 'Studi:', pl: 'Opracowania:' },
  { en: 'Sitography:', it: 'Sitografia:', pl: 'Netografia:' },
];

export const bibHeadingXml = (label: string) => `<p><hi rend="italic">${escapeXml(label)}</hi></p>`;

/** Testo del sottotitolo se la voce è un sottotitolo di bibliografia (`<hi rend="italic">Corpora:</hi>`). */
export function bibHeadingText(innerXml: string): string | null {
  const m = /^\s*<(hi|emph)\b[^>]*>([^<]*)<\/\1>\s*$/.exec(innerXml);
  return m ? m[2].trim() : null;
}
