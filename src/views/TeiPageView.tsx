import React, { useEffect, useState } from 'react';
import type { Language } from '../i18n/translations.ts';
import { loadTeiPage, type TeiPage } from '../utils/teiPage.ts';

interface Props {
  lang: Language;
  page: string;
  eyebrow: string;
  title: Record<Language, string>;
  lead?: Record<Language, string>;
}

export const TeiPageView: React.FC<Props> = ({ lang, page, eyebrow, title, lead }) => {
  const [data, setData] = useState<TeiPage | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setData(null);
    setError(null);
    loadTeiPage(page)
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(String(e.message || e)));
    return () => {
      alive = false;
    };
  }, [page]);

  return (
    <div className="space-y-12">
      <header className="max-w-2xl space-y-3">
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="page-title">{title[lang]}</h1>
        {lead && <p className="pt-2 text-xl italic leading-relaxed text-muted">{lead[lang]}</p>}
      </header>
      {error && <p className="text-danger">{error}</p>}
      {!data && !error && <p className="italic text-faint">…</p>}
      {data && <article className="tei-page scholarly-prose" dangerouslySetInnerHTML={{ __html: data.html }} />}
    </div>
  );
};
