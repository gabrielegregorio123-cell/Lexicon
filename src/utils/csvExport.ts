import { LexiconEntry } from '../types/lexicon';

function escapeCsvField(val: any): string {
  if (val === null || val === undefined) return '""';
  const str = String(val).replace(/"/g, '""');
  return `"${str}"`;
}

export function downloadFile(content: string, fileName: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportDatasetAsJSON(entries: LexiconEntry[]) {
  const jsonStr = JSON.stringify(entries, null, 2);
  downloadFile(jsonStr, `lares-lexicon-dataset-${new Date().toISOString().slice(0, 10)}.json`, 'application/json');
}

export function exportAncientSourcesCSV(sourcesList: Array<{ source: string; type: string; entries: string[]; count: number }>) {
  const headers = ['Source Citation', 'Source Type', 'Mention Count', 'Entries'];
  const rows = sourcesList.map((s) => [
    escapeCsvField(s.source),
    escapeCsvField(s.type),
    escapeCsvField(s.count),
    escapeCsvField(s.entries.join('; ')),
  ]);
  const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  downloadFile(csv, 'lares-indices-ancient-sources.csv', 'text/csv;charset=utf-8;');
}

export function exportRealmsCSV(realmsList: Array<{ type: string; subtype: string; term: string; entries: string[]; count: number }>) {
  const headers = ['Realm Type', 'Subtype', 'Specific Term', 'Count', 'Entries'];
  const rows = realmsList.map((r) => [
    escapeCsvField(r.type),
    escapeCsvField(r.subtype),
    escapeCsvField(r.term),
    escapeCsvField(r.count),
    escapeCsvField(r.entries.join('; ')),
  ]);
  const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  downloadFile(csv, 'lares-indices-realms.csv', 'text/csv;charset=utf-8;');
}

export function exportTermsCSV(termsList: Array<{ lemma: string; script: string; logeionUrl: string; entries: string[]; count: number }>) {
  const headers = ['Lemma', 'Script', 'Logeion URL', 'Count', 'Entries'];
  const rows = termsList.map((t) => [
    escapeCsvField(t.lemma),
    escapeCsvField(t.script),
    escapeCsvField(t.logeionUrl),
    escapeCsvField(t.count),
    escapeCsvField(t.entries.join('; ')),
  ]);
  const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  downloadFile(csv, 'lares-indices-terms.csv', 'text/csv;charset=utf-8;');
}

export function exportCharactersCSV(charList: Array<{ name: string; type: string; key: string; entries: string[]; count: number }>) {
  const headers = ['Character Name', 'Character Type', 'Canonical Key', 'Count', 'Entries'];
  const rows = charList.map((c) => [
    escapeCsvField(c.name),
    escapeCsvField(c.type),
    escapeCsvField(c.key),
    escapeCsvField(c.count),
    escapeCsvField(c.entries.join('; ')),
  ]);
  const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  downloadFile(csv, 'lares-indices-characters.csv', 'text/csv;charset=utf-8;');
}

export function exportHistoricalCSV(histList: Array<{ name: string; key: string; entries: string[]; count: number }>) {
  const headers = ['Historical Figure', 'Canonical Key', 'Count', 'Entries'];
  const rows = histList.map((h) => [
    escapeCsvField(h.name),
    escapeCsvField(h.key),
    escapeCsvField(h.count),
    escapeCsvField(h.entries.join('; ')),
  ]);
  const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  downloadFile(csv, 'lares-indices-historical-figures.csv', 'text/csv;charset=utf-8;');
}

export function exportPlacesCSV(placeList: Array<{ name: string; key: string; entries: string[]; count: number }>) {
  const headers = ['Place Name', 'Canonical Key', 'Count', 'Entries'];
  const rows = placeList.map((p) => [
    escapeCsvField(p.name),
    escapeCsvField(p.key),
    escapeCsvField(p.count),
    escapeCsvField(p.entries.join('; ')),
  ]);
  const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  downloadFile(csv, 'lares-indices-places.csv', 'text/csv;charset=utf-8;');
}

export function exportBibliographyCSV(biblList: Array<{ author: string; date: string; title: string; fullCitation: string; entries: string[] }>) {
  const headers = ['Author', 'Date', 'Title', 'Full Citation', 'Cited in Entries'];
  const rows = biblList.map((b) => [
    escapeCsvField(b.author),
    escapeCsvField(b.date),
    escapeCsvField(b.title),
    escapeCsvField(b.fullCitation),
    escapeCsvField(b.entries.join('; ')),
  ]);
  const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  downloadFile(csv, 'lares-bibliography.csv', 'text/csv;charset=utf-8;');
}
