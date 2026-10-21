import { greekToLatin } from '../utils/greekNormalizer.ts';

/**
 * LARES markup catalogue.
 *
 * Single source of truth for the inline tags that can be inserted in a lexicon
 * entry. It drives the editor toolbar, the markup guide page and the
 * validation rules, so the three can never drift apart.
 */

/** Realms of the LARES thesaurus (public/pages/thesaurus.xml): field → realm. */
export const REALM_TYPES = [
  'practice',
  'belief',
  'fiction',
  'sign',
  'meaning',
  'speech',
  'systems',
  'instruments',
  'structures',
] as const;

export const CHARACTER_TYPES = ['divine', 'hero', 'myth', 'literary'] as const;
export const SOURCE_TYPES = ['lit', 'ins', 'pap', 'author'] as const;
export const TEXT_LANGS = ['grc', 'la', 'hbo', 'he', 'arc', 'akk'] as const;

export type MarkupGroup = 'language' | 'sources' | 'realms' | 'people' | 'places' | 'links' | 'format';

export interface AttrDef {
  name: string;
  label: { it: string; en: string; pl: string };
  kind: 'select' | 'text' | 'entry';
  options?: readonly string[];
  required?: boolean;
  /** Pre-fill the field from the selected text, slugified (for `key`). */
  fromSelection?: 'slug' | 'text';
  /** Name of a suggestion list provided by the editor (existing subtypes, entries…). */
  suggest?: 'subtypes' | 'placeKeys' | 'personKeys' | 'entries';
  /** Fixed attribute set when the user does not choose (e.g. rend="italic"). */
  fixed?: string;
}

export interface MarkupTag {
  id: string;
  group: MarkupGroup;
  label: { it: string; en: string; pl: string };
  /** Short caption shown on the toolbar button. */
  short: { it: string; en: string; pl: string };
  element: string;
  attrs: AttrDef[];
  /** Presets that become one-click variants (e.g. divine / hero / myth). */
  presets?: Array<{ label: { it: string; en: string; pl: string }; attrs: Record<string, string> }>;
  description: { it: string; en: string; pl: string };
  indexedAs: { it: string; en: string; pl: string } | null;
  example: string;
}

const KEY_ATTR: AttrDef = {
  name: 'key',
  label: { it: 'Chiave indice', en: 'Index key', pl: 'Klucz indeksu' },
  kind: 'text',
  required: true,
  fromSelection: 'slug',
};

