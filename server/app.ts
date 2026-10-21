import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import compression from 'compression';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import { FILE_NAME_RE, validateEntryXml } from '../src/lib/validateEntry.ts';
import { Corpus } from './corpus.ts';
import { SearchService } from './search.ts';
import { commitChanges, githubInfo, pullData, testAccess } from './githubStorage.ts';
import { xmlParse } from './xmlParse.ts';

export interface AppConfig {
  /** Folder with the entry XML files. */
  dataDir: string;
  /** Folder with the built frontend (production). */
  distDir: string;
  production: boolean;
  /** Password of the editorial area. Empty: open in development, read-only in production. */
  editorToken: string;
  /** Minutes between GitHub pulls (0 = never). */
  pullIntervalMin: number;
  /** Where the sync bookkeeping is kept (outside the data folder). */
  stateFile: string;
  /** Previous versions of files are copied here before being overwritten or deleted. */
  backupDir: string;
  /** Attach the Vite dev server (development only). */
  vite: boolean;
}

export function configFromEnv(): AppConfig {
  const production = process.env.NODE_ENV === 'production';
  return {
    dataDir: path.resolve(process.env.DATA_DIR?.trim() || 'public/data'),
    distDir: path.resolve('dist'),
    production,
    editorToken: process.env.EDITOR_TOKEN?.trim() || '',
    pullIntervalMin: Number(process.env.GITHUB_PULL_INTERVAL_MIN ?? 5),
    stateFile: path.resolve(process.env.STATE_FILE?.trim() || '.lares-state.json'),
    backupDir: path.resolve(process.env.BACKUP_DIR?.trim() || '.lares-backups'),
    vite: !production,
  };
}

const MANIFEST = 'manifest.json';
const KEEP_BACKUPS = 10;
const AUTH_WINDOW_MS = 5 * 60_000;
const AUTH_MAX_FAILURES = 10;

type GithubResult = { status: 'disabled' } | { status: 'committed'; commit: string } | { status: 'failed'; error: string };

