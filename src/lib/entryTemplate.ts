import { escapeXml, slugify } from './markup.ts';

/** Prefix of the file name: lexicon entries or one of the four book volumes. */
export type EntryKind = 'lexicon' | 'hom' | 'trag' | 'com' | 'cpch';
export type EditionLang = 'it' | 'en' | 'pl';

export const ENTRY_KINDS: Array<{ kind: EntryKind; label: { it: string; en: string; pl: string } }> = [
  { kind: 'lexicon', label: { it: 'Scheda del lessico', en: 'Lexicon entry', pl: 'Hasło leksykonu' } },
  { kind: 'hom', label: { it: 'Capitolo — Omero', en: 'Chapter — Homer', pl: 'Rozdział — Homer' } },
  { kind: 'trag', label: { it: 'Capitolo — Tragedia', en: 'Chapter — Tragedy', pl: 'Rozdział — Tragedia' } },
  { kind: 'com', label: { it: 'Capitolo — Commedia', en: 'Chapter — Comedy', pl: 'Rozdział — Komedia' } },
  { kind: 'cpch', label: { it: 'Capitolo — Corpus Platonicum/Hippocraticum', en: 'Chapter — Corpus Platonicum/Hippocraticum', pl: 'Rozdział — Corpus Platonicum/Hippocraticum' } },
];

export const EDITION_LANGS: Array<{ code: EditionLang; label: string }> = [
  { code: 'it', label: 'Italiano' },
  { code: 'en', label: 'English' },
  { code: 'pl', label: 'Polski' },
];

export interface NewEntryInput {
  kind: EntryKind;
  title: string;
  /** File name without extension, e.g. lexicon_agalma. */
  fileBase: string;
  langs: EditionLang[];
  author: string;
  date: string;
}

/**
 * Suggested file name. Lexicon: lexicon_<title>. Chapters follow the volume's
 * numbering (hom_45_<title>): the next free number is used.
 */
export function fileNameFor(kind: EntryKind, title: string, existing: string[] = []): string {
  const slug = slugify(title) || 'untitled';
  if (kind === 'lexicon') return `lexicon_${slug}.xml`;
  const used = existing
    .map((f) => new RegExp(`^${kind}_(\\d+)_`).exec(f)?.[1])
    .filter(Boolean)
    .map(Number);
  const next = String((used.length ? Math.max(...used) : 0) + 1).padStart(2, '0');
  return `${kind}_${next}_${slug}.xml`;
}

export function entryIdFromFileName(fileName: string): string {
  return fileName.replace(/\.xml$/i, '').toLowerCase().replace(/[^a-z0-9_-]/g, '-');
}

const SECTIONS: Record<EditionLang, string[]> = {
  en: ['Etymology', 'Testimonies', 'Discussion/Interpretation'],
  it: ['Etimologia', 'Testimonianze', 'Discussione/Interpretazione'],
  pl: ['Etymologia', 'Świadectwa', 'Dyskusja/Interpretacja'],
};

/** Skeleton of a new file, in the layout of the project templates (docs/efes/). */
export function buildEntryTemplate(input: NewEntryInput): string {
  const e = escapeXml;
  const year = input.date.slice(0, 4);
  const langs = input.langs.length ? input.langs : (['en'] as EditionLang[]);
  const lexicon = input.kind === 'lexicon';
  const titleLines = langs.map((l) => `                <title xml:lang="${l}">${e(input.title)}</title>`).join('\n');

  const editions = langs
    .map((l) => {
      const parts = lexicon ? SECTIONS[l] : [e(input.title)];
      return `            <div type="edition" xml:lang="${l}">
${parts
  .map(
    (name, i) => `                <div type="textpart" n="${lexicon ? e(name) : 'intro'}">
                    <head>${lexicon ? e(name) : e(input.title)}</head>
                    <p></p>
                </div>${i < parts.length - 1 ? '\n' : ''}`
  )
  .join('\n')}
            </div>`;
    })
    .join('\n\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<?xml-model href="http://www.stoa.org/epidoc/schema/latest/tei-epidoc.rng" schematypens="http://relaxng.org/ns/structure/1.0"?>
<TEI xmlns="http://www.tei-c.org/ns/1.0">
    <teiHeader>
        <fileDesc>
            <titleStmt>
${titleLines}
            </titleStmt>
            <publicationStmt>
                <publisher><ref target="https://site.unibo.it/lares/">LARES Project</ref></publisher>
                <date when="${e(year)}"/>
                <idno type="filename">${e(input.fileBase)}</idno>
                <availability>
                    <licence target="http://creativecommons.org/licenses/by-sa/4.0/">Creative Commons Attribution-ShareAlike 4.0 International</licence>
                </availability>
            </publicationStmt>
            <sourceDesc>
                <p>Born digital document.</p>
            </sourceDesc>
        </fileDesc>
        <revisionDesc>
            <listChange>
                <change when="${e(input.date)}" who="${e(input.author)}">encoded in XML</change>
                <change when="${e(input.date)}" who="${e(input.author)}">written contents</change>
            </listChange>
        </revisionDesc>
    </teiHeader>
    <text>
        <body>
${editions}

            <div type="bibliography">
                <p></p>
            </div>
        </body>
    </text>
</TEI>
`;
}
