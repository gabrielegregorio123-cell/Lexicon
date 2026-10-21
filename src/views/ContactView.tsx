import React from 'react';
import type { Language } from '../i18n/translations.ts';
import { tr } from '../i18n/translations.ts';
import { CONTACT_EMAIL, CONTACT_NAME } from '../lib/site.ts';

const mailto = (subject: string) => `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}`;

export const ContactView: React.FC<{ lang: Language }> = ({ lang }) => {
  const ways = [
    {
      title: tr(lang, 'Segnalare un errore', 'Report a mistake', 'Zgłosić błąd'),
      text: tr(
        lang,
        'Hai trovato un refuso, una citazione imprecisa o un’informazione da correggere in una scheda o in un capitolo? Scrivici indicando la pagina.',
        'Found a typo, an inaccurate citation or something to correct in an entry or a chapter? Write to us and tell us which page.',
        'Znalazłeś literówkę, niedokładny cytat lub informację do poprawienia w haśle albo rozdziale? Napisz do nas i wskaż stronę.'
      ),
      subject: tr(lang, 'LARES — segnalazione', 'LARES — correction', 'LARES — uwaga do treści'),
    },
    {
      title: tr(lang, 'Proporre una scheda', 'Propose an entry', 'Zaproponować hasło'),
      text: tr(
        lang,
        'Se lavori sul lessico religioso del mondo antico e vuoi contribuire con una nuova scheda, presentaci la proposta: ti indicheremo come procedere.',
        'If you work on the religious vocabulary of the ancient world and would like to contribute a new entry, send us your proposal and we will tell you how to proceed.',
        'Jeśli zajmujesz się słownictwem religijnym świata starożytnego i chcesz przygotować nowe hasło, przedstaw nam propozycję — wskażemy, jak postępować.'
      ),
      subject: tr(lang, 'LARES — proposta di scheda', 'LARES — entry proposal', 'LARES — propozycja hasła'),
    },
    {
      title: tr(lang, 'Collaborazioni', 'Collaborations', 'Współpraca'),
      text: tr(
        lang,
        'Progetti di ricerca, riuso dei dati, didattica, convegni: siamo aperti a collaborazioni con istituzioni e studiosi.',
        'Research projects, reuse of the data, teaching, conferences: we are open to collaboration with institutions and scholars.',
        'Projekty badawcze, ponowne wykorzystanie danych, dydaktyka, konferencje: jesteśmy otwarci na współpracę z instytucjami i badaczami.'
      ),
      subject: tr(lang, 'LARES — collaborazione', 'LARES — collaboration', 'LARES — współpraca'),
    },
  ];

  return (
    <div className="space-y-16">
      <header className="max-w-2xl space-y-3">
        <p className="eyebrow">{tr(lang, 'Contatti', 'Contact', 'Kontakt')}</p>
        <h1 className="page-title">{tr(lang, 'Collabora con noi', 'Work with us', 'Współpracuj z nami')}</h1>
        <p className="pt-2 text-xl italic leading-relaxed text-muted">
          {tr(
            lang,
            'LARES cresce grazie al lavoro di studiose e studiosi di più università. Se vuoi scriverci, contribuire o collaborare, siamo qui.',
            'LARES grows through the work of scholars from several universities. If you would like to write to us, contribute or collaborate, we would be glad to hear from you.',
            'LARES rozwija się dzięki pracy badaczy z kilku uniwersytetów. Jeśli chcesz do nas napisać, wnieść wkład lub podjąć współpracę — chętnie usłyszymy od Ciebie.'
          )}
        </p>
      </header>

      <section className="max-w-2xl border-t-2 border-brand pt-6">
        <p className="eyebrow">{tr(lang, 'Scrivi a', 'Write to', 'Napisz do')}</p>
        <p className="mt-2 text-2xl">{CONTACT_NAME}</p>
        <p className="text-muted">{tr(lang, 'Coordinamento del progetto', 'Project coordination', 'Koordynacja projektu')}</p>
        <a
          href={mailto(tr(lang, 'LARES — contatto', 'LARES — contact', 'LARES — kontakt'))}
          className="mt-4 inline-block break-all text-2xl text-brand underline decoration-slate underline-offset-[6px] transition-colors hover:decoration-brand"
        >
          {CONTACT_EMAIL}
        </a>
      </section>

      <section className="max-w-3xl">
        <ul className="grid gap-x-12 gap-y-10 md:grid-cols-3">
          {ways.map((w) => (
            <li key={w.title} className="space-y-3">
              <h2 className="border-b border-line pb-2 text-2xl font-medium">{w.title}</h2>
              <p className="leading-relaxed text-muted">{w.text}</p>
              <a href={mailto(w.subject)} className="inline-block text-brand transition-opacity hover:opacity-70">
                {tr(lang, 'Scrivici', 'Write to us', 'Napisz do nas')} →
              </a>
            </li>
          ))}
        </ul>
      </section>

      <p className="text-muted">
        <a href="#/team" className="transition-colors hover:text-brand">
          {tr(lang, 'Il gruppo di ricerca', 'The research team', 'Zespół badawczy')} →
        </a>
      </p>
    </div>
  );
};
