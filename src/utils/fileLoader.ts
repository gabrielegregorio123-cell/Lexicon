import type { LexiconEntry, ParseReport } from '../types/lexicon.ts';
import { parseEpiDocXml } from './xmlParser.ts';

export async function processXmlFiles(
  files: Array<{ name: string; content: string }>,
  onProgress?: (processed: number, total: number) => void
): Promise<{ entries: LexiconEntry[]; report: ParseReport }> {
  const entries: LexiconEntry[] = [];
  const fileReports: ParseReport['files'] = [];
  const allUnknownTagsSet = new Set<string>();

  const total = files.length;
  for (let i = 0; i < total; i++) {
    const file = files[i];
    const { entry, error, unknownTags } = parseEpiDocXml(file.content, file.name);

    unknownTags.forEach((t) => allUnknownTagsSet.add(t));

    if (entry && !error) {
      entries.push(entry);
      fileReports.push({
        fileName: file.name,
        success: true,
        entryId: entry.id,
        title: entry.title,
        unknownTags,
      });
    } else {
      fileReports.push({
        fileName: file.name,
        success: false,
        error: error || 'Failed to parse XML',
        unknownTags,
      });
    }

    if (onProgress) {
      onProgress(i + 1, total);
    }
  }

  const report: ParseReport = {
    totalFiles: total,
    successCount: entries.length,
    failedCount: total - entries.length,
    files: fileReports,
    allUnknownTags: Array.from(allUnknownTagsSet).sort(),
  };

  return { entries, report };
}

/**
 * Loads every entry listed in /data/manifest.json. Data is fetched fresh on each
 * visit (the server sends no-store), so entries saved in the editor show up at once.
 */
export async function loadCorpus(
  onProgress?: (processed: number, total: number) => void
): Promise<{ entries: LexiconEntry[]; report: ParseReport; version?: string }> {
  // Preferred: one bundled, compressed, ETag-cached request served by the app server.
  try {
    const res = await fetch('/api/corpus', { cache: 'no-cache' });
    if (res.ok && (res.headers.get('content-type') || '').includes('json')) {
      const { entries: slim, failed, version } = (await res.json()) as {
        version: string;
        entries: LexiconEntry[];
        failed: Array<{ name: string; error: string }>;
      };
      // The server already parsed everything; only the running-text shortcut is rebuilt here.
      const entries = slim.map((e) => ({
        ...e,
        rawXml: '',
        sections: (e.editions.find((x) => x.lang === e.primaryLang) || e.editions[0])?.sections ?? [],
      }));
      onProgress?.(entries.length, entries.length);
      return {
        entries,
        version,
        report: {
          totalFiles: entries.length + failed.length,
          successCount: entries.length,
          failedCount: failed.length,
          files: [
            ...entries.map((e) => ({ fileName: e.fileName, success: true, entryId: e.id, title: e.title })),
            ...failed.map((f) => ({ fileName: f.name, success: false, error: f.error })),
          ],
          allUnknownTags: [],
        },
      };
    }
  } catch {
    /* fall back to the per-file loader below (static hosting) */
  }

  const manifestRes = await fetch(`/data/manifest.json?t=${Date.now()}`, { cache: 'no-store' });
  if (!manifestRes.ok) throw new Error(`manifest.json non raggiungibile (${manifestRes.status})`);
  const names: string[] = await manifestRes.json();

  let done = 0;
  const files = await Promise.all(
    names.map(async (name) => {
      try {
        const res = await fetch(`/data/${encodeURIComponent(name)}`, { cache: 'no-store' });
        if (!res.ok) return null;
        return { name, content: await res.text() };
      } catch {
        return null;
      } finally {
        onProgress?.(++done, names.length);
      }
    })
  );

  return processXmlFiles(files.filter((f): f is { name: string; content: string } => f !== null));
}
