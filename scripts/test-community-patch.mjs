import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const script = fileURLToPath(new URL('./apply-community-patch.mjs', import.meta.url))
const root = mkdtempSync(join(tmpdir(), 'dsh-community-patch-'))
const files = [
  ['apps/desktop/scripts/electron-builder-config.mjs',
    'const policy = packagesMacOS && unsigned ? undefined : resolveDesktopPolicyEnvironment(env)'],
  ['apps/desktop/scripts/desktop-package-environment.mjs',
    "if (target.platform !== 'darwin' || !options.unsigned) resolveDesktopPolicyEnvironment(environment)"],
]
for (const [name, text] of files) {
  const path = join(root, name)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, text + '\n')
}
execFileSync(process.execPath, [script, root, '--check'])
assert.equal(readFileSync(join(root, files[0][0]), 'utf8'), files[0][1] + '\n')
execFileSync(process.execPath, [script, root])
assert.match(readFileSync(join(root, files[0][0]), 'utf8'), /const policy = unsigned \? undefined : resolveDesktopPolicyEnvironment\(env\)/)
assert.match(readFileSync(join(root, files[1][0]), 'utf8'), /if \(!options.unsigned\) resolveDesktopPolicyEnvironment\(environment\)/)
assert.throws(() => execFileSync(process.execPath, [script, root], { stdio: 'pipe' }))
console.log('PASS: exact preimages validated before writes, unsigned-only policy adaptation, duplicate patch rejected')
