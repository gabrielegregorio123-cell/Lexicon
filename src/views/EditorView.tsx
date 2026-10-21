import React, { useEffect, useMemo, useState } from 'react';
import { tr } from '../i18n/translations.ts';
import type { Language } from '../i18n/translations.ts';
import type { LexiconEntry } from '../types/lexicon.ts';
import {
  ApiError,
  deleteEntry,
  fetchStatus,
  getToken,
  pullFromGithub,
  pushAll,
  setToken,
  verifyToken,
  type ServerStatus,
} from '../lib/editorApi.ts';
import { EDITION_LANGS, ENTRY_KINDS, buildEntryTemplate, fileNameFor, type EditionLang, type EntryKind } from '../lib/entryTemplate.ts';
import { EntryEditor } from '../components/EntryEditor.tsx';
import { useRawXml } from '../utils/entryBody.ts';

interface Props {
  entries: LexiconEntry[];
  lang: Language;
  sub: string;
  param: string;
  onSaved: () => Promise<void> | void;
}

const T = {
  it: {
    eyebrow: 'Area editoriale',
    title: 'Editor delle schede',
    lead: 'Crea nuove schede e modifica quelle esistenti. Ogni salvataggio aggiorna l’XML nel repository.',
    checking: 'Connessione al server…',
    offlineTitle: 'Server non raggiungibile',
    offlineText: 'L’editor funziona solo con il server dell’applicazione (npm run dev / npm start). Il sito statico è in sola lettura.',
    readOnlyTitle: 'Modifica disattivata',
    readOnlyText: 'Il server è in produzione senza EDITOR_TOKEN: imposta la variabile d’ambiente per abilitare l’editor.',
    loginTitle: 'Accesso redattori',
    loginText: 'Inserisci il token editoriale.',
    token: 'Token',
    enter: 'Entra',
    wrong: 'Token non valido.',
    logout: 'Esci',
    newEntry: 'Nuova scheda',
    search: 'Filtra per titolo, lemma o autore…',
    colTitle: 'Scheda',
    colColl: 'Collezione',
    colAuthor: 'Autore',
    colMarks: 'Marcature',
    edit: 'Modifica',
    del: 'Elimina',
    confirmDel: (f: string) => `Eliminare definitivamente "${f}"? L’operazione crea un commit di rimozione e non si annulla da qui.`,
    deleted: 'Scheda eliminata.',
    gitTitle: 'Repository GitHub',
    gitOn: 'Ogni salvataggio diventa un commit su',
    gitOff: 'Non configurato: le schede vengono salvate solo sul disco del server. Imposta GITHUB_REPO (e GITHUB_TOKEN per scrivere).',
    gitPush: 'Pubblica tutte le schede',
    gitPull: 'Sincronizza da GitHub',
    gitReadOnly: 'Sola lettura (manca GITHUB_TOKEN) da',
    gitPulled: (c: number, r: number) => `Sincronizzato: ${c} file aggiornati, ${r} rimossi.`,
    gitPushing: 'Pubblicazione…',
    gitPushed: 'Tutte le schede sono state pubblicate in un unico commit.',
    wizardTitle: 'Nuova scheda',
    wizardLead: 'Compila i dati di base: il modello XML viene generato e potrai subito marcare il testo.',
    kind: 'Tipo di documento',
    editions: 'Edizioni (lingue del testo)',
    entryTitle: 'Titolo',
    author: 'Autore',
    date: 'Data',
    fileName: 'Nome file',
    exists: 'Esiste già una scheda con questo nome file.',
    create: 'Crea e apri nell’editor',
    cancel: 'Annulla',
    notFound: 'Scheda non trovata.',
    count: (n: number) => `${n} schede`,
  },
  en: {
    eyebrow: 'Editorial area',
    title: 'Entry editor',
    lead: 'Create new entries and edit existing ones. Every save updates the XML in the repository.',
    checking: 'Connecting to the server…',
    offlineTitle: 'Server unreachable',
    offlineText: 'The editor only works with the application server (npm run dev / npm start). The static site is read-only.',
    readOnlyTitle: 'Editing disabled',
    readOnlyText: 'The server runs in production without EDITOR_TOKEN: set the environment variable to enable the editor.',
    loginTitle: 'Editors sign-in',
    loginText: 'Enter the editorial token.',
    token: 'Token',
    enter: 'Enter',
    wrong: 'Invalid token.',
    logout: 'Sign out',
    newEntry: 'New entry',
    search: 'Filter by title, lemma or author…',
    colTitle: 'Entry',
    colColl: 'Collection',
    colAuthor: 'Author',
    colMarks: 'Markup',
    edit: 'Edit',
    del: 'Delete',
    confirmDel: (f: string) => `Permanently delete "${f}"? This creates a removal commit and cannot be undone from here.`,
    deleted: 'Entry deleted.',
    gitTitle: 'GitHub repository',
    gitOn: 'Every save becomes a commit on',
    gitOff: 'Not configured: entries are saved on the server disk only. Set GITHUB_REPO (and GITHUB_TOKEN to write).',
    gitPush: 'Publish all entries',
    gitPull: 'Sync from GitHub',
    gitReadOnly: 'Read-only (GITHUB_TOKEN missing) from',
    gitPulled: (c: number, r: number) => `Synced: ${c} files updated, ${r} removed.`,
    gitPushing: 'Publishing…',
    gitPushed: 'All entries were published in a single commit.',
    wizardTitle: 'New entry',
    wizardLead: 'Fill in the basics: the XML skeleton is generated and you can start marking up the text right away.',
    kind: 'Document type',
    editions: 'Editions (text languages)',
    entryTitle: 'Title',
    author: 'Author',
    date: 'Date',
    fileName: 'File name',
    exists: 'An entry with this file name already exists.',
    create: 'Create and open in editor',
    cancel: 'Cancel',
    notFound: 'Entry not found.',
    count: (n: number) => `${n} entries`,
  },
  pl: {
    eyebrow: 'Strefa redakcyjna',
    title: 'Edytor haseł',
    lead: 'Twórz nowe hasła i edytuj istniejące. Każdy zapis aktualizuje plik XML w repozytorium.',
    checking: 'Łączenie z serwerem…',
    offlineTitle: 'Serwer niedostępny',
    offlineText: 'Edytor działa tylko z serwerem aplikacji (npm run dev / npm start). Strona statyczna jest tylko do odczytu.',
    readOnlyTitle: 'Edycja wyłączona',
    readOnlyText: 'Serwer działa w trybie produkcyjnym bez EDITOR_TOKEN: ustaw zmienną środowiskową, aby włączyć edytor.',
    loginTitle: 'Logowanie redaktorów',
    loginText: 'Wpisz token redakcyjny.',
    token: 'Token',
    enter: 'Wejdź',
    wrong: 'Nieprawidłowy token.',
    logout: 'Wyloguj',
    newEntry: 'Nowe hasło',
    search: 'Filtruj według tytułu, lematu lub autora…',
    colTitle: 'Hasło',
    colColl: 'Kolekcja',
    colAuthor: 'Autor',
    colMarks: 'Znakowanie',
    edit: 'Edytuj',
    del: 'Usuń',
    confirmDel: (f: string) => `Usunąć na stałe „${f}”? Powstanie commit usuwający plik, którego nie da się cofnąć stąd.`,
    deleted: 'Hasło usunięte.',
    gitTitle: 'Repozytorium GitHub',
    gitOn: 'Każdy zapis staje się commitem w',
    gitOff: 'Nie skonfigurowano: hasła zapisują się tylko na dysku serwera. Ustaw GITHUB_REPO (i GITHUB_TOKEN, aby zapisywać).',
    gitPush: 'Opublikuj wszystkie hasła',
    gitPull: 'Synchronizuj z GitHubem',
    gitReadOnly: 'Tylko odczyt (brak GITHUB_TOKEN) z',
    gitPulled: (c: number, r: number) => `Zsynchronizowano: zaktualizowano ${c} plików, usunięto ${r}.`,
    gitPushing: 'Publikowanie…',
    gitPushed: 'Wszystkie hasła opublikowano w jednym commicie.',
    wizardTitle: 'Nowe hasło',
    wizardLead: 'Wypełnij podstawowe dane: szkielet XML zostanie wygenerowany i od razu możesz zacząć oznaczać tekst.',
    kind: 'Typ dokumentu',
    editions: 'Edycje (języki tekstu)',
    entryTitle: 'Tytuł',
    author: 'Autor',
    date: 'Data',
    fileName: 'Nazwa pliku',
    exists: 'Hasło o tej nazwie pliku już istnieje.',
    create: 'Utwórz i otwórz w edytorze',
    cancel: 'Anuluj',
    notFound: 'Nie znaleziono hasła.',
    count: (n: number) => `${n} haseł`,
  },
} as const;

