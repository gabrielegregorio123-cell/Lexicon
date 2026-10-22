import React, { useMemo, useState } from 'react';
import type { Language } from '../i18n/translations.ts';
import type { LexiconEntry } from '../types/lexicon.ts';
import { SearchBox } from '../components/SearchBox.tsx';

interface HomeViewProps {
  lang: Language;
  entries: LexiconEntry[];
}

const COPY = {
  it: {
    eyebrow: 'UNA Europa seed funding',
    title: ['Languages and', 'Religions'],
    lead: 'Come cambiano le parole quando cambiano gli dèi: il lessico religioso del mondo antico, scheda per scheda.',
    cta: 'Esplora il lessico',
    cta2: 'Capitoli dei volumi',
    searchPh: 'Cerca nel lessico',
    search: 'Cerca',
    featured: 'Dal lessico',
    read: 'Leggi la scheda',
    doors: [
      { href: '#/lexicon', title: 'Lessico', text: 'Etimologia, testimonianze e interpretazione dei termini della religione antica, in italiano, inglese e polacco.', unit: 'schede' },
      { href: '#/book-chapters', title: 'Capitoli dei volumi', text: 'Il sacrificio cruento nella Grecia antica alla luce dei dati filologici: Omero, tragedia, commedia, Platone e Corpus ippocratico.', unit: 'capitoli' },
    ],
    indices: 'Indici',
    indicesList: [
      ['sources', 'Fonti antiche'],
      ['realms', 'Ambiti'],
      ['terms', 'Termini greci e latini'],
      ['characters', 'Personaggi letterari e mitologici'],
      ['historical', 'Figure storiche'],
      ['places', 'Luoghi'],
    ],
    about: 'Il progetto',
    aboutText:
      'LARES è un progetto di ricerca finanziato dall’azione UNA Europa seed funding e promosso da quattro università europee (elenco in fondo alla pagina). Il sito ospita anche i capitoli della serie in quattro volumi «Il sacrificio cruento nella Grecia antica alla luce dei dati filologici».',
    team: 'Progetto e gruppo',
    contribute: 'Collabora con noi',
    contributeText: 'Segnala una correzione, proponi una scheda o scrivici per una collaborazione: il progetto cresce con il lavoro di chi studia la religione antica.',
    openEditor: 'Scrivici',
    guide: 'Contatti',
  },
  en: {
    eyebrow: 'UNA Europa seed funding',
    title: ['Language and', 'Religion'],
    lead: 'How words change when the gods change: the religious vocabulary of the ancient world, entry by entry.',
    cta: 'Explore the lexicon',
    cta2: 'Book chapters',
    searchPh: 'Search the lexicon',
    search: 'Search',
    featured: 'From the lexicon',
    read: 'Read the entry',
    doors: [
      { href: '#/lexicon', title: 'Lexicon', text: 'Etymology, testimonies and interpretation of the terms of ancient religion, in English, Italian and Polish.', unit: 'entries' },
      { href: '#/book-chapters', title: 'Book chapters', text: 'Blood sacrifice in ancient Greece in the light of philological data: Homer, tragedy, comedy, Plato and the Hippocratic Corpus.', unit: 'chapters' },
    ],
    indices: 'Indices',
    indicesList: [
      ['sources', 'Ancient sources'],
      ['realms', 'Realms'],
      ['terms', 'Greek and Latin terms'],
      ['characters', 'Literary and mythological characters'],
      ['historical', 'Historical figures'],
      ['places', 'Places'],
    ],
    about: 'About the project',
    aboutText:
      'LARES is a research foresight project funded by the UNA Europa seed funding action and promoted by four European universities (listed at the foot of the page). The site also hosts the chapters of the four-volume series “Blood sacrifice in Ancient Greece in the light of philological data”.',
    team: 'Project and team',
    contribute: 'Work with us',
    contributeText: 'Report a correction, propose an entry or write to us about a collaboration: the project grows with the work of those who study ancient religion.',
    openEditor: 'Write to us',
    guide: 'Contact',
  },
  pl: {
    eyebrow: 'UNA Europa seed funding',
    title: ['Languages and', 'Religions'],
    lead: 'Jak zmieniają się słowa, gdy zmieniają się bogowie: słownictwo religijne świata starożytnego, hasło po haśle.',
    cta: 'Przeglądaj leksykon',
    cta2: 'Rozdziały tomów',
    searchPh: 'Szukaj w leksykonie',
    search: 'Szukaj',
    featured: 'Z leksykonu',
    read: 'Czytaj hasło',
    doors: [
      { href: '#/lexicon', title: 'Leksykon', text: 'Etymologia, świadectwa i interpretacja terminów religii starożytnej — po polsku, angielsku i włosku.', unit: 'haseł' },
      { href: '#/book-chapters', title: 'Rozdziały tomów', text: 'Ofiara krwawa w starożytnej Grecji w świetle danych filologicznych: Homer, tragedia, komedia, Platon i Corpus Hippocraticum.', unit: 'rozdziałów' },
    ],
    indices: 'Indeksy',
    indicesList: [
      ['sources', 'Źródła starożytne'],
      ['realms', 'Dziedziny'],
      ['terms', 'Terminy greckie i łacińskie'],
      ['characters', 'Postacie literackie i mitologiczne'],
      ['historical', 'Postacie historyczne'],
      ['places', 'Miejsca'],
    ],
    about: 'O projekcie',
    aboutText:
      'LARES to projekt badawczy sfinansowany w ramach programu UNA Europa seed funding, realizowany przez cztery uniwersytety europejskie (lista na dole strony). Serwis zawiera także rozdziały czterotomowej serii „Ofiara krwawa w Grecji starożytnej w świetle danych filologicznych”.',
    team: 'Projekt i zespół',
    contribute: 'Współpracuj z nami',
    contributeText: 'Zgłoś poprawkę, zaproponuj hasło lub napisz do nas w sprawie współpracy: projekt rozwija się dzięki pracy osób badających religię starożytną.',
    openEditor: 'Napisz do nas',
    guide: 'Kontakt',
  },
} as const;

