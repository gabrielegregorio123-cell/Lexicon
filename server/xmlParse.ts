import { DOMParser } from '@xmldom/xmldom';
import type { ParsedXml } from '../src/lib/validateEntry.ts';

/**
 * Strict XML parse for the server. xmldom throws on fatal errors and only
 * *warns* about things a browser rejects (e.g. unquoted attributes), so every
 * level counts as an error here to match what the editor's DOMParser reports.
 */
export function xmlParse(xml: string): ParsedXml {
  const errors: string[] = [];
  try {
    const doc = new DOMParser({ onError: (_level, msg) => errors.push(msg) }).parseFromString(xml, 'text/xml');
    return { doc: errors.length ? null : doc, errors };
  } catch (e: any) {
    return { doc: null, errors: [...errors, e?.message || 'XML non ben formato'].filter((v, i, a) => a.indexOf(v) === i) };
  }
}