function lsGet(key: string, fallback = ''): string {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}

// ── Session gate ──────────────────────────────────────────────────────────────

type Gate = { state: 'checking' } | { state: 'offline' } | { state: 'readonly' } | { state: 'login'; error?: string } | { state: 'ready'; status: ServerStatus };

function useEditorGate(): [Gate, (token: string) => Promise<void>, () => void] {
  const [gate, setGate] = useState<Gate>({ state: 'checking' });

  const check = async () => {
    try {
      const status = await fetchStatus();
      if (!status.editingEnabled) return setGate({ state: 'readonly' });
      if (!status.authRequired) return setGate({ state: 'ready', status });
      if (!getToken()) return setGate({ state: 'login' });
      await verifyToken();
      setGate({ state: 'ready', status });
    } catch (e) {
      const err = e as ApiError;
      if (err.status === 401) {
        setToken('');
        setGate({ state: 'login' });
      } else {
        setGate({ state: 'offline' });
      }
    }
  };

  useEffect(() => {
    void check();
  }, []);

  const login = async (token: string) => {
    setToken(token.trim());
    try {
      await verifyToken();
      await check();
    } catch {
      setToken('');
      setGate({ state: 'login', error: 'wrong' });
    }
  };

  const logout = () => {
    setToken('');
    setGate({ state: 'login' });
  };

  return [gate, login, logout];
}

