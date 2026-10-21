import React, { useState, useMemo } from 'react';
import type { Language } from '../i18n/translations.ts';
import { translations, tr } from '../i18n/translations.ts';
import type { LexiconEntry } from '../types/lexicon.ts';
import { stripDiacritics } from '../utils/greekNormalizer.ts';

interface LexiconListViewProps {
  entries: LexiconEntry[];
  lang: Language;
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

export const LexiconListView: React.FC<LexiconListViewProps> = ({
  entries,
  lang,
}) => {
  const [filterText, setFilterText] = useState('');
  const [selectedLetter, setSelectedLetter] = useState<string | null>(null);
  const [languageFilter, setLanguageFilter] = useState<string>('all');
  const t = translations[lang];

  // Restrict to the LARES Lexicon collection
  const lexiconOnlyEntries = useMemo(() => {
    return entries.filter(
      (e) => (e.collection || 'lexicon') === 'lexicon'
    );
  }, [entries]);

  // Check rule: "Show the Language filter only if every entry has an explicit value."
  const allEntriesHaveExplicitLang = useMemo(() => {
    return (
      lexiconOnlyEntries.length > 0 &&
      lexiconOnlyEntries.every((e) => Boolean(e.xmlLang && e.xmlLang.trim()))
    );
  }, [lexiconOnlyEntries]);

  // Available explicit languages
  const availableLanguages = useMemo(() => {
    if (!allEntriesHaveExplicitLang) return [];
    const set = new Set<string>();
    lexiconOnlyEntries.forEach((e) => {
      if (e.xmlLang) set.add(e.xmlLang);
    });
    return Array.from(set).sort();
  }, [lexiconOnlyEntries, allEntriesHaveExplicitLang]);

  // Alphabetically sorted entries
  const sortedEntries = useMemo(() => {
    return [...lexiconOnlyEntries].sort((a, b) => {
      const aNorm = stripDiacritics(a.title || a.lemma);
      const bNorm = stripDiacritics(b.title || b.lemma);
      return aNorm.localeCompare(bNorm);
    });
  }, [lexiconOnlyEntries]);

  // Available initial letters
  const availableLetters = useMemo(() => {
    const set = new Set<string>();
    sortedEntries.forEach((e) => {
      const stripped = stripDiacritics(e.title || e.lemma).toUpperCase();
      if (stripped.length > 0) {
        set.add(stripped[0]);
      }
    });
    return set;
  }, [sortedEntries]);

  // Filtered entries
  const filteredEntries = useMemo(() => {
    return sortedEntries.filter((entry) => {
      if (allEntriesHaveExplicitLang && languageFilter !== 'all') {
        if (entry.xmlLang !== languageFilter) return false;
      }

      if (selectedLetter) {
        const firstChar = stripDiacritics(entry.title || entry.lemma).toUpperCase().charAt(0);
        if (firstChar !== selectedLetter) return false;
      }

      if (filterText.trim()) {
        const q = stripDiacritics(filterText.toLowerCase());
        const titleMatch = stripDiacritics(entry.title.toLowerCase()).includes(q);
        const lemmaMatch = stripDiacritics(entry.lemma.toLowerCase()).includes(q);
        const authorMatch = entry.authors.some((a) =>
          stripDiacritics(a.name.toLowerCase()).includes(q)
        );
        return titleMatch || lemmaMatch || authorMatch;
      }

      return true;
    });
  }, [sortedEntries, filterText, selectedLetter, languageFilter, allEntriesHaveExplicitLang]);

  // Group entries by initial letter
  const groupedByLetter = useMemo(() => {
    const groups: Record<string, LexiconEntry[]> = {};
    filteredEntries.forEach((entry) => {
      const char = stripDiacritics(entry.title || entry.lemma).toUpperCase().charAt(0) || '#';
      if (!groups[char]) groups[char] = [];
      groups[char].push(entry);
    });
    return groups;
  }, [filteredEntries]);

  const letterKeys = Object.keys(groupedByLetter).sort();


  return (
    <div className="space-y-12">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <p className="eyebrow">LARES</p>
          <h1 className="page-title">{t.navLexicon}</h1>
          <p className="font-serif text-xl text-muted">
            {tr(lang, 'Indice alfabetico dei termini religiosi greci, latini ed ebraici', 'Alphabetical index of Greek, Latin and Hebrew religious terms', 'Alfabetyczny indeks greckich, łacińskich i hebrajskich terminów religijnych')}
          </p>
        </div>
        <div className="text-sm text-faint">
          {filteredEntries.length} {t.entries}
        </div>
      </header>

      <div className="no-print space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="text"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder={t.filterPlaceholder}
            className="field max-w-md"
            aria-label="Filter lexicon entries"
          />
          {allEntriesHaveExplicitLang && availableLanguages.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <button type="button" className="chip" data-active={languageFilter === 'all'} onClick={() => setLanguageFilter('all')}>
                {tr(lang, 'Tutte', 'All', 'Wszystkie')}
              </button>
              {availableLanguages.map((code) => (
                <button key={code} type="button" className="chip font-mono" data-active={languageFilter === code} onClick={() => setLanguageFilter(code)}>
                  {code}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-1" aria-label="A–Z">
          <button type="button" className="chip" data-active={selectedLetter === null} onClick={() => setSelectedLetter(null)}>
            {tr(lang, 'Tutte', 'All', 'Wszystkie')}
          </button>
          {ALPHABET.map((char) =>
            availableLetters.has(char) ? (
              <button key={char} type="button" className="chip !px-2.5" data-active={selectedLetter === char} onClick={() => setSelectedLetter(char)}>
                {char}
              </button>
            ) : (
              <span key={char} className="inline-flex items-center px-2.5 py-[0.2rem] text-xs text-line select-none">
                {char}
              </span>
            )
          )}
        </div>
      </div>

      {filteredEntries.length === 0 ? (
        <p className="py-12 italic text-faint">{t.noResults}</p>
      ) : (
        <div className="space-y-14">
          {letterKeys.map((letter) => (
            <section key={letter}>
              <div className="mb-2 flex items-baseline gap-4 border-b border-line pb-2">
                <span className="text-3xl text-brand">{letter}</span>
                <span className="text-sm text-faint">{groupedByLetter[letter].length}</span>
              </div>
              <ul className="grid gap-x-12 sm:grid-cols-2">
                {groupedByLetter[letter].map((entry) => (
                  <li key={entry.id}>
                    <a href={`#/entry/${entry.id}`} className="group block border-b border-line/60 py-4">
                      <span className="flex items-baseline justify-between gap-3">
                        <span className="text-2xl group-hover:text-brand">{entry.title}</span>
                        {entry.originalScript && entry.originalScript !== entry.title && (
                          <span className="text-xl text-faint" lang={entry.xmlLang}>{entry.originalScript}</span>
                        )}
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
};
