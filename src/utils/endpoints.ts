/**
 * Where the frontend finds its data.
 *
 * - With the app server: live endpoints (/api/corpus, /api/search, …).
 * - As a static site (GitHub Pages): the same data, pre-generated at build time into
 *   plain files under the site's base path (see scripts/build-static.ts).
 */
const base = import.meta.env.BASE_URL || '/';

/** True in the build made for static hosting. */
export const STATIC_SITE = import.meta.env.VITE_STATIC === 'true';

/** Prefixes a public path with the site's base path (e.g. "/Lexicon/" on GitHub Pages). */
export const asset = (path: string): string => `${base}${path.replace(/^\//, '')}`;

export const endpoints = {
  corpus: () => (STATIC_SITE ? asset('api/corpus.json') : '/api/corpus'),
  body: (id: string) => (STATIC_SITE ? asset(`api/body/${encodeURIComponent(id)}.json`) : `/api/entries/${encodeURIComponent(id)}/body`),
  raw: (file: string) => asset(`data/${encodeURIComponent(file)}`),
  page: (name: string) => asset(`pages/${name}.xml`),
  searchCorpus: () => asset('api/search-corpus.json'),
};