export const MARKUP_TAGS: MarkupTag[] = [
  {
    id: 'term',
    group: 'language',
    label: { it: 'Termine greco / latino / ebraico', en: 'Greek / Latin / Hebrew term', pl: 'Termin grecki / łaciński / hebrajski' },
    short: { it: 'Termine', en: 'Term', pl: 'Termin' },
    element: 'w',
    attrs: [
      {
        name: 'lemma',
        label: { it: 'Lemma', en: 'Lemma', pl: 'Lemat' },
        kind: 'text',
        required: true,
        fromSelection: 'text',
      },
    ],
    description: {
      it: 'Segna una parola nella lingua originale. Compare nell’indice dei Termini e nel testo diventa un link a Logeion.',
      en: 'Marks a word in the original language. It appears in the Terms index and links to Logeion in the text.', pl: 'Oznacza słowo w języku oryginalnym. Trafia do indeksu terminów, a w tekście prowadzi do Logeionu.',
    },
    indexedAs: { it: 'Indice dei termini', en: 'Terms index', pl: 'Indeks terminów' },
    example: '<w lemma="ἄγαλμα">ἀγάλματα</w>',
  },
  {
    id: 'foreign',
    group: 'language',
    label: { it: 'Parola in lingua straniera', en: 'Foreign-language word', pl: 'Słowo w języku obcym' },
    short: { it: 'Straniero', en: 'Foreign', pl: 'Obcy' },
    element: 'foreign',
    attrs: [
      {
        name: 'xml:lang',
        label: { it: 'Lingua', en: 'Language', pl: 'Język' },
        kind: 'select',
        options: TEXT_LANGS,
      },
    ],
    description: {
      it: 'Parola o locuzione traslitterata o in altra lingua (corsivo). Non entra negli indici: per questo serve <w>.',
      en: 'Transliterated or foreign word or phrase (italic). It is not indexed: use <w> for that.', pl: 'Transliterowane lub obce słowo albo wyrażenie (kursywa). Nie trafia do indeksów: do tego służy <w>.',
    },
    indexedAs: null,
    example: '<foreign xml:lang="grc">agallomai</foreign>',
  },
  {
    id: 'source',
    group: 'sources',
    label: { it: 'Fonte antica', en: 'Ancient source', pl: 'Źródło starożytne' },
    short: { it: 'Fonte', en: 'Source', pl: 'Źródło' },
    element: 'ref',
    attrs: [
      {
        name: 'type',
        label: { it: 'Tipo di fonte', en: 'Source type', pl: 'Typ źródła' },
        kind: 'select',
        options: SOURCE_TYPES,
        required: true,
      },
    ],
    presets: [
      { label: { it: 'Fonte letteraria', en: 'Literary source', pl: 'Źródło literackie' }, attrs: { type: 'lit' } },
      { label: { it: 'Fonte epigrafica', en: 'Inscription', pl: 'Inskrypcja' }, attrs: { type: 'ins' } },
      { label: { it: 'Fonte papirologica', en: 'Papyrus', pl: 'Papirus' }, attrs: { type: 'pap' } },
      { label: { it: 'Autore antico', en: 'Ancient author', pl: 'Autor starożytny' }, attrs: { type: 'author' } },
    ],
    description: {
      it: 'Citazione di una fonte antica: letteraria (lit), epigrafica (ins), papirologica (pap) oppure il nome di un autore antico (author).',
      en: 'Citation of an ancient source: literary (lit), inscriptional (ins), papyrological (pap) or the name of an ancient author (author).', pl: 'Cytat ze źródła starożytnego: literackiego (lit), inskrypcji (ins), papirusu (pap) albo nazwisko autora starożytnego (author).',
    },
    indexedAs: { it: 'Indice delle fonti antiche', en: 'Ancient sources index', pl: 'Indeks źródeł starożytnych' },
    example: '<ref type="lit">Homer, Odyssey 3.438</ref>',
  },
  {
    id: 'realm',
    group: 'realms',
    label: { it: 'Ambito religioso', en: 'Religious realm', pl: 'Dziedzina religijna' },
    short: { it: 'Ambito', en: 'Realm', pl: 'Dziedzina' },
    element: 'rs',
    attrs: [
      {
        name: 'type',
        label: { it: 'Categoria', en: 'Category', pl: 'Kategoria' },
        kind: 'select',
        options: REALM_TYPES,
        required: true,
      },
      {
        name: 'subtype',
        label: { it: 'Sottocategoria (più valori separati da ;)', en: 'Subtype (several values separated by ;)', pl: 'Podtyp (kilka wartości oddzielonych ;)' },
        kind: 'text',
        suggest: 'subtypes',
      },
    ],
    description: {
      it: 'Assegna un passo a un ambito del tesauro (pratica, credenza, finzione, segno, significato, discorso, sistemi, strumenti, strutture). @type e @subtype accettano più valori separati da «;»; i valori di più parole usano «_» (es. ritual_practice). Il testo viene sottolineato nel colore dell’ambito.',
      en: 'Assigns a passage to a thesaurus realm (practice, belief, fiction, sign, meaning, speech, systems, instruments, structures). @type and @subtype accept several values separated by “;”; multi-word values use “_” (e.g. ritual_practice). The text is underlined in the realm colour.', pl: 'Przypisuje fragment do dziedziny tezaurusa (practice, belief, fiction, sign, meaning, speech, systems, instruments, structures). @type i @subtype przyjmują kilka wartości oddzielonych „;”; wartości wielowyrazowe łączy się znakiem „_” (np. ritual_practice). Tekst jest podkreślony kolorem dziedziny.',
    },
    indexedAs: { it: 'Indice degli ambiti', en: 'Realms index', pl: 'Indeks dziedzin' },
    example: '<rs type="practice" subtype="ritual_practice">dedicatory offering</rs>',
  },
  {
    id: 'character',
    group: 'people',
    label: { it: 'Figura divina, eroica o mitica', en: 'Divine, heroic or mythical figure', pl: 'Postać boska, heroiczna lub mityczna' },
    short: { it: 'Divinità', en: 'Deity', pl: 'Bóstwo' },
    element: 'persName',
    attrs: [
      {
        name: 'type',
        label: { it: 'Tipo', en: 'Type', pl: 'Typ' },
        kind: 'select',
        options: CHARACTER_TYPES,
        required: true,
      },
      { ...KEY_ATTR, suggest: 'personKeys' },
    ],
    presets: [
      { label: { it: 'Divinità', en: 'Divine', pl: 'Bóstwo' }, attrs: { type: 'divine' } },
      { label: { it: 'Eroe', en: 'Hero', pl: 'Heros' }, attrs: { type: 'hero' } },
      { label: { it: 'Figura mitica', en: 'Myth', pl: 'Postać mityczna' }, attrs: { type: 'myth' } },
      { label: { it: 'Pers. letterario', en: 'Literary figure', pl: 'Postać literacka' }, attrs: { type: 'literary' } },
    ],
    description: {
      it: 'Divinità, eroi, figure mitiche o letterarie. La chiave unisce le varianti dello stesso nome nell’indice.',
      en: 'Gods, heroes, mythical or literary figures. The key merges variants of the same name in the index.', pl: 'Bogowie, herosi, postacie mityczne lub literackie. Klucz łączy w indeksie warianty tego samego imienia.',
    },
    indexedAs: { it: 'Indice dei personaggi', en: 'Characters index', pl: 'Indeks postaci' },
    example: '<persName type="divine" key="athena">Athena Polias</persName>',
  },
  {
    id: 'historical',
    group: 'people',
    label: { it: 'Figura storica', en: 'Historical figure', pl: 'Postać historyczna' },
    short: { it: 'Storico', en: 'Historical', pl: 'Historyczna' },
    element: 'persName',
    attrs: [{ ...KEY_ATTR, suggest: 'personKeys' }],
    description: {
      it: 'Persona storica (autori, magistrati, generali). Un persName senza `type`.',
      en: 'Historical person (authors, magistrates, generals). A persName with no `type`.', pl: 'Osoba historyczna (autorzy, urzędnicy, wodzowie). Element persName bez `type`.',
    },
    indexedAs: { it: 'Indice delle figure storiche', en: 'Historical figures index', pl: 'Indeks postaci historycznych' },
    example: '<persName key="phidias">Phidias</persName>',
  },
  {
    id: 'place',
    group: 'places',
    label: { it: 'Luogo', en: 'Place', pl: 'Miejsce' },
    short: { it: 'Luogo', en: 'Place', pl: 'Miejsce' },
    element: 'placeName',
    attrs: [{ ...KEY_ATTR, label: { it: 'Chiave luogo', en: 'Place key', pl: 'Klucz miejsca' }, suggest: 'placeKeys' }],
    description: {
      it: 'Santuari, poleis, templi, regioni.',
      en: 'Sanctuaries, poleis, temples, regions.', pl: 'Sanktuaria, poleis, świątynie, regiony.',
    },
    indexedAs: { it: 'Indice dei luoghi', en: 'Places index', pl: 'Indeks miejsc' },
    example: '<placeName key="delphi">Delphi</placeName>',
  },
  {
    id: 'crosslink',
    group: 'links',
    label: { it: 'Rimando a un’altra scheda', en: 'Cross-reference to another entry', pl: 'Odsyłacz do innego hasła' },
    short: { it: 'Rimando', en: 'Link', pl: 'Odsyłacz' },
    element: 'ref',
    attrs: [
      {
        name: 'corresp',
        label: { it: 'Scheda di destinazione', en: 'Target entry', pl: 'Hasło docelowe' },
        kind: 'entry',
        required: true,
        suggest: 'entries',
      },
    ],
    description: {
      it: 'Collegamento interno a un’altra scheda o capitolo: nome del file senza .xml più «.html», come nel sito EFES.',
      en: 'Internal link to another entry or chapter: the file name without .xml plus “.html”, as on the EFES site.', pl: 'Wewnętrzny odsyłacz do innego hasła lub rozdziału: nazwa pliku bez .xml plus „.html”, jak w serwisie EFES.',
    },
    indexedAs: null,
    example: '<ref corresp="lexicon_fides.html">fides</ref>',
  },
  {
    id: 'external',
    group: 'links',
    label: { it: 'Link esterno (TLG, Perseus, PHI…)', en: 'External link (TLG, Perseus, PHI…)', pl: 'Link zewnętrzny (TLG, Perseus, PHI…)' },
    short: { it: 'Link esterno', en: 'External', pl: 'Zewnętrzny' },
    element: 'ref',
    attrs: [
      {
        name: 'corresp',
        label: { it: 'URL', en: 'URL', pl: 'URL' },
        kind: 'text',
        required: true,
      },
    ],
    description: {
      it: 'Collegamento a una risorsa esterna. Se il tag è vuoto, nel testo compare la sola freccia ↗. Ricorda: «&» va scritto «&amp;» anche negli URL.',
      en: 'Link to an external resource. When the tag is empty only a ↗ arrow is shown. Remember: “&” must be written “&amp;”, URLs included.', pl: 'Odsyłacz do zasobu zewnętrznego. Jeśli znacznik jest pusty, w tekście widać tylko strzałkę ↗. Pamiętaj: „&” zapisuje się jako „&amp;”, także w adresach URL.',
    },
    indexedAs: null,
    example: '<ref corresp="https://www.perseus.tufts.edu/hopper/text?doc=Hom.+Il.+1.1"></ref>',
  },
  {
    id: 'italic',
    group: 'format',
    label: { it: 'Corsivo', en: 'Italic', pl: 'Kursywa' },
    short: { it: 'Corsivo', en: 'Italic', pl: 'Kursywa' },
    element: 'hi',
    attrs: [{ name: 'rend', label: { it: 'Resa', en: 'Rendering', pl: 'Sposób wyróżnienia' }, kind: 'text', fixed: 'italic' }],
    description: { it: 'Testo in corsivo.', en: 'Italic text.', pl: 'Tekst kursywą.' },
    indexedAs: null,
    example: '<hi rend="italic">thysia</hi>',
  },
  {
    id: 'emph',
    group: 'format',
    label: { it: 'Enfasi (grassetto)', en: 'Emphasis (bold)', pl: 'Wyróżnienie (pogrubienie)' },
    short: { it: 'Enfasi', en: 'Emph', pl: 'Wyróżn.' },
    element: 'emph',
    attrs: [],
    description: {
      it: 'Termine in evidenza (grassetto). Convenzione del progetto: si usa <emph>, non <hi rend="bold">.',
      en: 'Emphasised term (bold). Project convention: use <emph>, not <hi rend="bold">.', pl: 'Wyróżniony termin (pogrubienie). Konwencja projektu: używaj <emph>, nie <hi rend="bold">.',
    },
    indexedAs: null,
    example: '<emph>Giuseppina Paola Viscardi</emph>',
  },
  {
    id: 'title',
    group: 'format',
    label: { it: 'Titolo di un’opera', en: 'Work title', pl: 'Tytuł dzieła' },
    short: { it: 'Titolo', en: 'Title', pl: 'Tytuł' },
    element: 'title',
    attrs: [],
    description: { it: 'Titolo di un’opera antica o moderna (corsivo).', en: 'Title of an ancient or modern work (italic).', pl: 'Tytuł dzieła starożytnego lub współczesnego (kursywa).' },
    indexedAs: null,
    example: '<title>Odyssey</title>',
  },
];

