import { writeFile, appendFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const repository = 'https://github.com/deepseek-ai/deepseek-harness.git';
const semver = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?$/;
export async function resolve({ fetchImpl = fetch, token, ownerRepo, runId, attempt = '1', now = new Date(), requestedVersion = '', force = false }) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(ownerRepo) || !/^\d+$/.test(runId) || !/^\d+$/.test(attempt)) throw new Error('Invalid resolver context');
  async function api(path, optional = false) {
    let response;
    try { response = await fetchImpl(`https://api.github.com/repos/${path}`, { signal: AbortSignal.timeout(30000), headers: { Accept: 'application/vnd.github+json', ...(token ? { Authorization: `Bearer ${token}` } : {}) } }); }
    catch { throw new Error('GitHub API request failed'); }
    if (optional && response.status === 404) return null;
    if (!response.ok) throw new Error(`GitHub API failed (${response.status})`);
    try { return await response.json(); } catch { throw new Error('Invalid GitHub API JSON'); }
  }
  const head = await api('deepseek-ai/deepseek-harness/commits/master');
  if (!/^[a-f0-9]{40}$/.test(head.sha)) throw new Error('Invalid upstream commit');
  async function manifest(path) {
    const file = await api(`deepseek-ai/deepseek-harness/contents/${path}?ref=${head.sha}`);
    try { return JSON.parse(Buffer.from(file.content, 'base64').toString('utf8')); } catch { throw new Error('Invalid upstream manifest'); }
  }
  const desktop = await manifest('apps/desktop/package.json');
  const root = await manifest('package.json');
  if (!semver.test(desktop.version)) throw new Error('Invalid product semver (build metadata unsupported)');
  const pnpm = /^pnpm@((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))(?:\+sha(?:224|256|384|512)\.[a-fA-F0-9]+)?$/.exec(root.packageManager);
  if (!pnpm) throw new Error('Invalid pnpm packageManager');
  const latest = await api(`${ownerRepo}/releases/latest`, true);
  let previous;
  if (latest) {
    if (latest.draft || latest.prerelease) throw new Error('Latest release is not published');
    const asset = latest.assets?.find(a => a.name === 'build-source.json');
    if (!asset || !Number.isSafeInteger(asset.id)) throw new Error('Published release lacks build-source.json');
    // Use authenticated API asset endpoint, never an arbitrary URL from release data.
    let response;
    try { response = await fetchImpl(`https://api.github.com/repos/${ownerRepo}/releases/assets/${asset.id}`, { signal: AbortSignal.timeout(30000), headers: { Accept: 'application/octet-stream', ...(token ? { Authorization: `Bearer ${token}` } : {}) } }); }
    catch { throw new Error('Release provenance request failed'); }
    if (!response.ok) throw new Error(`Release provenance failed (${response.status})`);
    try { previous = await response.json(); } catch { throw new Error('Invalid published provenance'); }
    if (previous.repository !== repository || !/^[a-f0-9]{40}$/.test(previous.commit)) throw new Error('Invalid published source identity');
  }
  const date = now.toISOString().slice(0, 10).replaceAll('-', '');
  const version = requestedVersion || `${desktop.version}.${date}.${runId}${attempt.padStart(3, '0')}`;
  if (!version.startsWith(`${desktop.version}.`) || !/^\d{8}\.\d+$/.test(version.slice(desktop.version.length + 1))) throw new Error('Invalid community version');
  return { changed: force || previous?.commit !== head.sha, metadata: { repository, commit: head.sha, productVersion: desktop.version, version, pnpm: pnpm[1], appId: 'com.leexiexie.dshdesktop' } };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await resolve({ token: process.env.GH_TOKEN, ownerRepo: process.env.GITHUB_REPOSITORY, runId: process.env.GITHUB_RUN_ID, attempt: process.env.GITHUB_RUN_ATTEMPT, requestedVersion: process.env.REQUESTED_VERSION, force: process.env.FORCE_BUILD === 'true' });
    console.log(`changed=${result.changed} commit=${result.metadata.commit} version=${result.metadata.version}`);
    await writeFile('upstream.json', JSON.stringify(result.metadata, null, 2) + '\n');
    await appendFile(process.env.GITHUB_OUTPUT, `changed=${result.changed}\nversion=${result.metadata.version}\npnpm=${result.metadata.pnpm}\n`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
