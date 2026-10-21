import React, { useCallback, useEffect, useRef, useState } from 'react';
import { tr } from './i18n/translations.ts';
import { DEFAULT_LANGUAGE, isLanguage, type Language } from './i18n/translations.ts';
import type { LexiconEntry } from './types/lexicon.ts';
import { loadCorpus } from './utils/fileLoader.ts';
import { clearBodyCache } from './utils/entryBody.ts';
import { STATIC_SITE, asset } from './utils/endpoints.ts';
import { exportDatasetAsJSON } from './utils/csvExport.ts';
import { Sidebar } from './components/Sidebar.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { AccessGate } from './components/AccessGate.tsx';
import { GATE_ACTIVE, isUnlocked } from './lib/gate.ts';
import { Footer } from './components/Footer.tsx';
import { HomeView } from './views/HomeView.tsx';
import { LexiconListView } from './views/LexiconListView.tsx';
import { EntryDetailView } from './views/EntryDetailView.tsx';
import { IndicesView, IndexTab } from './views/IndicesView.tsx';
import { SearchView } from './views/SearchView.tsx';
import { TeiPageView } from './views/TeiPageView.tsx';
import { ContactView } from './views/ContactView.tsx';
import { BookChaptersView } from './views/BookChaptersView.tsx';
import { MarkupGuideView } from './views/MarkupGuideView.tsx';
import { EditorView } from './views/EditorView.tsx';

function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function readLang(): Language {
  const saved = readStored('lares_lang');
  return isLanguage(saved) ? saved : DEFAULT_LANGUAGE;
}

function writeStored(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode: preference simply isn't persisted */
  }
}