// ── Pieces ────────────────────────────────────────────────────────────────────

const Notice: React.FC<{ title: string; text: string }> = ({ title, text }) => (
  <div className="card mx-auto max-w-lg space-y-2 p-6">
    <h2 className="font-serif text-2xl font-medium">{title}</h2>
    <p className="text-sm text-muted">{text}</p>
  </div>
);

const Login: React.FC<{ lang: Language; error?: string; onLogin: (t: string) => Promise<void> }> = ({ lang, error, onLogin }) => {
  const t = T[lang];
  const [value, setValue] = useState('');
  return (
    <div className="mx-auto flex max-w-sm flex-col items-center gap-9 py-4 text-center">
      <img src="/brand/emblem.webp" alt="" width={720} height={914} className="emblem h-60 w-auto select-none" draggable={false} />
      <div className="space-y-2">
        <p className="eyebrow">{t.eyebrow}</p>
        <h1 className="text-4xl font-medium leading-tight">{t.loginTitle}</h1>
        <p className="text-lg italic text-muted">{t.loginText}</p>
      </div>
      <form
        className="w-full space-y-5 text-left"
        onSubmit={(e) => {
          e.preventDefault();
          void onLogin(value);
        }}
      >
        <label className="block">
          <span className="label">{t.token}</span>
          <input type="password" className="field" value={value} onChange={(e) => setValue(e.target.value)} autoFocus autoComplete="current-password" />
        </label>
        {error && (
          <p role="alert" className="text-danger">
            {t.wrong}
          </p>
        )}
        <button type="submit" className="btn btn-primary w-full justify-center !py-3" disabled={!value.trim()}>
          {t.enter}
        </button>
      </form>
    </div>
  );
};

