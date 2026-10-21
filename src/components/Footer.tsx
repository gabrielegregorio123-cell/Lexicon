import React from 'react';
import type { Language } from '../i18n/translations.ts';
import { tr } from '../i18n/translations.ts';

/** The four partner universities, in their own languages, always shown together. */
const PARTNERS = ['Alma Mater Studiorum – Università di Bologna', 'Helsingin yliopisto', 'Uniwersytet Jagielloński w Krakowie', 'Universidad Complutense de Madrid'];

export const Footer: React.FC<{ lang: Language; entryCount: number; onExportJson?: () => void; wide?: boolean }> = ({
  lang,
  entryCount,
  onExportJson,
  wide,
}) => (
  <footer className="no-print mt-28 border-t border-line">
    <div className={`mx-auto space-y-8 px-6 py-12 sm:px-10 ${wide ? 'max-w-none xl:px-14' : 'max-w-4xl'}`}>
      <div className="flex flex-col gap-4 text-[0.95rem] text-faint md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <p className="font-medium text-muted">LARES — Languages · Religions</p>
          <p>{tr(lang, 'Edizione digitale generata dalle schede EpiDoc TEI XML.', 'Digital edition generated from EpiDoc TEI XML entries.', 'Edycja cyfrowa generowana z plików EpiDoc TEI XML.')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
          <span>
            {entryCount} {tr(lang, 'schede', 'entries', 'haseł')}
          </span>
          <a href="#/contact" className="hover:text-brand">
            {tr(lang, 'Contatti', 'Contact', 'Kontakt')}
          </a>
          {onExportJson && entryCount > 0 && (
            <button type="button" onClick={onExportJson} className="hover:text-brand">
              Export JSON
            </button>
          )}
          <span>CC BY-SA 4.0</span>
        </div>
      </div>

      <div className="border-t border-line/60 pt-6 text-[0.8rem] leading-relaxed text-faint">
        <p className="mb-1 uppercase tracking-[0.14em]">UNA Europa seed funding</p>
        <p>{PARTNERS.join(' · ')}</p>
      </div>
    </div>
  </footer>
);
