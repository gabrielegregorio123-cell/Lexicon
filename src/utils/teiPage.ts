import { kids, renderNodes, textOf } from './teiRender.ts';
import { endpoints } from './endpoints.ts';

export interface TeiPage {
  title: string;
  html: string;
}

const cache = new Map<string, Promise<TeiPage>>();

/** Loads a static TEI page from /pages (team, bibliography…) and renders its body to HTML. */
export function loadTeiPage(name: string): Promise<TeiPage> {
  let p = cache.get(name);
  if (!p) {
    p = (async () => {
      const res = await fetch(endpoints.page(name));
      if (!res.ok) throw new Error(`pages/${name}.xml (${res.status})`);
      const doc = new DOMParser().parseFromString((await res.text()).replace(/^[﻿\s]+/, ''), 'text/xml');
      const body = doc.getElementsByTagName('body')[0];
      const title = textOf(doc.getElementsByTagName('title')[0]);
      let n = 0;
      const html = renderNodes(kids(body), {
        entryId: name,
        entryTitle: title,
        sectionId: name,
        sectionHead: title,
        nextSpotId: () => `page-${name}-${++n}`,
      });
      return { title, html };
    })();
    p.catch(() => cache.delete(name));
    cache.set(name, p);
  }
  return p;
}
