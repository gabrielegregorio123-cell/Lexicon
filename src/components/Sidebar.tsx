import React, { useEffect, useState } from 'react';
import type { Language } from '../i18n/translations.ts';
import { Logo } from './Logo.tsx';

interface SidebarProps {
  currentRoute: string;
  lang: Language;
  onSetLang: (lang: Language) => void;
  lexiconCount: number;
  chapterCount: number;
}

const LABELS = {
  en: {
    lexicon: 'Lexicon',
    chapters: 'Book chapters',
    indices: 'Indices',
    search: 'Search',
    bibliography: 'Bibliography',
    team: 'Project & team',
    contact: 'Work with us',
    menu: 'Menu',
  },
  it: {
    lexicon: 'Lessico',
    chapters: 'Capitoli dei volumi',
    indices: 'Indici',
    search: 'Ricerca',
    bibliography: 'Bibliografia',
    team: 'Progetto e gruppo',
    contact: 'Collabora con noi',
    menu: 'Menu',
  },
  pl: {
    lexicon: 'Leksykon',
    chapters: 'Rozdziały tomów',
    indices: 'Indeksy',
    search: 'Szukaj',
    bibliography: 'Bibliografia',
    team: 'Projekt i zespół',
    contact: 'Współpracuj z nami',
    menu: 'Menu',
  },
} as const;

const Panel: React.FC<SidebarProps & { onNavigate?: () => void }> = ({
  currentRoute,
  lang,
  onSetLang,
  lexiconCount,
  chapterCount,
  onNavigate,
}) => {
  const t = LABELS[lang];
  const route = currentRoute.replace(/^#\/?/, '').split('?')[0];
  const isActive = (match: string) => (match === '' ? route === '' : route === match || route.startsWith(`${match}/`));

  const Link = ({ href, match, label, count }: { href: string; match: string; label: string; count?: number }) => (
    <a href={href} className="nav-link" aria-current={isActive(match) ? 'page' : undefined} onClick={onNavigate}>
      <span>{label}</span>
      {count ? <small>{count}</small> : null}
    </a>
  );

  return (
    <div className="flex h-full flex-col">
      <a href="#/" onClick={onNavigate} className="block px-2 pt-1" title="LARES — Home">
        <Logo className="h-12" />
      </a>

      <nav className="mt-9 space-y-0.5" aria-label="Main">
        <Link href="#/lexicon" match="lexicon" label={t.lexicon} count={lexiconCount} />
        <Link href="#/book-chapters" match="book-chapters" label={t.chapters} count={chapterCount} />
        <Link href="#/indices/sources" match="indices" label={t.indices} />
        <Link href="#/search" match="search" label={t.search} />
        <Link href="#/bibliography" match="bibliography" label={t.bibliography} />
        <Link href="#/team" match="team" label={t.team} />
        <Link href="#/contact" match="contact" label={t.contact} />
      </nav>


      <div className="mt-auto space-y-4 px-2 pt-8 text-[0.95rem] text-faint">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
          {(['it', 'en', 'pl'] as const).map((l, i) => (
            <React.Fragment key={l}>
              {i > 0 && <span aria-hidden>·</span>}
              <button
                type="button"
                onClick={() => onSetLang(l)}
                className={`px-1 uppercase tracking-[0.1em] transition-colors hover:text-brand ${lang === l ? 'text-ink underline decoration-brand decoration-1 underline-offset-4' : ''}`}
                aria-pressed={lang === l}
              >
                {l}
              </button>
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
};

export const Sidebar: React.FC<SidebarProps> = (props) => {
  const [open, setOpen] = useState(false);
  const t = LABELS[props.lang];

  useEffect(() => setOpen(false), [props.currentRoute]);

  return (
    <>
      {/* Desktop: fixed glass column */}
      <aside className="no-print glass fixed bottom-3 left-3 top-3 z-40 hidden w-[14.5rem] rounded-2xl p-4 lg:block">
        <Panel {...props} />
      </aside>

      {/* Mobile: glass top bar + drawer */}
      <div className="no-print lg:hidden">
        <div className="glass sticky top-2 z-40 mx-2 mt-2 flex items-center justify-between rounded-2xl px-4 py-2">
          <a href="#/" title="LARES — Home">
            <Logo className="h-9" />
          </a>
          <button type="button" className="btn" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            {open ? '×' : t.menu}
          </button>
        </div>
        {open && (
          <>
            <button type="button" className="fixed inset-0 z-40 bg-black/20" aria-label="Close menu" onClick={() => setOpen(false)} />
            <aside className="glass fixed bottom-3 left-3 top-3 z-50 w-[17rem] max-w-[calc(100vw-1.5rem)] overflow-y-auto rounded-2xl p-4">
              <Panel {...props} onNavigate={() => setOpen(false)} />
            </aside>
          </>
        )}
      </div>
    </>
  );
};
