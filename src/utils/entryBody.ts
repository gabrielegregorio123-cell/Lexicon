/**
 * On-demand parts of an entry. The corpus index sent at start-up carries no HTML and
 * no raw XML (they are most of the weight); both are fetched when an entry is opened.
 */
import { useEffect, useState } from 'react';
import type { LexiconEntry } from '../types/lexicon.ts';

const bodies = new Map<string, Promise<Record<string, string>>>();

/** Forget cached bodies (after the corpus was reloaded, e.g. following a save). */
export function clearBodyCache() {
  bodies.clear();
}

/** Rendered HTML of every section of an entry, keyed by section id. */
export function fetchEntryBody(id: string): Promise<Record<string, string>> {
  let p = bodies.get(id);
  if (!p) {
    p = fetch(`/api/entries/${encodeURIComponent(id)}/body`, { cache: 'no-cache' }).then(async (res) => {
      if (!res.ok) throw new Error(`Body ${id}: ${res.status}`);
      return ((await res.json()) as { sections: Record<string, string> }).sections;
    });
    p.catch(() => bodies.delete(id));
    bodies.set(id, p);
  }
  return p;
}

/** The entry's source file. */
export async function fetchRawXml(fileName: string): Promise<string> {
  const res = await fetch(`/data/${encodeURIComponent(fileName)}`, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${fileName}: ${res.status}`);
  return res.text();
}

export interface Loadable<T> {
  value: T | null;
  loading: boolean;
  error: string | null;
}

/** HTML of the sections, loaded on demand; `value` is null until it arrives (or when it is already inline). */
export function useEntryBody(entry: LexiconEntry): Loadable<Record<string, string>> {
  const needed = entry.bodyLoaded === false;
  const [state, setState] = useState<Loadable<Record<string, string>>>({ value: null, loading: needed, error: null });

  useEffect(() => {
    if (!needed) {
      setState({ value: null, loading: false, error: null });
      return;
    }
    let alive = true;
    setState({ value: null, loading: true, error: null });
    fetchEntryBody(entry.id)
      .then((value) => alive && setState({ value, loading: false, error: null }))
      .catch((e) => alive && setState({ value: null, loading: false, error: String(e.message || e) }));
    return () => {
      alive = false;
    };
  }, [entry.id, entry.fileName, needed]);

  return state;
}

/** Raw XML of an entry: inline when the entry was parsed in the browser, otherwise fetched on demand. */
export function useRawXml(entry: LexiconEntry, enabled: boolean): Loadable<string> {
  const [state, setState] = useState<Loadable<string>>({ value: entry.rawXml || null, loading: false, error: null });

  useEffect(() => {
    if (entry.rawXml) {
      setState({ value: entry.rawXml, loading: false, error: null });
      return;
    }
    if (!enabled) return;
    let alive = true;
    setState({ value: null, loading: true, error: null });
    fetchRawXml(entry.fileName)
      .then((value) => alive && setState({ value, loading: false, error: null }))
      .catch((e) => alive && setState({ value: null, loading: false, error: String(e.message || e) }));
    return () => {
      alive = false;
    };
  }, [entry.id, entry.fileName, entry.rawXml, enabled]);

  return state;
}