export async function createApp(cfg: AppConfig): Promise<{ app: Express; corpus: Corpus; close: () => void }> {
  fs.mkdirSync(cfg.dataDir, { recursive: true });
  const corpus = new Corpus(cfg.dataDir);
  const search = new SearchService(corpus);
  const closers: Array<() => void> = [];

  // ── Files ────────────────────────────────────────────────────────────────
  /** Write-then-rename: a crash can never leave a half-written XML file behind. */
  function atomicWrite(target: string, content: string) {
    const tmp = `${target}.tmp-${process.pid}-${Date.now()}`;
    fs.writeFileSync(tmp, content, 'utf-8');
    fs.renameSync(tmp, target);
  }

  function backup(name: string) {
    const src = path.join(cfg.dataDir, name);
    if (!fs.existsSync(src)) return;
    fs.mkdirSync(cfg.backupDir, { recursive: true });
    fs.copyFileSync(src, path.join(cfg.backupDir, `${name.replace(/\.xml$/, '')}.${new Date().toISOString().replace(/[:.]/g, '-')}.xml`));
    const mine = fs
      .readdirSync(cfg.backupDir)
      .filter((f) => f.startsWith(`${name.replace(/\.xml$/, '')}.`) && f.endsWith('.xml'))
      .sort();
    mine.slice(0, Math.max(0, mine.length - KEEP_BACKUPS)).forEach((f) => fs.rmSync(path.join(cfg.backupDir, f), { force: true }));
  }

  /** manifest.json is derived data, kept only for static hosting of the frontend. */
  function writeManifest(): string {
    const body = JSON.stringify(corpus.list(), null, 2) + '\n';
    const target = path.join(cfg.dataDir, MANIFEST);
    if (!fs.existsSync(target) || fs.readFileSync(target, 'utf-8') !== body) atomicWrite(target, body);
    return body;
  }

  // ── Sync bookkeeping (survives restarts, so a pull never overwrites unpublished work) ──
  const unpushed = new Set<string>();
  const knownRemote = new Set<string>();
  try {
    const saved = JSON.parse(fs.readFileSync(cfg.stateFile, 'utf-8'));
    (saved.unpushed || []).forEach((n: string) => unpushed.add(n));
    (saved.knownRemote || []).forEach((n: string) => knownRemote.add(n));
  } catch {
    /* first run */
  }
  const saveState = () => {
    try {
      fs.writeFileSync(cfg.stateFile, JSON.stringify({ unpushed: [...unpushed], knownRemote: [...knownRemote] }), 'utf-8');
    } catch (e) {
      console.warn('[state] non riesco a salvare lo stato di sincronizzazione:', (e as Error).message);
    }
  };

  // Writes are serialised so two saves never interleave their manifest/commit steps.
  let queue: Promise<unknown> = Promise.resolve();
  const serial = <T,>(job: () => Promise<T>): Promise<T> => {
    const run = queue.then(job, job);
    queue = run.catch(() => undefined);
    return run;
  };

  async function publish(changes: Array<{ name: string; content: string | null }>, message: string): Promise<GithubResult> {
    if (!githubInfo().canWrite) return { status: 'disabled' };
    try {
      const { commit } = await commitChanges(changes, message);
      changes.forEach((c) => {
        unpushed.delete(c.name);
        if (c.content === null) knownRemote.delete(c.name);
        else knownRemote.add(c.name);
      });
      saveState();
      return { status: 'committed', commit };
    } catch (e: any) {
      console.error('[github]', e.message || e);
      changes.forEach((c) => c.content !== null && unpushed.add(c.name));
      saveState();
      return { status: 'failed', error: e.message || String(e) };
    }
  }

  /**
   * Brings the local folder in line with the repository (like EFES's `git pull`).
   * Files never pushed are kept; a file is removed locally only if it was on the
   * repository before and is gone now.
   */
  async function syncFromGitHub(): Promise<{ pulled: number; changed: string[]; removed: string[] }> {
    const changed: string[] = [];
    const removed: string[] = [];
    const { pulled, remoteNames, listed } = await pullData(
      (name) => FILE_NAME_RE.test(name),
      (name, content) => {
        if (unpushed.has(name)) return;
        const target = path.join(cfg.dataDir, name);
        if (!fs.existsSync(target) || fs.readFileSync(target, 'utf-8') !== content) {
          atomicWrite(target, content);
          changed.push(name);
        }
      }
    );
    if (listed && remoteNames.length > 0) {
      const remote = new Set(remoteNames);
      for (const name of [...knownRemote]) {
        if (!remote.has(name) && !unpushed.has(name)) {
          fs.rmSync(path.join(cfg.dataDir, name), { force: true });
          removed.push(name);
        }
      }
      knownRemote.clear();
      remoteNames.forEach((n) => knownRemote.add(n));
      saveState();
    }
    if (changed.length || removed.length) {
      corpus.invalidate();
      writeManifest();
    }
    return { pulled, changed, removed };
  }

  // ── Auth ─────────────────────────────────────────────────────────────────
  const failures = new Map<string, { count: number; resetAt: number }>();
  const tokenOk = (provided: string) => {
    const a = crypto.createHash('sha256').update(provided).digest();
    const b = crypto.createHash('sha256').update(cfg.editorToken).digest();
    return crypto.timingSafeEqual(a, b);
  };

  /**
   * Writes need EDITOR_TOKEN. With none configured, editing is open only in
   * development; a production server without a token is read-only. Repeated wrong
   * tokens from one address are throttled.
   */
  function requireEditor(req: Request, res: Response, next: NextFunction) {
    if (!cfg.editorToken) {
      if (!cfg.production) return next();
      return res.status(403).json({ error: 'Modifica disattivata: imposta EDITOR_TOKEN sul server.' });
    }
    const ip = req.ip || 'unknown';
    const now = Date.now();
    const f = failures.get(ip);
    if (f && f.resetAt > now && f.count >= AUTH_MAX_FAILURES) {
      res.setHeader('Retry-After', String(Math.ceil((f.resetAt - now) / 1000)));
      return res.status(429).json({ error: 'Troppi tentativi: riprova tra qualche minuto.' });
    }
    const header = req.header('authorization') || '';
    const provided = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (provided && tokenOk(provided)) {
      failures.delete(ip);
      return next();
    }
    if (provided) {
      const cur = f && f.resetAt > now ? f : { count: 0, resetAt: now + AUTH_WINDOW_MS };
      cur.count++;
      failures.set(ip, cur);
    }
    return res.status(401).json({ error: 'Token editoriale mancante o non valido.' });
  }

  // ── App ──────────────────────────────────────────────────────────────────
  const app = express();
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    next();
  });
  app.use(compression());
  app.use(express.json({ limit: '2mb' }));

  // First sync from the repository, then a periodic one.
  if (githubInfo().configured) {
    const run = async (label: string) => {
      try {
        const r = await serial(() => syncFromGitHub());
        console.log(`[github] ${label}: ${r.pulled} file letti, ${r.changed.length} aggiornati, ${r.removed.length} rimossi`);
      } catch (e: any) {
        console.warn(`[github] ${label} fallita:`, e.message || e);
      }
    };
    await run('sincronizzazione iniziale');
    if (cfg.pullIntervalMin > 0) {
      const t = setInterval(() => void run('sincronizzazione periodica'), cfg.pullIntervalMin * 60_000);
      t.unref();
      closers.push(() => clearInterval(t));
    }
  }
  writeManifest();

  // Raw files (the editor and the XML view read these on demand).
  app.use('/data', express.static(cfg.dataDir, { etag: true, lastModified: false, setHeaders: (r) => r.setHeader('Cache-Control', 'no-cache') }));

  /** Sends a pre-serialised JSON body with an ETag, answering 304 when the client is up to date. */
  const sendCached = (req: Request, res: Response, version: string, json: string) => {
    const etag = `W/"${version}"`;
    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', 'no-cache');
    if (req.header('if-none-match') === etag) return res.status(304).end();
    res.type('application/json').send(json);
  };

  app.get('/api/corpus', (req, res) => {
    const { version, body } = corpus.bundle();
    sendCached(req, res, `corpus-${version}`, body);
  });

  /** Tiny endpoint clients poll to learn whether the corpus changed (a save, or a pull from GitHub). */
  app.get('/api/corpus/version', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ version: corpus.version() });
  });

  app.get('/api/search', (req, res) => {
    const q = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 200) : undefined);
    const collection = q(req.query.collection);
    const out = search.search(
      q(req.query.q) || '',
      {
        collection: collection === 'lexicon' || collection === 'chapter' ? collection : 'all',
        realm: q(req.query.realm),
        sourceType: q(req.query.sourceType),
        author: q(req.query.author),
        scriptType: q(req.query.scriptType),
      },
      q(req.query.lang)
    );
    res.setHeader('Cache-Control', 'no-store');
    res.json(out);
  });

  app.get('/api/entries/:id/body', (req, res) => {
    const b = corpus.body(String(req.params.id));
    if (!b) return res.status(404).json({ error: 'Scheda non trovata.' });
    sendCached(req, res, `body-${b.version}`, b.json);
  });

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, entries: corpus.list().length, uptime: Math.round(process.uptime()) });
  });

  app.get('/api/status', (_req, res) => {
    res.json({
      authRequired: Boolean(cfg.editorToken),
      editingEnabled: Boolean(cfg.editorToken) || !cfg.production,
      github: githubInfo(),
      entries: corpus.list().length,
    });
  });

  app.get('/api/auth', requireEditor, async (_req, res) => {
    const info = githubInfo();
    res.json({ ok: true, github: info, githubAccess: info.configured && info.canWrite ? await testAccess() : null });
  });

  app.put('/api/entries/:fileName', requireEditor, async (req, res) => {
    const fileName = String(req.params.fileName);
    const xml = typeof req.body?.xml === 'string' ? req.body.xml : '';
    const isNew = req.body?.isNew === true;
    if (!xml.trim()) return res.status(400).json({ error: 'XML vuoto.' });

    const issues = validateEntryXml(xml, { parse: xmlParse, fileName, lang: 'it' });
    if (issues.some((i) => i.level === 'error')) {
      return res.status(422).json({ error: 'La scheda contiene errori e non è stata salvata.', issues });
    }

    try {
      const result = await serial(async () => {
        const target = path.join(cfg.dataDir, fileName);
        const exists = fs.existsSync(target);
        if (isNew && exists) throw Object.assign(new Error(`Esiste già una scheda "${fileName}".`), { status: 409 });
        const content = xml.endsWith('\n') ? xml : `${xml}\n`;
        if (exists) backup(fileName);
        atomicWrite(target, content);
        corpus.invalidate(fileName);
        writeManifest();
        const github = await publish([{ name: fileName, content }], `${exists ? 'Update' : 'Add'} entry ${fileName}`);
        return { github };
      });
      res.json({ ok: true, fileName, issues, ...result });
    } catch (e: any) {
      res.status(e.status || 500).json({ error: e.message || 'Errore di salvataggio' });
    }
  });

  app.delete('/api/entries/:fileName', requireEditor, async (req, res) => {
    const fileName = String(req.params.fileName);
    if (!FILE_NAME_RE.test(fileName)) return res.status(400).json({ error: 'Nome file non valido.' });
    try {
      const result = await serial(async () => {
        const target = path.join(cfg.dataDir, fileName);
        if (!fs.existsSync(target)) throw Object.assign(new Error('Scheda non trovata.'), { status: 404 });
        backup(fileName);
        fs.unlinkSync(target);
        corpus.invalidate(fileName);
        writeManifest();
        const github = await publish([{ name: fileName, content: null }], `Remove entry ${fileName}`);
        return { github };
      });
      res.json({ ok: true, fileName, ...result });
    } catch (e: any) {
      res.status(e.status || 500).json({ error: e.message || 'Errore di eliminazione' });
    }
  });

  // Publishes every local entry in one commit (first seeding of the repository, or retry after a failure).
  app.post('/api/github/push-all', requireEditor, async (_req, res) => {
    if (!githubInfo().canWrite) return res.status(400).json({ error: 'GitHub non configurato per la scrittura (manca GITHUB_TOKEN).' });
    try {
      const github = await serial(async () => {
        const changes = corpus.list().map((name) => ({ name, content: fs.readFileSync(path.join(cfg.dataDir, name), 'utf-8') as string | null }));
        return publish(changes, `Sync ${changes.length} entries from LARES editor`);
      });
      res.json({ ok: github.status === 'committed', github });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/github/pull', requireEditor, async (_req, res) => {
    if (!githubInfo().configured) return res.status(400).json({ error: 'GitHub non configurato.' });
    try {
      const r = await serial(() => syncFromGitHub());
      res.json({ ok: true, ...r });
    } catch (e: any) {
      res.status(502).json({ error: e.message || String(e) });
    }
  });

  app.use('/api', (_req, res) => res.status(404).json({ error: 'Endpoint non trovato' }));

  if (cfg.production) {
    app.use(express.static(cfg.distDir, { maxAge: '1h', setHeaders: (r, p) => p.endsWith('index.html') && r.setHeader('Cache-Control', 'no-cache') }));
    app.get('*', (_req, res) => res.sendFile(path.join(cfg.distDir, 'index.html')));
  } else if (cfg.vite) {
    const { createServer } = await import('vite');
    const vite = await createServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
    closers.push(() => void vite.close());
  }

  // Last resort: never leak stack traces, never crash the process on a handler error.
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[server]', err);
    if (res.headersSent) return;
    res.status(err?.status || 500).json({ error: err?.type === 'entity.too.large' ? 'Richiesta troppo grande.' : 'Errore interno del server.' });
  });

  return {
    app,
    corpus,
    close: () => closers.forEach((c) => c()),
  };
}

/** Addresses on the local network, so a phone on the same Wi-Fi can open the site. */
export function lanUrls(port: number): string[] {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((i): i is os.NetworkInterfaceInfo => Boolean(i) && i!.family === 'IPv4' && !i!.internal)
    .map((i) => `http://${i.address}:${port}`);
}
