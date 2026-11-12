import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { tr } from '../i18n/translations.ts';
import type { Language } from '../i18n/translations.ts';
import type { LexiconEntry } from '../types/lexicon.ts';
import { parseEpiDocXml } from '../utils/xmlParser.ts';
import { downloadFile } from '../utils/csvExport.ts';
import { browserParse, validateEntryXml } from '../lib/validateEntry.ts';
import { entryIdFromFileName } from '../lib/entryTemplate.ts';
import { ApiError, saveEntry } from '../lib/editorApi.ts';
import { STATIC_SITE } from '../utils/endpoints.ts';
import { clearDraft, copyText, githubEditUrl, loadDraft, saveDraft } from '../lib/staticEditing.ts';
import {
  addBibItem,
  addBibliography,
  addChange,
  addEdition,
  buildModel,
  escapeText,
  indentOf,
  indentUnit,
  inner,
  insertAfter,
  outer,
  plain,
  removeNode,
  replaceInner,
  setAttr,
  setContent,
  setHead,
  setTitles,
  splice,
  swapSiblings,
  textpartBlock,
  tokenize,
  type LexiconModel,
  type XNode,
} from '../lib/lexiconSections.ts';
import { InlineMarkupEditor } from './InlineMarkupEditor.tsx';
import type { Suggestions } from './MarkupToolbar.tsx';
import './sectionEditor.css';

/* ================================================================
 * SectionEditor — "Officina" a sezioni per le schede del Lexicon
 * Struttura e filosofia dall'editor di ILA (SectionEditorView):
 * sezioni a sinistra, form della sezione al centro, ogni modifica
 * riscrive solo lo span XML dell'elemento toccato (patch-only).
 * ================================================================ */

interface Props {
  lang: Language;
  entries: LexiconEntry[];
  fileName: string;
  initialXml: string;
  onSaved: () => Promise<void> | void;
}

type Group = 'header' | 'text' | 'apparatus' | 'check';

interface SectionDef {
  id: string;
  group: Group;
  label: string;
  desc: string;
  state: 'empty' | 'present' | 'modified' | 'error';
  badge?: number;
}

const LANG_NAMES: Record<string, string> = { it: 'Italiano', en: 'English', pl: 'Polski', de: 'Deutsch', fr: 'Français', es: 'Español', grc: 'Greco', la: 'Latino' };

/** Firma testuale di ogni sezione: serve per il pallino "modificata". */
function signatures(xml: string, m: LexiconModel): Record<string, string> {
  const s: Record<string, string> = {
    titles: m.titleStmt ? outer(xml, m.titleStmt) : '',
    publication: [m.idno, m.date].map((n) => (n ? outer(xml, n) : '')).join('|') + m.docLang,
    source: m.sourceDesc ? outer(xml, m.sourceDesc) : '',
    revisions: m.listChange ? outer(xml, m.listChange) : '',
    bibliography: m.bibliographies.map((b) => outer(xml, b.node)).join('|'),
    others: m.others.map((o) => outer(xml, o)).join('|'),
  };
  for (const ed of m.editions) s[`ed:${ed.lang}`] = (s[`ed:${ed.lang}`] || '') + outer(xml, ed.node);
  return s;
}

/* ── piccoli componenti ────────────────────────────────────────── */

const Field: React.FC<{ label: string; hint?: string; children: React.ReactNode; className?: string }> = ({ label, hint, children, className }) => (
  <label className={`block ${className || ''}`}>
    <span className="label">
      {label}
      {hint && <span className="ml-2 normal-case tracking-normal text-faint">{hint}</span>}
    </span>
    {children}
  </label>
);

/** Textarea di XML grezzo, applicata solo quando è ben formata. */
const RawXmlField: React.FC<{ value: string; onApply: (v: string) => void; lang: Language; rows?: number }> = ({ value, onApply, lang, rows = 6 }) => {
  const [draft, setDraft] = useState(value);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => setDraft(value), [value]);
  return (
    <div className="space-y-1">
      <textarea
        className="field xml-editor w-full font-mono !text-xs"
        rows={rows}
        spellCheck={false}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft === value) return;
          try {
            tokenize(draft);
            setErr(null);
            onApply(draft);
          } catch (e) {
            setErr((e as Error).message);
          }
        }}
      />
      {err && (
        <p className="text-xs text-danger">
          {tr(lang, 'XML non valido, non applicato', 'Invalid XML, not applied', 'Nieprawidłowy XML, nie zastosowano')}: {err}
        </p>
      )}
    </div>
  );
};

const SectionHeader: React.FC<{ title: string; desc: string; children?: React.ReactNode }> = ({ title, desc, children }) => (
  <header className="mb-6 flex flex-wrap items-end justify-between gap-3 border-b border-line pb-4">
    <div>
      <h2 className="font-serif text-3xl font-medium">{title}</h2>
      <p className="text-sm text-muted">{desc}</p>
    </div>
    {children && <div className="flex flex-wrap gap-2">{children}</div>}
  </header>
);

/* ── editor ────────────────────────────────────────────────────── */

