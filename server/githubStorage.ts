/**
 * Persistence of the entry XML files on the project's GitHub repository.
 *
 * The app and its data live in ONE repository: entries are the files in
 * GITHUB_DATA_PATH (default `public/data`). Every save from the editor becomes
 * a single commit made through the Git Data API (tree + commit + ref update),
 * which is atomic, handles several files at once (entry + manifest) and needs
 * no per-file sha bookkeeping.
 *
 * Configuration (environment):
 *   GITHUB_REPO        "owner/name"  (enough to READ a public repository)
 *   GITHUB_TOKEN       fine-grained PAT, "Contents: Read and write" (needed to WRITE)
 *   GITHUB_BRANCH      default: the repository's default branch
 *   GITHUB_DATA_PATH   folder of the entries in the repo
 *                      (default "webapps/ROOT/content/xml/epidoc", the EFES layout of LARESproject/LARES)
 *
 * Without GITHUB_REPO the module is inactive and the server only uses the local disk.
 */

const API = 'https://api.github.com';

interface Config {
  token: string; // may be empty: read-only access to a public repository
  repo: string;
  branch: string;
  dataPath: string;
}

export interface FileChange {
  /** File name inside the data folder (e.g. `lexicon_agalma.xml`). */
  name: string;
  /** New content, or null to delete the file. */
  content: string | null;
}

function loadConfig(): Config | null {
  const token = process.env.GITHUB_TOKEN?.trim() || '';
  const repo = process.env.GITHUB_REPO?.trim();
  if (!repo) return null;
  return {
    token,
    repo,
    branch: process.env.GITHUB_BRANCH?.trim() || '', // empty = the repository's default branch
    dataPath: (process.env.GITHUB_DATA_PATH?.trim() || 'webapps/ROOT/content/xml/epidoc').replace(/^\/+|\/+$/g, ''),
  };
}

let defaultBranch: string | null = null;

/** Resolves the branch to use: GITHUB_BRANCH, else the repository's default branch (cached). */
async function resolved(cfg: Config): Promise<Config> {
  if (cfg.branch) return cfg;
  if (!defaultBranch) {
    const repo = await gh<{ default_branch: string }>(cfg, 'GET', '');
    defaultBranch = repo.default_branch || 'main';
  }
  return { ...cfg, branch: defaultBranch };
}

export function githubInfo(): { configured: boolean; canWrite: boolean; repo?: string; branch?: string; dataPath?: string } {
  const cfg = loadConfig();
  return cfg
    ? { configured: true, canWrite: Boolean(cfg.token), repo: cfg.repo, branch: cfg.branch || defaultBranch || '(predefinito)', dataPath: cfg.dataPath }
    : { configured: false, canWrite: false };
}

function headers(cfg: Config): Record<string, string> {
  return {
    ...(cfg.token ? { Authorization: `Bearer ${cfg.token}` } : {}),
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'lares-lexicon',
    'Content-Type': 'application/json',
  };
}

async function gh<T>(cfg: Config, method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}/repos/${cfg.repo}${url}`, {
    method,
    headers: headers(cfg),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text();
    const err = new Error(`GitHub ${method} ${url} → ${res.status}: ${detail.slice(0, 300)}`);
    (err as any).status = res.status;
    throw err;
  }
  return (await res.json()) as T;
}

/** Checks that the token can reach the repository and the branch exists. */
export async function testAccess(): Promise<{ ok: boolean; detail: string }> {
  const base = loadConfig();
  if (!base) return { ok: false, detail: 'GitHub non configurato' };
  try {
    const cfg = await resolved(base);
    const repo = await gh<{ full_name: string; private: boolean; permissions?: { push?: boolean } }>(cfg, 'GET', '');
    await gh(cfg, 'GET', `/git/ref/heads/${encodeURIComponent(cfg.branch)}`);
    if (repo.permissions && repo.permissions.push === false) {
      return { ok: false, detail: `${repo.full_name}: il token non ha permesso di scrittura` };
    }
    return { ok: true, detail: `${repo.full_name} · branch ${cfg.branch}` };
  } catch (e: any) {
    return { ok: false, detail: e.message || String(e) };
  }
}

/**
 * Commits the given changes in one commit. Retries once if the branch moved
 * in the meantime (non fast-forward).
 */
export async function commitChanges(changes: FileChange[], message: string): Promise<{ commit: string }> {
  const base = loadConfig();
  if (!base) throw new Error('GitHub non configurato');
  const cfg = await resolved(base);
  if (!cfg.token) throw new Error('GITHUB_TOKEN mancante: GitHub è configurato in sola lettura');
  if (changes.length === 0) throw new Error('Nessuna modifica da pubblicare');

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const ref = await gh<{ object: { sha: string } }>(cfg, 'GET', `/git/ref/heads/${encodeURIComponent(cfg.branch)}`);
      const parent = ref.object.sha;
      const parentCommit = await gh<{ tree: { sha: string } }>(cfg, 'GET', `/git/commits/${parent}`);

      const tree = await gh<{ sha: string }>(cfg, 'POST', '/git/trees', {
        base_tree: parentCommit.tree.sha,
        tree: changes.map((c) => ({
          path: `${cfg.dataPath}/${c.name}`,
          mode: '100644',
          type: 'blob',
          ...(c.content === null ? { sha: null } : { content: c.content }),
        })),
      });

      const commit = await gh<{ sha: string }>(cfg, 'POST', '/git/commits', {
        message,
        tree: tree.sha,
        parents: [parent],
      });

      await gh(cfg, 'PATCH', `/git/refs/heads/${encodeURIComponent(cfg.branch)}`, { sha: commit.sha, force: false });
      return { commit: commit.sha };
    } catch (e: any) {
      // 422 "not a fast forward": someone else committed in between — retry from the new tip.
      if (attempt === 0 && e.status === 422) continue;
      throw e;
    }
  }
  throw new Error('Commit GitHub non riuscito');
}

/**
 * Lists the entry files of the repository folder and hands each one to `write`.
 * Files are downloaded from raw.githubusercontent.com (no API rate limit, works
 * for public repositories without a token). Nothing is deleted here: the caller
 * decides what to do with files that disappeared from the repository.
 */
export async function pullData(
  accept: (name: string) => boolean,
  write: (name: string, content: string) => void
): Promise<{ pulled: number; remoteNames: string[]; listed: boolean }> {
  const configured = loadConfig();
  if (!configured) return { pulled: 0, remoteNames: [], listed: false };
  const cfg = await resolved(configured);

  let listing: Array<{ name: string; type: string }>;
  try {
    listing = await gh(cfg, 'GET', `/contents/${cfg.dataPath}?ref=${encodeURIComponent(cfg.branch)}`);
  } catch (e: any) {
    if (e.status === 404) return { pulled: 0, remoteNames: [], listed: false }; // folder not on the repo (yet)
    throw e;
  }

  const files = listing.filter((f) => f.type === 'file' && accept(f.name));
  const base = `https://raw.githubusercontent.com/${cfg.repo}/${encodeURIComponent(cfg.branch)}/${cfg.dataPath}`;
  let pulled = 0;
  const queue = [...files];
  const worker = async () => {
    for (let f = queue.shift(); f; f = queue.shift()) {
      const res = await fetch(`${base}/${encodeURIComponent(f.name)}`, { headers: cfg.token ? { Authorization: `token ${cfg.token}` } : {} });
      if (!res.ok) throw new Error(`Download di ${f.name} fallito (${res.status})`);
      write(f.name, await res.text());
      pulled++;
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  return { pulled, remoteNames: files.map((f) => f.name), listed: true };
}