const GithubPanel: React.FC<{ lang: Language; status: ServerStatus; onReload: () => Promise<void> | void }> = ({ lang, status, onReload }) => {
  const t = T[lang];
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const g = status.github;

  const pull = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await pullFromGithub();
      await onReload();
      setMsg({ ok: true, text: t.gitPulled(r.changed.length, r.removed.length) });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const publish = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await pushAll();
      setMsg(res.ok ? { ok: true, text: t.gitPushed } : { ok: false, text: res.github.status === 'failed' ? res.github.error : 'Errore' });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card flex flex-wrap items-center gap-3 p-4 text-sm">
      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${g.configured ? 'bg-ok' : 'bg-faint'}`} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-medium">{t.gitTitle}</p>
        <p className="text-muted">
          {g.configured ? (
            <>
              {g.canWrite ? t.gitOn : t.gitReadOnly} <code className="font-mono text-xs">{g.repo}@{g.branch}/{g.dataPath}</code>
            </>
          ) : (
            t.gitOff
          )}
        </p>
        {msg && <p className={msg.ok ? 'text-ok' : 'text-danger'}>{msg.text}</p>}
      </div>
      {g.configured && (
        <div className="flex gap-2">
          <button type="button" className="btn" onClick={pull} disabled={busy}>
            {t.gitPull}
          </button>
          {g.canWrite && (
            <button type="button" className="btn" onClick={publish} disabled={busy}>
              {busy ? t.gitPushing : t.gitPush}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

const EntryTable: React.FC<{ lang: Language; entries: LexiconEntry[]; onChanged: () => Promise<void> | void }> = ({ lang, entries, onChanged }) => {
  const t = T[lang];
  const [filter, setFilter] = useState('');
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  const rows = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return [...entries]
      .filter((e) => !q || `${e.title} ${e.lemma} ${e.authors.map((a) => a.name).join(' ')}`.toLowerCase().includes(q))
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [entries, filter]);

  const remove = async (e: LexiconEntry) => {
    if (!window.confirm(t.confirmDel(e.fileName))) return;
    try {
      await deleteEntry(e.fileName);
      setNote({ ok: true, text: t.deleted });
      await onChanged();
    } catch (err) {
      setNote({ ok: false, text: (err as Error).message });
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <input className="field max-w-md" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={t.search} aria-label={t.search} />
        <span className="text-sm text-faint">{t.count(rows.length)}</span>
      </div>
      {note && <p className={`text-sm ${note.ok ? 'text-ok' : 'text-danger'}`}>{note.text}</p>}
      <div className="card overflow-x-auto">
        <table className="booktabs-table">
          <thead>
            <tr>
              <th>{t.colTitle}</th>
              <th>{t.colColl}</th>
              <th className="hidden xl:table-cell">{t.colAuthor}</th>
              <th className="hidden xl:table-cell">{t.colMarks}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => {
              const d = e.indexedData;
              const marks = d.sources.length + d.realms.length + d.terms.length + d.characters.length + d.historicalFigures.length + d.places.length;
              return (
                <tr key={e.fileName}>
                  <td>
                    <a href={`#/entry/${e.id}`} className="text-lg hover:text-brand">
                      {e.title}
                    </a>
                    <div className="font-mono text-xs text-faint">{e.fileName}</div>
                  </td>
                  <td className="text-muted">{e.collection === 'chapter' ? (tr(lang, 'Capitolo', 'Chapter', 'Rozdział')) : 'Lexicon'}</td>
                  <td className="hidden text-muted xl:table-cell">{e.authorShort}</td>
                  <td className="hidden text-muted xl:table-cell">{marks}</td>
                  <td className="whitespace-nowrap text-right">
                    <a href={`#/editor/edit/${e.id}`} className="btn !py-1">
                      {t.edit}
                    </a>{' '}
                    <button type="button" className="btn btn-danger !py-1" onClick={() => remove(e)}>
                      {t.del}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const Wizard: React.FC<{ lang: Language; entries: LexiconEntry[]; onCreate: (fileName: string, xml: string) => void }> = ({ lang, entries, onCreate }) => {
  const t = T[lang];
  const [kind, setKind] = useState<EntryKind>('lexicon');
  const [title, setTitle] = useState('');
  const [langs, setLangs] = useState<EditionLang[]>(['en', 'it']);
  const [author, setAuthor] = useState(() => lsGet('lares_editor_author'));
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));

  const fileName = fileNameFor(kind, title, entries.map((e) => e.fileName));
  const exists = entries.some((e) => e.fileName.toLowerCase() === fileName.toLowerCase());
  const valid = title.trim() && author.trim() && langs.length > 0 && !exists;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    try {
      localStorage.setItem('lares_editor_author', author.trim());
    } catch {
      /* not persisted */
    }
    onCreate(fileName, buildEntryTemplate({ kind, title: title.trim(), fileBase: fileName.replace(/\.xml$/, ''), langs, author: author.trim(), date }));
  };

  return (
    <form onSubmit={submit} className="mx-auto max-w-2xl space-y-8">
      <header className="space-y-3">
        <h1 className="page-title">{t.wizardTitle}</h1>
        <p className="pt-2 text-xl italic text-muted">{t.wizardLead}</p>
      </header>
      <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className="label">{t.kind}</span>
          <select className="field" value={kind} onChange={(e) => setKind(e.target.value as EntryKind)}>
            {ENTRY_KINDS.map((k) => (
              <option key={k.kind} value={k.kind}>
                {k.label[lang]}
              </option>
            ))}
          </select>
        </label>
        <label className="block sm:col-span-2">
          <span className="label">{t.entryTitle}</span>
          <input className="field !text-lg" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus required />
        </label>
        <div className="sm:col-span-2">
          <span className="label">{t.editions}</span>
          <div className="flex flex-wrap gap-x-6 gap-y-1">
            {EDITION_LANGS.map((l) => (
              <label key={l.code} className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={langs.includes(l.code)}
                  onChange={(e) => setLangs((prev) => (e.target.checked ? [...prev, l.code] : prev.filter((x) => x !== l.code)))}
                  className="accent-[var(--brand)]"
                />
                {l.label}
              </label>
            ))}
          </div>
        </div>
        <label className="block">
          <span className="label">{t.author}</span>
          <input className="field" value={author} onChange={(e) => setAuthor(e.target.value)} required />
        </label>
        <label className="block">
          <span className="label">{t.date}</span>
          <input type="date" className="field" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <div className="sm:col-span-2">
          <span className="label">{t.fileName}</span>
          <p className="border-b border-dashed border-line py-1.5 font-mono text-sm text-muted">{fileName}</p>
        </div>
      </div>
      {exists && <p className="text-danger">{t.exists}</p>}
      <div className="flex gap-3">
        <button type="submit" className="btn btn-primary" disabled={!valid}>
          {t.create}
        </button>
        <a href="#/editor" className="btn">
          {t.cancel}
        </a>
      </div>
    </form>
  );
};