/** Cheap stable hash, so the lemma tapestry looks the same on every visit. */
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

const SIZES = ['text-2xl', 'text-3xl', 'text-4xl', 'text-5xl', 'text-3xl', 'text-2xl'];
const TONES = ['text-slate-ink', 'text-brand', 'text-faint', 'text-slate-ink', 'text-muted'];

/** Eyebrow label + hairline that opens each section. */
const SectionLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="border-b border-line pb-3">
    <h2 className="eyebrow">{children}</h2>
  </div>
);

export const HomeView: React.FC<HomeViewProps> = ({ lang, entries }) => {
  const c = COPY[lang];
  const [query, setQuery] = useState('');

  const lexicon = useMemo(() => entries.filter((e) => e.collection !== 'chapter'), [entries]);
  const counts = [lexicon.length, entries.length - lexicon.length];

  // The lexicon at a glance: the headwords themselves, in their own scripts.
  const tapestry = useMemo(
    () =>
      lexicon
        .filter((e) => e.originalScript && e.originalScript.length <= 16)
        .sort((a, b) => hash(a.id) - hash(b.id))
        .slice(0, 30),
    [lexicon]
  );

  // One entry in the spotlight, changing every day.
  const featured = useMemo(() => {
    const candidates = lexicon.filter((e) => e.excerpt.length > 80);
    if (!candidates.length) return null;
    const day = Math.floor(Date.now() / 86_400_000);
    return [...candidates].sort((a, b) => a.id.localeCompare(b.id))[day % candidates.length];
  }, [lexicon]);

  const go = (e: React.FormEvent) => {
    e.preventDefault();
    window.location.hash = query.trim() ? `#/search?q=${encodeURIComponent(query.trim())}` : '#/search';
  };

  return (
    <div className="space-y-24">
      {/* Masthead */}
      <section className="space-y-9 pt-4">
        <p className="eyebrow">{c.eyebrow}</p>
        <h1 className="text-[3.4rem] font-medium leading-[0.98] tracking-tight sm:text-7xl lg:text-8xl">
          {c.title[0]} <span className="text-brand">{c.title[1]}</span>
        </h1>
        <p className="max-w-xl text-xl italic leading-snug text-muted sm:text-2xl">{c.lead}</p>
        <div className="flex flex-wrap items-center gap-x-8 gap-y-4 pt-1">
          <a href="#/lexicon" className="btn btn-primary !px-5 !py-3">
            {c.cta} →
          </a>
          <a href="#/book-chapters" className="text-lg text-muted underline decoration-slate underline-offset-[6px] transition-colors hover:text-brand hover:decoration-brand">
            {c.cta2}
          </a>
        </div>
        <form onSubmit={go} className="relative flex max-w-md items-center gap-4 border-b border-line pb-2 transition-colors focus-within:border-brand">
          <SearchBox
            entries={entries}
            lang={lang}
            value={query}
            onChange={setQuery}
            onPickQuery={(q) => (window.location.hash = `#/search?q=${encodeURIComponent(q)}`)}
            onPickEntry={(id) => (window.location.hash = `#/entry/${id}`)}
            placeholder={c.searchPh}
            ariaLabel={c.search}
            className="min-w-0 flex-1 bg-transparent text-lg italic text-ink outline-none placeholder:text-faint"
          />
          <button type="submit" className="btn !border-transparent !px-0 hover:!bg-transparent">
            {c.search} →
          </button>
        </form>
      </section>

      {/* The headwords, in their own scripts: loosely scattered, like words on a squeeze */}
      {tapestry.length > 0 && (
        <section className="frame-raised px-9 py-14 sm:px-14">
          <ul className="flex flex-wrap items-start justify-center gap-x-9 gap-y-7">
            {tapestry.map((e) => {
              const h = hash(e.id);
              const lift = [0, 0.9, -0.4, 1.4, 0.5, -0.7, 1.1][h % 7];
              const shift = [0, 1.0, 2.0, 0.4, 1.5][(h >>> 5) % 5];
              return (
                <li key={e.id} style={{ position: 'relative', top: `${lift}rem`, marginLeft: `${shift}rem` }}>
                  <a
                    href={`#/entry/${e.id}`}
                    title={e.title}
                    // no lang="la": EB Garamond's Latin locale draws the lowercase u like a v
                    lang={e.xmlLang === 'la' ? undefined : e.xmlLang}
                    className={`${SIZES[h % SIZES.length]} ${TONES[(h >>> 3) % TONES.length]} leading-tight transition-colors hover:!text-ink`}
                  >
                    {e.originalScript}
                  </a>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Entry in the spotlight */}
      {featured && (
        <section className="grid gap-x-14 gap-y-6 md:grid-cols-[12rem_1fr]">
          <h2 className="eyebrow pt-2">{c.featured}</h2>
          <a href={`#/entry/${featured.id}`} className="group block space-y-4 border-l-2 border-brand pl-7">
            <span className="flex flex-wrap items-baseline gap-x-5">
              <span className="text-5xl font-medium leading-none transition-colors group-hover:text-brand">{featured.title}</span>
              {featured.originalScript && featured.originalScript !== featured.title && <span className="text-3xl text-slate-ink">{featured.originalScript}</span>}
            </span>
            <span className="line-clamp-4 block max-w-2xl text-lg leading-relaxed text-muted">{featured.excerpt}</span>
            <span className="inline-block text-brand">{c.read} →</span>
          </a>
        </section>
      )}

      {/* The two collections */}
      <section>
        <ul className="grid gap-x-14 gap-y-10 md:grid-cols-2">
          {c.doors.map((d, i) => (
            <li key={d.href}>
              <a href={d.href} className="group block space-y-3 border-t-2 border-brand pt-5">
                <span className="flex items-baseline justify-between gap-4">
                  <span className="text-4xl font-medium transition-colors group-hover:text-brand">{d.title}</span>
                  <span className="text-sm tabular-nums text-slate-ink">
                    {counts[i]} {d.unit}
                  </span>
                </span>
                <span className="block max-w-md text-lg leading-relaxed text-muted">{d.text}</span>
              </a>
            </li>
          ))}
        </ul>
      </section>

      {/* Indices */}
      <section className="space-y-2">
        <SectionLabel>{c.indices}</SectionLabel>
        <ul className="grid gap-x-14 sm:grid-cols-2">
          {c.indicesList.map(([key, label]) => (
            <li key={key}>
              <a href={`#/indices/${key}`} className="group flex items-baseline justify-between border-b border-line/60 py-4 text-xl transition-colors hover:text-brand">
                {label}
                <span className="text-faint transition-transform group-hover:translate-x-0.5">→</span>
              </a>
            </li>
          ))}
        </ul>
      </section>

      {/* About + contribute */}
      <section className="grid gap-16 border-t border-line pt-14 md:grid-cols-2">
        <div className="space-y-4">
          <h2 className="eyebrow">{c.about}</h2>
          <p className="text-lg leading-relaxed text-muted">{c.aboutText}</p>
          <a href="#/team" className="inline-block text-muted transition-colors hover:text-brand">
            {c.team} →
          </a>
        </div>
        <div className="space-y-4">
          <h2 className="eyebrow">{c.contribute}</h2>
          <p className="text-lg leading-relaxed text-muted">{c.contributeText}</p>
          <div className="flex flex-wrap gap-3 pt-1">
            <a href="#/contact" className="btn btn-primary">
              {c.guide} →
            </a>
          </div>
        </div>
      </section>
    </div>
  );
};
