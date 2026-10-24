import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from './resolve-upstream.mjs';
const sha = 'a'.repeat(40);
function fixture({ version = '0.2.1-rc.3', manager = 'pnpm@11.28.5', previous = sha, status, network = false } = {}) {
  return async (url) => {
    if (network) throw new Error('secret-token raw credential error');
    if (status) return { ok: false, status };
    let data;
    if (url.endsWith('/commits/master')) data = { sha };
    else if (url.includes('/contents/')) {
      assert.ok(url.endsWith(`?ref=${sha}`));
      data = { content: Buffer.from(JSON.stringify(url.includes('apps/desktop') ? { version } : { packageManager: manager })).toString('base64') };
    } else if (url.endsWith('/releases/latest')) {
      if (previous === null) return { ok: false, status: 404 };
      data = { draft: false, prerelease: false, assets: [{ name: 'build-source.json', id: 17 }] };
    } else if (url.endsWith('/releases/assets/17')) data = { repository: 'https://github.com/deepseek-ai/deepseek-harness.git', commit: previous };
    else throw new Error('Unexpected URL');
    return { ok: true, status: 200, json: async () => data };
  };
}
const context = { ownerRepo: 'LeeXieXie/deepseek-harness', runId: '12345', attempt: '2', now: new Date('2026-10-24T00:00:00Z') };
const run = (options = {}, extra = {}) => resolve({ ...context, fetchImpl: fixture(options), ...extra });
test('unchanged published SHA skips', async () => assert.equal((await run()).changed, false));
test('new SHA rebuilds with immutable metadata', async () => {
  const result = await run({ previous: 'b'.repeat(40) });
  assert.equal(result.changed, true);
  assert.equal(result.metadata.commit, sha);
  assert.equal(result.metadata.version, '0.2.1-rc.3.20261024.12345002');
  assert.equal(result.metadata.appId, 'com.leexiexie.dshdesktop');
});
test('stable and prerelease supported', async () => {
  for (const version of ['1.2.3', '1.2.3-beta.1', '1.2.3-0']) assert.equal((await run({ version })).metadata.productVersion, version);
});
test('invalid versions fail closed', async () => {
  for (const version of ['01.2.3', '1.2', '1.2.3-01', '1.2.3;evil', '1.2.3+build']) await assert.rejects(run({ version }), /Invalid product/);
  await assert.rejects(run({}, { requestedVersion: 'other' }), /Invalid community/);
});
test('pnpm validation', async () => {
  for (const manager of ['npm@11.0.0', 'pnpm@latest', 'pnpm@11.2.3;evil']) await assert.rejects(run({ manager }), /Invalid pnpm/);
  assert.equal((await run({ manager: 'pnpm@11.2.3+sha512.abcdef' })).metadata.pnpm, '11.2.3');
});
test('first release and explicit force', async () => {
  assert.equal((await run({ previous: null })).changed, true);
  assert.equal((await run({}, { force: true })).changed, true);
});
test('API errors are sanitized and never treated as unchanged', async () => {
  for (const status of [401, 403, 429, 500]) await assert.rejects(run({ status }), new RegExp(`GitHub API failed \\(${status}\\)`));
  await assert.rejects(run({ network: true }), error => error.message === 'GitHub API request failed' && !error.message.includes('secret'));
});
test('invalid provenance fails closed', async () => await assert.rejects(run({ previous: 'invalid' }), /Invalid published/));
