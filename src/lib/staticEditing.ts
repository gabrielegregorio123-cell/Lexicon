/**
 * Editing on the static site (GitHub Pages): no server, no token.
 *
 * The editor works on the published XML in the browser. Work in progress is kept as a
 * draft in localStorage; publishing copies the XML and opens the file's edit page on
 * GitHub, where the editor pastes it and commits with their own GitHub account.
 */

const REPO = (import.meta.env.VITE_GITHUB_REPO as string | undefined) || 'gabrielegregorio123-cell/Lexicon';
const BRANCH = (import.meta.env.VITE_GITHUB_BRANCH as string | undefined) || 'main';
const DATA_PATH = ((import.meta.env.VITE_GITHUB_DATA_PATH as string | undefined) || 'public/data').replace(/^\/+|\/+$/g, '');

export const githubRepo = REPO;
export const githubEditUrl = (fileName: string) => `https://github.com/${REPO}/edit/${BRANCH}/${DATA_PATH}/${encodeURIComponent(fileName)}`;

export interface Draft {
  xml: string;
  /** XML the draft started from: tells whether the published file changed since. */
  base: string;
  savedAt: string;
}

const key = (fileName: string) => `lares_draft_${fileName}`;

export function loadDraft(fileName: string): Draft | null {
  try {
    const raw = localStorage.getItem(key(fileName));
    return raw ? (JSON.parse(raw) as Draft) : null;
  } catch {
    return null;
  }
}

export function saveDraft(fileName: string, draft: Omit<Draft, 'savedAt'>): boolean {
  try {
    localStorage.setItem(key(fileName), JSON.stringify({ ...draft, savedAt: new Date().toISOString() }));
    return true;
  } catch {
    return false;
  }
}

export function clearDraft(fileName: string) {
  try {
    localStorage.removeItem(key(fileName));
  } catch {
    /* nothing stored */
  }
}

/** File names that have a draft in this browser. */
export function draftFiles(): string[] {
  try {
    return Object.keys(localStorage)
      .filter((k) => k.startsWith('lares_draft_'))
      .map((k) => k.slice('lares_draft_'.length));
  } catch {
    return [];
  }
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