export default function App() {
  const [currentHash, setCurrentHash] = useState<string>(window.location.hash || '#/');
  const [lang, setLang] = useState<Language>(() => (readLang()));
  const [entries, setEntries] = useState<LexiconEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  useEffect(() => {
    const onHash = () => {
      setCurrentHash(window.location.hash || '#/');
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const [unlocked, setUnlocked] = useState(() => !GATE_ACTIVE || isUnlocked());
  const versionRef = useRef<string | undefined>(undefined);

  const reloadEntries = useCallback(async () => {
    try {
      const { entries: loaded, version } = await loadCorpus();
      versionRef.current = version;
      clearBodyCache();
      setEntries(loaded);
      setLoadError(null);
    } catch (err: any) {
      console.error('Failed to load lexicon entries:', err);
      setLoadError(err?.message || String(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (unlocked) reloadEntries(); // nothing is fetched until the password has been given
  }, [reloadEntries, unlocked]);

  // Pick up changes made elsewhere (another editor's save, a pull from GitHub): a tiny version
  // check when the tab comes back to the foreground and every few minutes; reload only if it differs.
  useEffect(() => {
    if (STATIC_SITE) return; // a static site only changes when it is rebuilt
    const check = async () => {
      try {
        const res = await fetch('/api/corpus/version', { cache: 'no-store' });
        if (!res.ok) return;
        const { version } = (await res.json()) as { version: string };
        if (versionRef.current && version !== versionRef.current) await reloadEntries();
      } catch {
        /* offline or static hosting: nothing to refresh */
      }
    };
    const onVisible = () => document.visibilityState === 'visible' && void check();
    document.addEventListener('visibilitychange', onVisible);
    const timer = setInterval(check, 5 * 60_000);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(timer);
    };
  }, [reloadEntries]);

  const changeLang = (l: Language) => {
    setLang(l);
    writeStored('lares_lang', l);
  };

  const cleanHash = currentHash.replace(/^#\/?/, '');
  const [pathPart, queryPart] = cleanHash.split('?');
  const segments = pathPart.split('/').filter(Boolean).map(decodeURIComponent);
  const params = new URLSearchParams(queryPart || '');
  const route = { main: segments[0] || '', sub: segments[1] || '', third: segments[2] || '', query: params.get('q') || '', spot: params.get('spot') || '' };

  const lexiconCount = entries.filter((e) => (e.collection || 'lexicon') === 'lexicon').length;
  const chapterCount = entries.filter((e) => e.collection === 'chapter').length;

  const renderView = () => {
    if (route.main === 'editor') {
      return <EditorView entries={entries} lang={lang} sub={route.sub} param={route.third} onSaved={reloadEntries} />;
    }
    if (route.main === 'markup') return <MarkupGuideView lang={lang} />;

    if (isLoading) {
      return <div className="py-32 text-center text-sm text-faint">{tr(lang, 'Caricamento del lessico…', 'Loading the lexicon…', 'Wczytywanie leksykonu…')}</div>;
    }
    if (loadError && entries.length === 0) {
      return (
        <div className="card mx-auto my-16 max-w-lg space-y-2 p-6">
          <h2 className="font-serif text-2xl font-semibold">{tr(lang, 'Dati non disponibili', 'Data unavailable', 'Dane niedostępne')}</h2>
          <p className="text-sm text-muted">{loadError}</p>
          <button type="button" className="btn" onClick={reloadEntries}>
            {tr(lang, 'Riprova', 'Retry', 'Spróbuj ponownie')}
          </button>
        </div>
      );
    }

    switch (route.main) {
      case 'lexicon':
        return <LexiconListView entries={entries} lang={lang} />;
      case 'book-chapters':
        return <BookChaptersView entries={entries} lang={lang} volume={route.sub} />;
      case 'entry': {
        const entry = entries.find((e) => e.id.toLowerCase() === route.sub.toLowerCase());
        if (!entry) {
          return (
            <div className="card mx-auto my-16 max-w-lg space-y-3 p-6">
              <h2 className="font-serif text-2xl font-semibold">{tr(lang, 'Scheda non trovata', 'Entry not found', 'Nie znaleziono hasła')}</h2>
              <p className="text-sm text-muted">
                “{route.sub}” {tr(lang, 'non è presente nel lessico.', 'is not present in the lexicon.', 'nie występuje w leksykonie.')}
              </p>
              <a href="#/lexicon" className="btn">
                {tr(lang, 'Torna al lessico', 'Back to the lexicon', 'Wróć do leksykonu')}
              </a>
            </div>
          );
        }
        return (
          <EntryDetailView
            entry={entry}
            lang={lang}
            targetSpotId={route.spot}
            onNavigateEntry={(id) => {
              window.location.hash = `#/entry/${id}`;
            }}
          />
        );
      }
      case 'indices': {
        const tabs: IndexTab[] = ['sources', 'realms', 'terms', 'characters', 'historical', 'places'];
        const tab = tabs.includes(route.sub as IndexTab) ? (route.sub as IndexTab) : 'sources';
        return (
          <IndicesView
            entries={entries}
            lang={lang}
            initialTab={tab}
            onNavigateToSpot={(entryId, spotId) => {
              window.location.hash = `#/entry/${entryId}?spot=${spotId}`;
            }}
          />
        );
      }
      case 'search':
        return <SearchView entries={entries} lang={lang} initialQuery={route.query} />;
      case 'bibliography':
        return (
          <TeiPageView
            lang={lang}
            page="bibliography"
            eyebrow={tr(lang, 'Riferimenti', 'References', 'Odniesienia')}
            title={{ it: 'Bibliografia', en: 'Bibliography', pl: 'Bibliografia' }}
            lead={{ it: 'Abbreviazioni e opere citate nelle schede.', en: 'Abbreviations and works cited across the entries.', pl: 'Skróty i prace cytowane w hasłach.' }}
          />
        );
      case 'contact':
        return <ContactView lang={lang} />;
      case 'team':
        return (
          <TeiPageView
            lang={lang}
            page="team"
            eyebrow="LARES"
            title={{ it: 'Progetto e gruppo', en: 'Project and team', pl: 'Projekt i zespół' }}
          />
        );
      default:
        return <HomeView lang={lang} entries={entries} />;
    }
  };

  const wide = route.main === 'editor';

  if (!unlocked) return <AccessGate lang={lang} onLang={changeLang} onUnlock={() => setUnlocked(true)} />;

  return (
    <div className="min-h-screen bg-transparent text-ink">
      <Sidebar
        currentRoute={currentHash}
        lang={lang}
        onSetLang={changeLang}
        lexiconCount={lexiconCount}
        chapterCount={chapterCount}
      />
      <div className="relative z-[1] flex min-h-screen flex-col lg:pl-[16.5rem] min-[1280px]:pl-[23rem]">
        {/* gold filigree serpent: part of the page, so it scrolls natively (no script, always in step) */}
        <div aria-hidden className="garland" style={{ backgroundImage: `url(${asset('brand/garland-tile.svg')})` }} />
        <main className={`mx-auto w-full flex-1 px-6 py-12 sm:px-10 lg:py-20 ${wide ? 'max-w-none xl:px-14' : 'max-w-4xl'}`}><ErrorBoundary lang={lang} resetKey={currentHash}>{renderView()}</ErrorBoundary></main>
        <Footer lang={lang} entryCount={entries.length} onExportJson={() => exportDatasetAsJSON(entries)} wide={wide} />
      </div>
    </div>
  );
}
