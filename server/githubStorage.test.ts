import test from 'node:test';
import assert from 'node:assert/strict';

process.env.GITHUB_TOKEN = 'tkn';
process.env.GITHUB_REPO = 'owner/repo';
process.env.GITHUB_BRANCH = 'main';
process.env.GITHUB_DATA_PATH = 'public/data';

const { commitChanges, githubInfo } = await import('./githubStorage.ts');

type Call = { method: string; url: string; body: any };

function stubFetch(handler: (c: Call, n: number) => { status?: number; json: unknown }) {
  const calls: Call[] = [];
  globalThis.fetch = (async (url: string, init: any = {}) => {
    const call = { method: init.method || 'GET', url: String(url).replace('https://api.github.com/repos/owner/repo', ''), body: init.body ? JSON.parse(init.body) : undefined };
    calls.push(call);
    const r = handler(call, calls.length);
    const status = r.status ?? 200;
    return { ok: status < 400, status, json: async () => r.json, text: async () => JSON.stringify(r.json) } as Response;
  }) as typeof fetch;
  return calls;
}

const happy = (c: Call) => {
  if (c.method === 'GET' && c.url.startsWith('/git/ref/')) return { json: { object: { sha: 'parent1' } } };
  if (c.method === 'GET' && c.url.startsWith('/git/commits/')) return { json: { tree: { sha: 'tree0' } } };
  if (c.url === '/git/trees') return { json: { sha: 'tree1' } };
  if (c.url === '/git/commits') return { json: { sha: 'commit1' } };
  if (c.method === 'PATCH') return { json: {} };
  throw new Error(`unexpected ${c.method} ${c.url}`);
};

test('githubInfo reports the configured repository', () => {
  assert.deepEqual(githubInfo(), { configured: true, canWrite: true, repo: 'owner/repo', branch: 'main', dataPath: 'public/data' });
});

test('commitChanges builds one commit with the data path prefix and deletions as sha:null', async () => {
  const calls = stubFetch(happy);
  const res = await commitChanges(
    [
      { name: 'lexicon_a.xml', content: '<TEI/>' },
      { name: 'lexicon_b.xml', content: null },
    ],
    'msg'
  );
  assert.equal(res.commit, 'commit1');
  const tree = calls.find((c) => c.url === '/git/trees')!.body;
  assert.equal(tree.base_tree, 'tree0');
  assert.deepEqual(tree.tree[0], { path: 'public/data/lexicon_a.xml', mode: '100644', type: 'blob', content: '<TEI/>' });
  assert.deepEqual(tree.tree[1], { path: 'public/data/lexicon_b.xml', mode: '100644', type: 'blob', sha: null });
  const commit = calls.find((c) => c.url === '/git/commits' && c.method === 'POST')!.body;
  assert.deepEqual(commit.parents, ['parent1']);
  const patch = calls.find((c) => c.method === 'PATCH')!;
  assert.equal(patch.body.force, false);
});

test('commitChanges retries once when the branch moved (422)', async () => {
  let patches = 0;
  const calls = stubFetch((c) => {
    if (c.method === 'PATCH' && ++patches === 1) return { status: 422, json: { message: 'Update is not a fast forward' } };
    return happy(c);
  });
  const res = await commitChanges([{ name: 'lexicon_a.xml', content: 'x' }], 'msg');
  assert.equal(res.commit, 'commit1');
  assert.equal(calls.filter((c) => c.method === 'PATCH').length, 2);
});

test('commitChanges surfaces other GitHub errors', async () => {
  stubFetch(() => ({ status: 403, json: { message: 'Resource not accessible' } }));
  await assert.rejects(() => commitChanges([{ name: 'lexicon_a.xml', content: 'x' }], 'msg'), /403/);
});
