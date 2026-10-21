/**
 * Builds the site for static hosting (GitHub Pages).
 *
 *   npm run build:static                 base path from BASE_PATH, or /<repo>/ on GitHub Actions, or /Lexicon/
 *   BASE_PATH=/ npm run build:static     site served from the root of a domain
 *
 * It runs the normal frontend build in "static" mode and then does, once, what the
 * app server does on every request: parse the corpus and write the results as plain
 * files (index, entry bodies, search text) next to the XML sources.
 */
import fs from 'node:fs';
import path from 'node:path';
import { build } from 'vite';
import { Corpus } from '../server/corpus.ts';

function basePath(): string {
  const fromEnv = process.env.BASE_PATH?.trim();
  const repo = process.env.GITHUB_REPOSITORY?.split('/')[1];
  const raw = fromEnv || (repo ? `/${repo}/` : '/Lexicon/');
  return `/${raw.replace(/^\/+|\/+$/g, '')}/`.replace(/^\/\/$/, '/');
}

const base = basePath();
const dist = path.resolve('dist');
const dataDir = path.resolve(process.env.DATA_DIR || 'public/data');

process.env.VITE_STATIC = 'true';
process.env.VITE_BASE = base;
console.log(`[static] base path: ${base}`);

await build({ base, logLevel: 'warn' });

const corpus = new Corpus(dataDir);
const write = (rel: string, body: string) => {
  const target = path.join(dist, rel);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, body, 'utf-8');
};

// 1. The corpus index (the same document /api/corpus serves)
write('api/corpus.json', corpus.bundle().body);

// 2. The rendered body of every entry (the same as /api/entries/:id/body)
const entries = corpus.entries();
for (const e of entries) {
  const body = corpus.body(e.id);
  if (body) write(`api/body/${e.id}.json`, body.json);
}

// 3. Running text of every edition, for the in-browser search index
const texts: Record<string, Record<string, string[]>> = {};
for (const e of entries) {
  texts[e.id] = Object.fromEntries(e.editions.map((ed) => [ed.lang, ed.sections.map((s) => s.rawText)]));
}
write('api/search-corpus.json', JSON.stringify({ texts }));

// 4. Hosting details: no Jekyll processing; SPA-friendly 404 for deep links
write('.nojekyll', '');
fs.copyFileSync(path.join(dist, 'index.html'), path.join(dist, '404.html'));

// The editor needs the server: do not ship its emblem or the generated manifest
fs.rmSync(path.join(dist, 'brand/emblem.webp'), { force: true });

const size = (d: string): number => fs.readdirSync(d, { withFileTypes: true }).reduce((n, f) => n + (f.isDirectory() ? size(path.join(d, f.name)) : fs.statSync(path.join(d, f.name)).size), 0);
console.log(`[static] ${entries.length} entries → ${path.relative(process.cwd(), dist)}/ (${(size(dist) / 1048576).toFixed(1)} MB)`);