export const SectionEditor: React.FC<Props> = ({ lang, entries, fileName, initialXml, onSaved }) => {
  const L = (it: string, en: string, pl: string) => tr(lang, it, en, pl);
  // Sito statico: si riparte dalla bozza salvata in questo browser, se c'è.
  const [startDraft] = useState(() => {
    if (!STATIC_SITE) return null;
    const d = loadDraft(fileName);
    if (d && d.xml === initialXml) {
      clearDraft(fileName); // già pubblicata
      return null;
    }
    return d;
  });
  const [xml, setXmlRaw] = useState(startDraft?.xml ?? initialXml);
  const [baseline, setBaseline] = useState(initialXml);
  const [active, setActive] = useState<string>('titles');
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState<{ kind: 'ok' | 'warn' | 'error'; text: string } | null>(() =>
    startDraft
      ? startDraft.base !== initialXml
        ? { kind: 'warn', text: tr(lang, `Bozza del ${new Date(startDraft.savedAt).toLocaleString(lang, { dateStyle: 'short', timeStyle: 'short' })} ripristinata, ma il file pubblicato è cambiato nel frattempo: controlla prima di pubblicare.`, `Draft from ${new Date(startDraft.savedAt).toLocaleString(lang, { dateStyle: 'short', timeStyle: 'short' })} restored, but the published file has changed since: check before publishing.`, `Przywrócono szkic z ${new Date(startDraft.savedAt).toLocaleString(lang, { dateStyle: 'short', timeStyle: 'short' })}, ale opublikowany plik się zmienił: sprawdź przed publikacją.`) }
        : { kind: 'ok', text: tr(lang, `Bozza del ${new Date(startDraft.savedAt).toLocaleString(lang, { dateStyle: 'short', timeStyle: 'short' })} ripristinata da questo browser.`, `Draft from ${new Date(startDraft.savedAt).toLocaleString(lang, { dateStyle: 'short', timeStyle: 'short' })} restored from this browser.`, `Przywrócono szkic z ${new Date(startDraft.savedAt).toLocaleString(lang, { dateStyle: 'short', timeStyle: 'short' })} z tej przeglądarki.`) }
      : null
  );
  const [revWho, setRevWho] = useState(() => {
    try {
      return localStorage.getItem('lares_editor_who') || '';
    } catch {
      return '';
    }
  });
  const [revNote, setRevNote] = useState('');
  const history = useRef<{ past: string[]; future: string[]; lastKey: string; lastAt: number }>({ past: [], future: [], lastKey: '', lastAt: 0 });

  /** Ogni modifica passa di qui: registra la cronologia (raggruppando la digitazione). */
  const setXml = useCallback((next: string, key = '') => {
    setXmlRaw((prev) => {
      if (next === prev) return prev;
      const h = history.current;
      const now = Date.now();
      if (!(key && key === h.lastKey && now - h.lastAt < 1200)) h.past.push(prev);
      if (h.past.length > 200) h.past.shift();
      h.future = [];
      h.lastKey = key;
      h.lastAt = now;
      return next;
    });
  }, []);

  const undo = () => {
    const h = history.current;
    const prev = h.past.pop();
    if (prev === undefined) return;
    h.future.push(xml);
    h.lastKey = '';
    setXmlRaw(prev);
  };
  const redo = () => {
    const h = history.current;
    const next = h.future.pop();
    if (next === undefined) return;
    h.past.push(xml);
    h.lastKey = '';
    setXmlRaw(next);
  };

  const modelResult = useMemo(() => {
    try {
      return { model: buildModel(xml), error: null as string | null };
    } catch (e) {
      return { model: null, error: (e as Error).message };
    }
  }, [xml]);
  const m = modelResult.model;
  const baseSig = useMemo(() => {
    try {
      return signatures(baseline, buildModel(baseline));
    } catch {
      return {};
    }
  }, [baseline]);
  const sig = useMemo(() => (m ? signatures(xml, m) : {}), [xml, m]);

  const deferredXml = useDeferredValue(xml);
  const knownIds = useMemo(() => entries.map((e) => e.id.toLowerCase()), [entries]);
  const issues = useMemo(() => validateEntryXml(deferredXml, { parse: browserParse, fileName, knownEntryIds: knownIds, lang }), [deferredXml, fileName, knownIds, lang]);
  const errorCount = issues.filter((i) => i.level === 'error').length;
  const parsed = useMemo(() => (browserParse(deferredXml).errors.length ? null : parseEpiDocXml(deferredXml, fileName).entry || null), [deferredXml, fileName]);

  const suggestions: Suggestions = useMemo(() => {
    const uniq = (xs: string[]) => Array.from(new Set(xs.filter(Boolean))).sort((a, b) => a.localeCompare(b));
    return {
      subtypes: uniq(entries.flatMap((e) => e.indexedData.realms.map((r) => r.subtype))),
      placeKeys: uniq(entries.flatMap((e) => e.indexedData.places.map((p) => p.key))),
      personKeys: uniq(entries.flatMap((e) => [...e.indexedData.characters.map((c) => c.key), ...e.indexedData.historicalFigures.map((h) => h.key)])),
      entries: uniq(entries.map((e) => e.fileName.replace(/\.xml$/, ''))),
    };
  }, [entries]);

  const dirty = xml !== baseline;

  // Sito statico: ogni modifica resta come bozza nel browser (nessun server su cui salvare).
  useEffect(() => {
    if (!STATIC_SITE) return;
    const t = setTimeout(() => (xml === initialXml ? clearDraft(fileName) : saveDraft(fileName, { xml, base: initialXml })), 400);
    return () => clearTimeout(t);
  }, [xml, fileName, initialXml]);
  useEffect(() => {
    if (!dirty || STATIC_SITE) return; // sul sito statico la bozza è già salvata nel browser
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  // Cmd/Ctrl+S salva; Cmd/Ctrl+Z annulla quando il fuoco non è in un campo.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void handleSave();
      }
      const inField = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement)?.tagName || '');
      if (mod && e.key.toLowerCase() === 'z' && !inField) {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });

  /* ── elenco delle sezioni ─────────────────────────────────── */
  const sections: SectionDef[] = useMemo(() => {
    if (!m) return [];
    const st = (id: string, present: boolean): SectionDef['state'] => (sig[id] !== baseSig[id] ? 'modified' : present ? 'present' : 'empty');
    const langs = Array.from(new Set(m.editions.map((e) => e.lang)));
    const list: SectionDef[] = [
      { id: 'titles', group: 'header', label: L('Titolo', 'Title', 'Tytuł'), desc: L('Titoli della scheda per lingua (titleStmt).', 'Entry titles by language (titleStmt).', 'Tytuły hasła według języka (titleStmt).'), state: st('titles', m.titles.length > 0) },
      { id: 'publication', group: 'header', label: L('Pubblicazione', 'Publication', 'Publikacja'), desc: L('Nome file, data, editore e licenza (publicationStmt).', 'File name, date, publisher and licence (publicationStmt).', 'Nazwa pliku, data, wydawca i licencja (publicationStmt).'), state: st('publication', !!m.idno) },
      { id: 'source', group: 'header', label: L('Fonte', 'Source', 'Źródło'), desc: L('Provenienza del testo (sourceDesc).', 'Origin of the text (sourceDesc).', 'Pochodzenie tekstu (sourceDesc).'), state: st('source', !!m.sourceDesc && plain(inner(xml, m.sourceDesc)).length > 0) },
      { id: 'revisions', group: 'header', label: L('Revisioni', 'Revisions', 'Rewizje'), desc: L('Cronologia delle modifiche (revisionDesc).', 'Change history (revisionDesc).', 'Historia zmian (revisionDesc).'), state: st('revisions', m.changes.length > 0), badge: m.changes.length },
      ...langs.map(
        (l): SectionDef => ({
          id: `ed:${l}`,
          group: 'text',
          label: `${L('Edizione', 'Edition', 'Edycja')} ${l.toUpperCase()}`,
          desc: L(`Testo in ${LANG_NAMES[l] || l}: sezioni (textpart), titoli e marcatura.`, `Text in ${LANG_NAMES[l] || l}: sections (textpart), headings and markup.`, `Tekst (${LANG_NAMES[l] || l}): sekcje (textpart), nagłówki i znakowanie.`),
          state: st(`ed:${l}`, true),
          badge: m.editions.filter((e) => e.lang === l).reduce((n, e) => n + e.textparts.length, 0),
        })
      ),
      { id: 'bibliography', group: 'apparatus', label: L('Bibliografia', 'Bibliography', 'Bibliografia'), desc: L('Riferimenti bibliografici moderni.', 'Modern bibliographic references.', 'Współczesne odniesienia bibliograficzne.'), state: st('bibliography', m.bibliographies.length > 0), badge: m.bibliographies.reduce((n, b) => n + b.items.length, 0) },
    ];
    if (m.others.length) list.push({ id: 'others', group: 'apparatus', label: L('Altri blocchi', 'Other blocks', 'Inne bloki'), desc: L('Elementi del body fuori dallo schema consueto: modificabili come XML.', 'Body elements outside the usual layout: editable as XML.', 'Elementy body poza zwykłym układem: edycja jako XML.'), state: st('others', true), badge: m.others.length });
    list.push(
      { id: 'checks', group: 'check', label: L('Controlli', 'Checks', 'Kontrole'), desc: L('Validazione delle convenzioni LARES.', 'Validation of LARES conventions.', 'Walidacja konwencji LARES.'), state: errorCount ? 'error' : issues.length ? 'modified' : 'present', badge: issues.length },
      { id: 'indices', group: 'check', label: L('Indici', 'Indices', 'Indeksy'), desc: L('Specchio della marcatura: ciò che finirà negli indici del sito.', 'Mirror of the markup: what will appear in the site indices.', 'Odbicie znakowania: to, co trafi do indeksów.'), state: 'present' },
      { id: 'xml', group: 'check', label: 'XML', desc: L('Il file completo, in sola lettura.', 'The full file, read-only.', 'Pełny plik, tylko do odczytu.'), state: 'present' }
    );
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m, sig, baseSig, issues, errorCount, lang]);

  const changedSections = sections.filter((s) => s.state === 'modified' && s.group !== 'check');
  const current = sections.find((s) => s.id === active) || sections[0];

  /* ── salvataggio ──────────────────────────────────────────── */
  const handleSave = async () => {
    if (saving || !m) return;
    if (errorCount > 0) {
      setBanner({ kind: 'error', text: L('Correggi gli errori prima di salvare.', 'Fix the errors before saving.', 'Popraw błędy przed zapisem.') });
      setActive('checks');
      return;
    }
    if (!dirty && !revNote.trim()) return;
    setSaving(true);
    setBanner(null);
    try {
      let finalXml = xml;
      if (revNote.trim()) finalXml = addChange(finalXml, buildModel(finalXml), { when: new Date().toISOString().slice(0, 10), who: revWho.trim(), text: revNote.trim() });
      try {
        if (revWho.trim()) localStorage.setItem('lares_editor_who', revWho.trim());
      } catch {
        /* preferenza non salvata */
      }
      if (STATIC_SITE) {
        // Nessun server: copia l'XML e apre la pagina di modifica del file su GitHub.
        saveDraft(fileName, { xml: finalXml, base: initialXml });
        setXmlRaw(finalXml);
        setRevNote('');
        const copied = await copyText(finalXml);
        window.open(githubEditUrl(fileName), '_blank', 'noopener');
        setBanner({
          kind: copied ? 'ok' : 'warn',
          text: copied
            ? L('XML copiato. Nella pagina GitHub appena aperta seleziona tutto il contenuto (⌘A), incolla (⌘V) e premi «Commit changes». La bozza resta in questo browser finché il sito non si aggiorna.', 'XML copied. In the GitHub page just opened select all (⌘A), paste (⌘V) and press “Commit changes”. The draft stays in this browser until the site updates.', 'XML skopiowany. Na otwartej stronie GitHuba zaznacz wszystko (⌘A), wklej (⌘V) i naciśnij „Commit changes”. Szkic zostaje w tej przeglądarce do aktualizacji strony.')
            : L('Non riesco a copiare negli appunti: usa «Scarica» e carica il file nella pagina GitHub appena aperta.', 'Could not copy to the clipboard: use “Download” and upload the file in the GitHub page just opened.', 'Nie udało się skopiować: użyj „Pobierz” i wgraj plik na otwartej stronie GitHuba.'),
        });
        return;
      }
      const res = await saveEntry(fileName, finalXml, false);
      setXmlRaw(finalXml);
      setBaseline(finalXml);
      setRevNote('');
      const g = res.github;
      setBanner(
        g.status === 'committed'
          ? { kind: 'ok', text: L('Salvata e pubblicata su GitHub.', 'Saved and published to GitHub.', 'Zapisano i opublikowano na GitHubie.') }
          : g.status === 'failed'
            ? { kind: 'warn', text: `${L('Salvata sul server, ma GitHub ha rifiutato', 'Saved on the server, but GitHub failed', 'Zapisano na serwerze, ale GitHub odrzucił')}: ${g.error}` }
            : { kind: 'ok', text: L('Salvata (solo sul disco del server: GitHub non è configurato).', 'Saved (server disk only: GitHub is not configured).', 'Zapisano (tylko na dysku serwera: GitHub nie jest skonfigurowany).') }
      );
      await onSaved();
    } catch (e) {
      setBanner({ kind: 'error', text: (e as ApiError).message });
    } finally {
      setSaving(false);
    }
  };

  if (!m) {
    return (
      <div className="card mx-auto max-w-xl space-y-3 p-6">
        <h2 className="font-serif text-2xl">{L('XML non leggibile', 'Unreadable XML', 'Nieczytelny XML')}</h2>
        <p className="text-sm text-muted">{modelResult.error}</p>
        <a className="btn" href={`#/editor/edit/${entryIdFromFileName(fileName)}`}>
          {L('Apri nell’editor XML', 'Open in the XML editor', 'Otwórz w edytorze XML')}
        </a>
      </div>
    );
  }

  const unit = indentUnit(xml, m);
  const today = new Date().toISOString().slice(0, 10);

  /* ── pannelli ─────────────────────────────────────────────── */

  const TitlesPanel = () => {
    const rows = m.titles.map((t) => ({ lang: t.lang, text: t.text }));
    const write = (next: Array<{ lang: string; text: string }>, key: string) => setXml(setTitles(xml, m, next), key);
    return (
      <div className="space-y-3">
        {rows.map((r, i) => (
          <div key={i} className="flex items-end gap-2">
            <Field label={L('Lingua', 'Language', 'Język')} className="w-28">
              <input className="field font-mono" value={r.lang} list="sec-langs" onChange={(e) => write(rows.map((x, j) => (j === i ? { ...x, lang: e.target.value } : x)), `title-lang-${i}`)} />
            </Field>
            <Field label={L('Titolo', 'Title', 'Tytuł')} className="flex-1">
              <input className="field !text-lg" value={r.text} onChange={(e) => write(rows.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)), `title-${i}`)} />
            </Field>
            <button type="button" className="btn btn-danger !py-1.5" disabled={rows.length <= 1} onClick={() => write(rows.filter((_, j) => j !== i), '')}>
              ×
            </button>
          </div>
        ))}
        <datalist id="sec-langs">
          {['grc', 'la', 'he', 'it', 'en', 'pl'].map((l) => (
            <option key={l} value={l} />
          ))}
        </datalist>
        <button type="button" className="chip" onClick={() => write([...rows, { lang: '', text: m.titles[0]?.text || '…' }], '')}>
          + {L('Titolo in un’altra lingua', 'Title in another language', 'Tytuł w innym języku')}
        </button>
        <p className="text-xs text-faint">{L('Il titolo greco/latino (xml:lang="grc"/"la") è quello mostrato in elenco.', 'The Greek/Latin title (xml:lang="grc"/"la") is the one shown in lists.', 'Tytuł grecki/łaciński (xml:lang="grc"/"la") jest pokazywany na liście.')}</p>
      </div>
    );
  };

  const PublicationPanel = () => {
    const base = fileName.replace(/\.xml$/, '');
    return (
      <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
        <Field label={L('Nome file (idno)', 'File name (idno)', 'Nazwa pliku (idno)')} hint={L('deve coincidere col file', 'must match the file', 'musi zgadzać się z plikiem')}>
          <div className="flex gap-2">
            <input className="field font-mono" value={m.filename} onChange={(e) => m.idno && setXml(replaceInner(xml, m.idno, escapeText(e.target.value)), 'idno')} />
            {m.filename !== base && (
              <button type="button" className="btn !py-1 !text-xs" onClick={() => m.idno && setXml(replaceInner(xml, m.idno, base))}>
                = {base}
              </button>
            )}
          </div>
        </Field>
        <Field label={L('Anno / data (date@when)', 'Year / date (date@when)', 'Rok / data (date@when)')}>
          <input className="field font-mono" value={m.date?.attrs.when || ''} onChange={(e) => m.date && setXml(setAttr(xml, m.date, 'when', e.target.value), 'date')} />
        </Field>
        <Field label={L('Lingua del documento (TEI@xml:lang)', 'Document language (TEI@xml:lang)', 'Język dokumentu (TEI@xml:lang)')}>
          <input className="field font-mono" value={m.docLang} onChange={(e) => setXml(setAttr(xml, m.root, 'xml:lang', e.target.value), 'doclang')} />
        </Field>
        <div className="space-y-1 text-sm text-muted sm:col-span-2">
          <p>
            <span className="label !inline">{L('Editore', 'Publisher', 'Wydawca')}</span> {m.publisher ? plain(inner(xml, m.publisher)) : '—'}
          </p>
          <p>
            <span className="label !inline">{L('Licenza', 'Licence', 'Licencja')}</span> {m.licence ? plain(inner(xml, m.licence)) : '—'}
          </p>
          <p className="text-xs text-faint">{L('Editore e licenza sono fissi per il progetto LARES.', 'Publisher and licence are fixed for the LARES project.', 'Wydawca i licencja są stałe dla projektu LARES.')}</p>
        </div>
      </div>
    );
  };

  const SourcePanel = () =>
    m.sourceDesc ? (
      <div className="space-y-2">
        <p className="text-sm text-muted">{L('Di solito: «Born digital document.» oppure il rimando alla banca dati di origine.', 'Usually: “Born digital document.” or a pointer to the source database.', 'Zwykle: „Born digital document.” albo odesłanie do bazy źródłowej.')}</p>
        <RawXmlField lang={lang} value={inner(xml, m.sourceDesc).trim()} onApply={(v) => setXml(replaceInner(xml, m.sourceDesc!, `\n${indentOf(xml, m.sourceDesc!)}${unit}${v.trim()}\n${indentOf(xml, m.sourceDesc!)}`))} />
      </div>
    ) : (
      <p className="text-muted">{L('Il file non ha <sourceDesc>.', 'The file has no <sourceDesc>.', 'Plik nie ma <sourceDesc>.')}</p>
    );

  const RevisionsPanel = () => (
    <div className="space-y-4">
      <table className="booktabs-table">
        <thead>
          <tr>
            <th>{L('Data', 'Date', 'Data')}</th>
            <th>{L('Chi', 'Who', 'Kto')}</th>
            <th>{L('Intervento', 'Change', 'Zmiana')}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {m.changes.map((c, i) => (
            <tr key={i}>
              <td className="w-40">
                <input className="field !py-1 font-mono !text-xs" value={c.when} onChange={(e) => setXml(setAttr(xml, c.node, 'when', e.target.value), `ch-when-${i}`)} />
              </td>
              <td className="w-48">
                <input className="field !py-1 !text-sm" value={c.who} onChange={(e) => setXml(setAttr(xml, c.node, 'who', e.target.value), `ch-who-${i}`)} />
              </td>
              <td>
                <input className="field !py-1 !text-sm" value={plain(c.text)} onChange={(e) => setXml(replaceInner(xml, c.node, escapeText(e.target.value)), `ch-text-${i}`)} />
              </td>
              <td className="w-10 text-right">
                <button type="button" className="text-faint hover:text-danger" onClick={() => setXml(removeNode(xml, c.node))}>
                  ×
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" className="chip" onClick={() => setXml(addChange(xml, m, { when: today, who: revWho || '', text: 'revised contents' }))}>
        + {L('Revisione', 'Revision', 'Rewizja')}
      </button>
      <p className="text-xs text-faint">{L('In alternativa, compila la nota di revisione nella barra in alto: viene aggiunta al salvataggio.', 'Alternatively, fill in the revision note in the top bar: it is added on save.', 'Możesz też wpisać notatkę o zmianie w górnym pasku: zostanie dodana przy zapisie.')}</p>
    </div>
  );

  const EditionPanel = (edLang: string) => {
    const eds = m.editions.filter((e) => e.lang === edLang);
    return (
      <div className="space-y-10">
        {eds.map((ed, ei) => (
          <section key={ei} className="space-y-6">
            {eds.length > 1 && (
              <p className="eyebrow">
                {L('Blocco edizione', 'Edition block', 'Blok edycji')} {ei + 1}/{eds.length}
                <span className="ml-2 normal-case tracking-normal text-faint">{L('(il file ripete <div type="edition"> per la stessa lingua)', '(the file repeats <div type="edition"> for this language)', '(plik powtarza <div type="edition"> dla tego języka)')}</span>
              </p>
            )}
            {ed.textparts.map((tp, ti) => {
              const prev = ed.textparts[ti - 1];
              const next = ed.textparts[ti + 1];
              return (
                <article key={`${ei}-${ti}`} className="card space-y-4 p-5">
                  <div className="flex flex-wrap items-end gap-3">
                    <Field label={L('Titolo della sezione (head)', 'Section heading (head)', 'Nagłówek sekcji (head)')} className="min-w-[14rem] flex-1">
                      <input className="field !text-lg" value={tp.head ? inner(xml, tp.head) : ''} placeholder={L('(senza titolo)', '(untitled)', '(bez tytułu)')} onChange={(e) => setXml(setHead(xml, tp, e.target.value), `head-${edLang}-${ei}-${ti}`)} />
                    </Field>
                    <Field label="@n" hint={L('identificativo', 'identifier', 'identyfikator')} className="w-56">
                      <input className="field font-mono !text-sm" value={tp.n} onChange={(e) => setXml(setAttr(xml, tp.node, 'n', e.target.value), `n-${edLang}-${ei}-${ti}`)} />
                    </Field>
                    <div className="flex gap-1 pb-1">
                      <button type="button" className="btn !px-2 !py-1" disabled={!prev} title={L('Sposta su', 'Move up', 'W górę')} onClick={() => prev && setXml(swapSiblings(xml, prev.node, tp.node))}>
                        ↑
                      </button>
                      <button type="button" className="btn !px-2 !py-1" disabled={!next} title={L('Sposta giù', 'Move down', 'W dół')} onClick={() => next && setXml(swapSiblings(xml, tp.node, next.node))}>
                        ↓
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger !px-2 !py-1"
                        title={L('Elimina sezione', 'Delete section', 'Usuń sekcję')}
                        onClick={() => window.confirm(L('Eliminare questa sezione con tutto il suo testo?', 'Delete this section and all its text?', 'Usunąć tę sekcję wraz z tekstem?')) && setXml(removeNode(xml, tp.node))}
                      >
                        ×
                      </button>
                    </div>
                  </div>
                  <InlineMarkupEditor
                    key={`${edLang}-${ei}-${ti}`}
                    lang={lang}
                    suggestions={suggestions}
                    value={xml.slice(tp.contentStart, tp.contentEnd)}
                    onChange={(content) => setXml(setContent(xml, tp, content), `content-${edLang}-${ei}-${ti}`)}
                  />
                  <button type="button" className="chip" onClick={() => setXml(insertAfter(xml, tp.node, textpartBlock('', '', unit)))}>
                    + {L('Sezione qui sotto', 'Section below', 'Sekcja poniżej')}
                  </button>
                </article>
              );
            })}
            {ed.textparts.length === 0 && (
              <button type="button" className="chip" onClick={() => setXml(splice(xml, ed.node.openEnd, ed.node.openEnd, `\n${indentOf(xml, ed.node)}${unit}${textpartBlock('', '', unit).split('\n').join(`\n${indentOf(xml, ed.node)}${unit}`)}`))}>
                + {L('Sezione', 'Section', 'Sekcja')}
              </button>
            )}
            {ed.loose.length > 0 && (
              <div className="space-y-2">
                <p className="eyebrow">{L('Contenuto fuori dai textpart', 'Content outside textparts', 'Treść poza textpart')}</p>
                {ed.loose.map((n, i) => (
                  <RawXmlField key={i} lang={lang} value={outer(xml, n)} onApply={(v) => setXml(splice(xml, n.openStart, n.closeEnd, v))} />
                ))}
              </div>
            )}
          </section>
        ))}
      </div>
    );
  };

  const BibliographyPanel = () => (
    <div className="space-y-8">
      {m.bibliographies.map((b, bi) => {
        const ind = b.items[0] ? indentOf(xml, b.items[0]) : indentOf(xml, b.node) + unit;
        const sortItems = () => {
          const sorted = [...b.items].sort((x, y) => plain(inner(xml, x)).localeCompare(plain(inner(xml, y)), 'en', { sensitivity: 'base' }));
          const first = b.items[0], last = b.items[b.items.length - 1];
          setXml(splice(xml, first.openStart, last.closeEnd, sorted.map((n) => outer(xml, n)).join(`\n${ind}`)));
        };
        return (
          <section key={bi} className="space-y-3">
            <div className="flex flex-wrap items-end gap-3">
              <p className="eyebrow flex-1">
                {b.form === 'div' ? '<div type="bibliography">' : '<div type="textpart" subtype="bibliography">'}
                {b.subtype && <span className="ml-2 normal-case">· {b.subtype}</span>}
              </p>
              {b.form === 'div' && (
                <Field label="@subtype" className="w-48">
                  <input className="field !py-1 font-mono !text-xs" value={b.subtype} list="sec-bib-sub" onChange={(e) => setXml(setAttr(xml, b.node, 'subtype', e.target.value), `bib-sub-${bi}`)} />
                </Field>
              )}
              <button type="button" className="btn !py-1 !text-xs" disabled={b.items.length < 2} onClick={sortItems}>
                A→Z
              </button>
            </div>
            <ol className="space-y-2">
              {b.items.map((it, ii) => (
                <li key={ii} className="flex items-start gap-2">
                  <span className="w-6 pt-2 text-right font-mono text-xs text-faint">{ii + 1}</span>
                  <div className="flex-1">
                    {it.name === 'p' || it.name === 'bibl' ? (
                      <BibItem value={inner(xml, it)} onApply={(v) => setXml(replaceInner(xml, it, v))} lang={lang} />
                    ) : (
                      <RawXmlField lang={lang} rows={3} value={outer(xml, it)} onApply={(v) => setXml(splice(xml, it.openStart, it.closeEnd, v))} />
                    )}
                  </div>
                  <button type="button" className="pt-2 text-faint hover:text-danger" onClick={() => setXml(removeNode(xml, it))}>
                    ×
                  </button>
                </li>
              ))}
            </ol>
            <button type="button" className="chip" onClick={() => setXml(addBibItem(xml, b, L('Autore, N., anno, Titolo, luogo.', 'Author, N., year, Title, place.', 'Autor, N., rok, Tytuł, miejsce.'), unit))}>
              + {L('Riferimento', 'Reference', 'Pozycja')}
            </button>
          </section>
        );
      })}
      <datalist id="sec-bib-sub">
        <option value="studies" />
        <option value="sitography" />
        <option value="editions" />
      </datalist>
      {m.bibliographies.length === 0 && (
        <button type="button" className="btn" onClick={() => setXml(addBibliography(xml, m))}>
          + {L('Crea la bibliografia', 'Create the bibliography', 'Utwórz bibliografię')}
        </button>
      )}
    </div>
  );

  const OthersPanel = () => (
    <div className="space-y-4">
      {m.others.map((n: XNode, i) => (
        <div key={i} className="space-y-1">
          <p className="font-mono text-xs text-faint">
            &lt;{n.name}
            {Object.entries(n.attrs)
              .map(([k, v]) => ` ${k}="${v}"`)
              .join('')}
            &gt;
          </p>
          <RawXmlField lang={lang} rows={8} value={outer(xml, n)} onApply={(v) => setXml(splice(xml, n.openStart, n.closeEnd, v))} />
        </div>
      ))}
    </div>
  );

  const ChecksPanel = () =>
    issues.length === 0 ? (
      <p className="text-ok">{L('Nessun problema: la scheda è valida.', 'No problems: the entry is valid.', 'Brak problemów: hasło jest poprawne.')}</p>
    ) : (
      <ul className="space-y-2">
        {issues.map((i, k) => (
          <li key={k} className={`rounded-lg border px-3 py-2 text-sm ${i.level === 'error' ? 'border-danger/40 bg-danger/5' : 'border-warn/40 bg-warn/5'}`}>
            <span className={`mr-2 font-semibold ${i.level === 'error' ? 'text-danger' : 'text-warn'}`}>{i.level === 'error' ? L('Errore', 'Error', 'Błąd') : L('Avviso', 'Warning', 'Ostrzeżenie')}</span>
            {i.message}
            {i.snippet && <code className="mt-1 block truncate font-mono text-xs text-faint">{i.snippet}</code>}
          </li>
        ))}
      </ul>
    );

  const IndicesPanel = () => {
    if (!parsed) return <p className="text-muted">—</p>;
    const d = parsed.indexedData;
    const groups: Array<[string, Array<{ label: string; detail?: string }>]> = [
      [L('Fonti antiche', 'Ancient sources', 'Źródła starożytne'), d.sources.map((s) => ({ label: s.text, detail: s.type }))],
      [L('Ambiti', 'Realms', 'Dziedziny'), d.realms.map((r) => ({ label: r.text, detail: [r.type, r.subtype].filter(Boolean).join(' · ') }))],
      [L('Termini', 'Terms', 'Terminy'), d.terms.map((x) => ({ label: x.text, detail: x.lemma }))],
      [L('Personaggi', 'Characters', 'Postacie'), d.characters.map((c) => ({ label: c.name, detail: `${c.type} · ${c.key}` }))],
      [L('Figure storiche', 'Historical figures', 'Postacie historyczne'), d.historicalFigures.map((h) => ({ label: h.name, detail: h.key }))],
      [L('Luoghi', 'Places', 'Miejsca'), d.places.map((p) => ({ label: p.name, detail: p.key }))],
      [L('Rimandi', 'Cross-references', 'Odsyłacze'), d.crossLinks.map((l) => ({ label: l.text, detail: l.corresp }))],
    ];
    return (
      <div className="grid gap-6 md:grid-cols-2">
        {groups.map(([title, items]) => (
          <div key={title}>
            <p className="eyebrow mb-1">
              {title} <span className="text-faint">({items.length})</span>
            </p>
            <ul className="max-h-64 space-y-0.5 overflow-y-auto text-sm">
              {items.map((it, i) => (
                <li key={i} className="flex justify-between gap-3 border-b border-line/60 py-0.5">
                  <span className="truncate">{it.label}</span>
                  <span className="shrink-0 font-mono text-xs text-faint">{it.detail}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    );
  };

  const missingLangs = ['it', 'en', 'pl'].filter((l) => !m.editions.some((e) => e.lang === l));
  const renderPanel = () => {
    if (!current) return null;
    if (current.id === 'titles') return TitlesPanel();
    if (current.id === 'publication') return PublicationPanel();
    if (current.id === 'source') return SourcePanel();
    if (current.id === 'revisions') return RevisionsPanel();
    if (current.id.startsWith('ed:')) return EditionPanel(current.id.slice(3));
    if (current.id === 'bibliography') return BibliographyPanel();
    if (current.id === 'others') return OthersPanel();
    if (current.id === 'checks') return ChecksPanel();
    if (current.id === 'indices') return IndicesPanel();
    return <pre className="xml-editor max-h-[70vh] overflow-auto whitespace-pre-wrap rounded-lg border border-line p-3 font-mono text-xs">{xml}</pre>;
  };

  const GROUP_LABEL: Record<Group, string> = {
    header: L('Intestazione', 'Header', 'Nagłówek'),
    text: L('Testo', 'Text', 'Tekst'),
    apparatus: L('Apparato', 'Apparatus', 'Aparat'),
    check: L('Verifica', 'Review', 'Weryfikacja'),
  };

  return (
    <div className="space-y-4">
      {/* Barra azioni */}
      <div className="flex flex-wrap items-center gap-3 border-b border-line pb-4">
        <a href="#/editor" className="text-sm text-muted hover:text-brand" onClick={(e) => dirty && !window.confirm(L('Ci sono modifiche non salvate. Uscire comunque?', 'You have unsaved changes. Leave anyway?', 'Masz niezapisane zmiany. Wyjść mimo to?')) && e.preventDefault()}>
          ← {L('Tutte le schede', 'All entries', 'Wszystkie hasła')}
        </a>
        <div className="min-w-[14rem] flex-1">
          <h1 className="truncate font-serif text-3xl font-medium">{plain(m.titles[0]?.text || '') || fileName}</h1>
          <p className="font-mono text-xs text-faint">
            {fileName} · <span className={dirty ? 'text-warn' : 'text-ok'}>{dirty ? (STATIC_SITE ? L('Bozza in questo browser, non pubblicata', 'Draft in this browser, not published', 'Szkic w tej przeglądarce, nieopublikowany') : L('Modifiche non salvate', 'Unsaved changes', 'Niezapisane zmiany')) : L('Tutto salvato', 'All saved', 'Wszystko zapisane')}</span>
            {changedSections.length > 0 && <> · {changedSections.map((s) => s.label).join(', ')}</>}
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button type="button" className="btn !px-2.5" title={L('Annulla (⌘Z)', 'Undo (⌘Z)', 'Cofnij (⌘Z)')} disabled={!history.current.past.length} onClick={undo}>
            ↶
          </button>
          <button type="button" className="btn !px-2.5" title={L('Ripeti (⇧⌘Z)', 'Redo (⇧⌘Z)', 'Ponów (⇧⌘Z)')} disabled={!history.current.future.length} onClick={redo}>
            ↷
          </button>
          <input className="field !w-28 !py-1.5 !text-xs" value={revWho} onChange={(e) => setRevWho(e.target.value)} placeholder={L('Sigla', 'Initials', 'Inicjały')} aria-label={L('Sigla', 'Initials', 'Inicjały')} />
          <input className="field !w-56 !py-1.5 !text-xs" value={revNote} onChange={(e) => setRevNote(e.target.value)} placeholder={L('Nota di revisione (facoltativa)', 'Revision note (optional)', 'Notatka o zmianie (opcjonalna)')} aria-label="revision note" />
          {!STATIC_SITE && (
            <a className="btn" href={`#/editor/edit/${entryIdFromFileName(fileName)}`} title={L('Editor XML completo (salva prima)', 'Full XML editor (save first)', 'Pełny edytor XML (najpierw zapisz)')}>
              XML
            </a>
          )}
          <button type="button" className="btn" onClick={() => downloadFile(xml, fileName, 'application/xml')}>
            {L('Scarica', 'Download', 'Pobierz')}
          </button>
          <button type="button" className="btn" disabled={!dirty} onClick={() => window.confirm(L('Annullare tutte le modifiche non salvate?', 'Discard all unsaved changes?', 'Odrzucić wszystkie niezapisane zmiany?')) && setXml(baseline)}>
            {L('Ripristina', 'Revert', 'Przywróć')}
          </button>
          <button type="button" className="btn btn-primary" onClick={handleSave} disabled={saving || (!dirty && !revNote.trim())}>
            {saving ? L('Salvataggio…', 'Saving…', 'Zapisywanie…') : STATIC_SITE ? L('Pubblica su GitHub', 'Publish to GitHub', 'Opublikuj na GitHubie') : L('Salva', 'Save', 'Zapisz')}
            {errorCount > 0 && !saving && <span className="rounded bg-danger px-1.5 text-[0.625rem] text-white">{errorCount}</span>}
          </button>
        </div>
      </div>

      {banner && (
        <div role="status" className={`rounded-xl border px-4 py-2.5 text-sm ${banner.kind === 'ok' ? 'border-ok/40 bg-ok/10 text-ok' : banner.kind === 'warn' ? 'border-warn/40 bg-warn/10 text-warn' : 'border-danger/40 bg-danger/10 text-danger'}`}>
          {banner.text}
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-[14rem_minmax(0,1fr)]">
        {/* Sezioni */}
        <nav className="space-y-5 lg:sticky lg:top-4 lg:self-start" aria-label={L('Sezioni', 'Sections', 'Sekcje')}>
          {(['header', 'text', 'apparatus', 'check'] as Group[]).map((g) => (
            <div key={g}>
              <p className="eyebrow mb-1 px-2">{GROUP_LABEL[g]}</p>
              {sections
                .filter((s) => s.group === g)
                .map((s) => (
                  <button key={s.id} type="button" className="sec-nav-item" aria-current={current?.id === s.id} onClick={() => setActive(s.id)} title={s.desc}>
                    <span className="sec-dot" data-state={s.state} />
                    <span className="flex-1 truncate">{s.label}</span>
                    {!!s.badge && <span className="font-mono text-[0.65rem] text-faint">{s.badge}</span>}
                  </button>
                ))}
              {g === 'text' && missingLangs.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1 px-2">
                  {missingLangs.map((l) => (
                    <button
                      key={l}
                      type="button"
                      className="chip !py-0.5 !text-xs"
                      onClick={() => {
                        setXml(addEdition(xml, m, l));
                        setActive(`ed:${l}`);
                      }}
                    >
                      + {l.toUpperCase()}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
          <p className="px-2 text-[0.7rem] leading-snug text-faint">
            <span className="sec-dot mr-1 inline-block" data-state="modified" /> {L('modificata', 'modified', 'zmieniona')} · <span className="sec-dot mr-1 inline-block" data-state="present" /> {L('presente', 'present', 'obecna')} · <span className="sec-dot mr-1 inline-block" /> {L('vuota', 'empty', 'pusta')}
          </p>
        </nav>

        {/* Pannello */}
        <main className="min-w-0">
          {current && (
            <SectionHeader title={current.label} desc={current.desc}>
              {current.id.startsWith('ed:') && (
                <button
                  type="button"
                  className="btn btn-danger !py-1 !text-xs"
                  onClick={() => {
                    const l = current.id.slice(3);
                    if (!window.confirm(L(`Eliminare l’intera edizione ${l.toUpperCase()}?`, `Delete the whole ${l.toUpperCase()} edition?`, `Usunąć całą edycję ${l.toUpperCase()}?`))) return;
                    let out = xml;
                    // dal fondo, così gli offset restano validi
                    [...m.editions.filter((e) => e.lang === l)].reverse().forEach((e) => (out = removeNode(out, e.node)));
                    setXml(out);
                    setActive('titles');
                  }}
                >
                  {L('Elimina edizione', 'Delete edition', 'Usuń edycję')}
                </button>
              )}
            </SectionHeader>
          )}
          {renderPanel()}
        </main>
      </div>
    </div>
  );
};

/** Voce bibliografica: campo di testo che accetta anche markup inline (<title>, <hi>…). */
const BibItem: React.FC<{ value: string; onApply: (v: string) => void; lang: Language }> = ({ value, onApply, lang }) => {
  const [draft, setDraft] = useState(value);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => setDraft(value), [value]);
  return (
    <div>
      <textarea
        className="field w-full !text-sm"
        rows={Math.min(5, Math.max(2, Math.ceil(draft.length / 80)))}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft === value) return;
          try {
            tokenize(draft);
            setErr(null);
            onApply(draft);
          } catch (e) {
            setErr((e as Error).message);
          }
        }}
      />
      {err && <p className="text-xs text-danger">{tr(lang, 'XML non valido', 'Invalid XML', 'Nieprawidłowy XML')}: {err}</p>}
    </div>
  );
};