/** The corpus index carries no XML: fetch the source file before opening the editor. */
const EditLoader: React.FC<{ entry: LexiconEntry; lang: Language; entries: LexiconEntry[]; onSaved: () => Promise<void> | void }> = ({ entry, lang, entries, onSaved }) => {
  const raw = useRawXml(entry, true);
  if (raw.error) return <Notice title={T[lang].notFound} text={raw.error} />;
  if (raw.value === null) return <p className="py-24 text-center text-sm text-faint">{T[lang].checking}</p>;
  return <EntryEditor lang={lang} entries={entries} fileName={entry.fileName} initialXml={raw.value} isNew={false} onSaved={onSaved} />;
};

// ── View ──────────────────────────────────────────────────────────────────────

export const EditorView: React.FC<Props> = ({ entries, lang, sub, param, onSaved }) => {
  const t = T[lang];
  const [gate, login, logout] = useEditorGate();
  const [draft, setDraft] = useState<{ fileName: string; xml: string } | null>(null);

  if (gate.state === 'checking') return <p className="py-24 text-center text-sm text-faint">{t.checking}</p>;
  if (gate.state === 'offline') return <Notice title={t.offlineTitle} text={t.offlineText} />;
  if (gate.state === 'readonly') return <Notice title={t.readOnlyTitle} text={t.readOnlyText} />;
  if (gate.state === 'login') return <Login lang={lang} error={gate.error} onLogin={login} />;

  if (sub === 'new') {
    if (draft) {
      return (
        <EntryEditor
          key={draft.fileName}
          lang={lang}
          entries={entries}
          fileName={draft.fileName}
          initialXml={draft.xml}
          isNew
          onSaved={async () => {
            await onSaved();
          }}
        />
      );
    }
    return <Wizard lang={lang} entries={entries} onCreate={(fileName, xml) => setDraft({ fileName, xml })} />;
  }

  if (sub === 'edit') {
    const entry = entries.find((e) => e.id.toLowerCase() === param.toLowerCase());
    if (!entry) return <Notice title={t.notFound} text={param} />;
    return <EditLoader key={entry.fileName} entry={entry} lang={lang} entries={entries} onSaved={onSaved} />;
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl space-y-3">
          <p className="eyebrow">{t.eyebrow}</p>
          <h1 className="page-title">{t.title}</h1>
          <p className="font-serif text-xl text-muted">{t.lead}</p>
        </div>
        <div className="flex gap-2">
          <a href="#/markup" className="btn">
            {tr(lang, 'Guida al markup', 'Markup guide', 'Przewodnik po znakowaniu')}
          </a>
          <a
            href="#/editor/new"
            className="btn btn-primary"
            onClick={() => setDraft(null)}
          >
            + {t.newEntry}
          </a>
          {gate.status.authRequired && (
            <button type="button" className="btn" onClick={logout}>
              {t.logout}
            </button>
          )}
        </div>
      </header>
      <GithubPanel lang={lang} status={gate.status} onReload={onSaved} />
      <EntryTable lang={lang} entries={entries} onChanged={onSaved} />
    </div>
  );
};