export const GROUP_LABELS: Record<MarkupGroup, { it: string; en: string; pl: string }> = {
  language: { it: 'Lingua', en: 'Language', pl: 'Język' },
  sources: { it: 'Fonti', en: 'Sources', pl: 'Źródła' },
  realms: { it: 'Ambiti', en: 'Realms', pl: 'Dziedziny' },
  people: { it: 'Persone', en: 'People', pl: 'Osoby' },
  places: { it: 'Luoghi', en: 'Places', pl: 'Miejsca' },
  links: { it: 'Collegamenti', en: 'Links', pl: 'Odsyłacze' },
  format: { it: 'Formattazione', en: 'Formatting', pl: 'Formatowanie' },
};

/** Block-level snippets inserted at the cursor (not wrapping a selection). */
export interface BlockSnippet {
  id: string;
  label: { it: string; en: string; pl: string };
  xml: string;
}

export const BLOCK_SNIPPETS: BlockSnippet[] = [
  {
    id: 'textpart',
    label: { it: 'Nuova sezione (textpart)', en: 'New section (textpart)', pl: 'Nowa sekcja (textpart)' },
    xml: `                <div type="textpart" n="Section">
                    <head>Section title</head>
                    <p>Text…</p>
                </div>
`,
  },
  {
    id: 'paragraph',
    label: { it: 'Paragrafo', en: 'Paragraph', pl: 'Akapit' },
    xml: `                    <p>Text…</p>
`,
  },
  {
    id: 'quote',
    label: { it: 'Citazione a versi', en: 'Verse quotation', pl: 'Cytat wierszowany' },
    xml: `                    <quote>
                        <lb/>First line
                        <lb/>Second line
                    </quote>
`,
  },
  {
    id: 'list',
    label: { it: 'Elenco numerato', en: 'Numbered list', pl: 'Lista numerowana' },
    xml: `                    <list>
                        <item n="1">First item.</item>
                        <item n="2">Second item.</item>
                    </list>
`,
  },
  {
    id: 'bibl',
    label: { it: 'Voce bibliografica', en: 'Bibliography item', pl: 'Pozycja bibliograficzna' },
    xml: `                <p>Surname, Name (2000). Title of the work. Place: Publisher.</p>
`,
  },
];

export function slugify(text: string): string {
  return greekToLatin(text)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Builds the opening+closing tags around `inner` (which is inserted verbatim). */
export function wrapWithTag(element: string, attrs: Record<string, string>, inner: string): string {
  const attrStr = Object.entries(attrs)
    .filter(([, v]) => v !== '' && v != null)
    .map(([k, v]) => ` ${k}="${escapeXml(v)}"`)
    .join('');
  return `<${element}${attrStr}>${inner}</${element}>`;
}

/**
 * Wraps the [start, end) range of `source` with a tag. When nothing is selected a
 * placeholder is inserted. Returns the new text and the range to re-select.
 */
export function applyTagToRange(
  source: string,
  start: number,
  end: number,
  element: string,
  attrs: Record<string, string>,
  placeholder = 'text'
): { text: string; selStart: number; selEnd: number } {
  const selected = source.slice(start, end) || placeholder;
  const wrapped = wrapWithTag(element, attrs, selected);
  const text = source.slice(0, start) + wrapped + source.slice(end);
  const openLen = wrapped.indexOf('>') + 1;
  return { text, selStart: start + openLen, selEnd: start + openLen + selected.length };
}
