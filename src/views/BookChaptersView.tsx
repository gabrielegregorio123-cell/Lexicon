import React, { useMemo } from 'react';
import { tr } from '../i18n/translations.ts';
import type { Language } from '../i18n/translations.ts';
import type { ChapterVolume, LexiconEntry } from '../types/lexicon.ts';
import { SERIES_TITLE, VOLUMES } from '../lib/volumes.ts';

interface Props {
  entries: LexiconEntry[];
  lang: Language;
  volume?: string;
}

export const BookChaptersView: React.FC<Props> = ({ entries, lang, volume }) => {
  const byVolume = useMemo(() => {
    const map = new Map<ChapterVolume, LexiconEntry[]>();
    entries
      .filter((e) => e.collection === 'chapter' && e.volume)
      .sort((a, b) => a.fileName.localeCompare(b.fileName))
      .forEach((e) => map.set(e.volume!, [...(map.get(e.volume!) || []), e]));
    return map;
  }, [entries]);

  const current = VOLUMES.find((v) => v.id === volume);
  const label = (e: LexiconEntry) => e.titles[lang] || e.title;

  // ── One volume ─────────────────────────────────────────────────────────────
  if (current) {
    const chapters = byVolume.get(current.id) || [];
    return (
      <div className="space-y-12">
        <header className="max-w-3xl space-y-3">
          <a href="#/book-chapters" className="text-muted hover:text-brand">
            ← {tr(lang, 'Tutti i volumi', 'All volumes', 'Wszystkie tomy')}
          </a>
          <p className="eyebrow pt-4">{SERIES_TITLE[lang]}</p>
          <h1 className="page-title">{current.title[lang]}</h1>
          <p className="pt-2 text-xl italic text-muted">
            {current.subtitle[lang]} · {current.author}
          </p>
          <p className="text-[0.95rem] text-faint">{current.source}</p>
        </header>
        <ol className="max-w-3xl">
          {chapters.map((e) => {
            const n = /^[a-z]+_(\d+)_/i.exec(e.fileName)?.[1];
            return (
              <li key={e.id}>
                <a href={`#/entry/${e.id}`} className="group flex items-baseline gap-5 border-b border-line/60 py-3.5">
                  <span className="w-8 shrink-0 text-right text-faint tabular-nums">{n && Number(n) > 0 ? Number(n) : ''}</span>
                  <span className="flex-1 text-xl group-hover:text-brand">{label(e)}</span>
                  {e.editions.length > 0 && <span className="text-sm uppercase tracking-[0.1em] text-faint">{e.editions.map((x) => x.lang).filter((l) => l !== 'und').join(' ')}</span>}
                </a>
              </li>
            );
          })}
        </ol>
      </div>
    );
  }

  // ── Overview ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-14">
      <header className="max-w-2xl space-y-3">
        <p className="eyebrow">{tr(lang, 'Volumi', 'Volumes', 'Tomy')}</p>
        <h1 className="page-title">{tr(lang, 'Capitoli dei volumi', 'Book chapters', 'Rozdziały tomów')}</h1>
        <p className="pt-2 text-xl italic leading-relaxed text-muted">{SERIES_TITLE[lang]}</p>
      </header>
      <ul className="max-w-3xl">
        {VOLUMES.map((v, i) => (
          <li key={v.id}>
            <a href={`#/book-chapters/${v.id}`} className="group block border-t border-line py-7">
              <span className="flex items-baseline justify-between gap-4">
                <span className="text-3xl group-hover:text-brand">
                  <span className="mr-4 text-xl text-faint">{['I', 'II', 'III', 'IV'][i]}</span>
                  {v.title[lang]}
                </span>
                <span className="text-sm text-faint">
                  {byVolume.get(v.id)?.length || 0} {tr(lang, 'capitoli', 'chapters', 'rozdziałów')}
                </span>
              </span>
              <span className="mt-1 block text-lg italic text-muted">
                {v.subtitle[lang]} · {v.author}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
};
