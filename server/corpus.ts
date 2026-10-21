/**
 * Server-side corpus: every XML file is parsed once (and again only when the file
 * changes), so browsers never have to parse the 5 MB of TEI themselves.
 *
 * Two views are served from this cache:
 *   - the *index*  (`bundle`): everything the lists, indices and search need, without
 *     the HTML of the texts and without the raw XML;
 *   - the *body* of one entry (`body`): the rendered HTML, fetched when it is opened.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DOMParser } from '@xmldom/xmldom';
import { FILE_NAME_RE } from '../src/lib/validateEntry.ts';
import { parseEpiDocXml } from '../src/utils/xmlParser.ts';
import type { LexiconEntry } from '../src/types/lexicon.ts';

interface Cached {
  sig: string;
  entry: LexiconEntry | null;
  error?: string;
}

/** Entry as sent to the client: no raw XML, no HTML, no running text. */
export function toIndexEntry(e: LexiconEntry) {
  const { rawXml: _raw, sections: _sections, editions, ...rest } = e;
  return {
    ...rest,
    bodyLoaded: false,
    editions: editions.map((ed) => ({
      lang: ed.lang,
      sections: ed.sections.map((s) => ({
        id: s.id,
        head: s.head,
        level: s.level,
        isBibliography: s.isBibliography,
        rawText: '', // full-text search runs on the server (server/search.ts)
        html: '',
      })),
    })),
  };
}

export class Corpus {
  private cache = new Map<string, Cached>();
  private bundleCache: { version: string; body: string } | null = null;

  readonly dir: string;

  constructor(dir: string) {
    this.dir = dir;
  }

  /** Entry files on disk, sorted. */
  list(): string[] {
    return fs
      .readdirSync(this.dir)
      .filter((f) => FILE_NAME_RE.test(f))
      .sort();
  }

  private load(name: string): Cached {
    const stat = fs.statSync(path.join(this.dir, name));
    const sig = `${stat.mtimeMs}-${stat.size}`;
    const hit = this.cache.get(name);
    if (hit && hit.sig === sig) return hit;

    const xml = fs.readFileSync(path.join(this.dir, name), 'utf-8');
    const parser = new DOMParser({ onError: () => {} }) as unknown as { parseFromString: (x: string, m: string) => Document };
    const { entry, error } = parseEpiDocXml(xml, name, parser);
    const fresh: Cached = { sig, entry: entry || null, error };
    this.cache.set(name, fresh);
    this.bundleCache = null;
    return fresh;
  }

  /** Drops cached data (after a write or delete). */
  invalidate(name?: string) {
    if (name) this.cache.delete(name);
    else this.cache.clear();
    this.bundleCache = null;
  }

  private sync(): Array<{ name: string; cached: Cached }> {
    const names = this.list();
    const alive = new Set(names);
    for (const n of [...this.cache.keys()]) if (!alive.has(n)) this.cache.delete(n);
    return names.map((name) => ({ name, cached: this.load(name) }));
  }

  private versionOf(items: Array<{ name: string; cached: Cached }>): string {
    return crypto
      .createHash('sha1')
      .update(items.map((i) => `${i.name}:${i.cached.sig}`).join('|'))
      .digest('hex')
      .slice(0, 16);
  }

  /** Content-derived version of the whole corpus (stable across restarts, changes on any edit). */
  version(): string {
    return this.versionOf(this.sync());
  }

  /** Fully parsed entries (all editions, with running text): what the search index is built from. */
  entries(): LexiconEntry[] {
    return this.sync()
      .map((i) => i.cached.entry)
      .filter((e): e is LexiconEntry => Boolean(e));
  }

  /** The index of the whole corpus, with a content-derived version (stable across restarts). */
  bundle(): { version: string; body: string } {
    const items = this.sync();
    const version = this.versionOf(items);
    if (!this.bundleCache || this.bundleCache.version !== version) {
      const entries = items.filter((i) => i.cached.entry).map((i) => toIndexEntry(i.cached.entry!));
      const failed = items.filter((i) => !i.cached.entry).map((i) => ({ name: i.name, error: i.cached.error || 'parse error' }));
      this.bundleCache = { version, body: JSON.stringify({ version, entries, failed }) };
    }
    return this.bundleCache;
  }

  private find(id: string): { name: string; cached: Cached } | null {
    const wanted = id.toLowerCase();
    return this.sync().find((i) => i.cached.entry?.id === wanted) || null;
  }

  /** Rendered HTML of one entry, keyed by section id, plus a version for HTTP caching. */
  body(id: string): { version: string; json: string } | null {
    const hit = this.find(id);
    if (!hit?.cached.entry) return null;
    const sections: Record<string, string> = {};
    hit.cached.entry.editions.forEach((ed) => ed.sections.forEach((s) => (sections[s.id] = s.html)));
    return { version: crypto.createHash('sha1').update(`${hit.name}:${hit.cached.sig}`).digest('hex').slice(0, 16), json: JSON.stringify({ sections }) };
  }
}
