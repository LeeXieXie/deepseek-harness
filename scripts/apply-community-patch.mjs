import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = resolve(process.argv[2] ?? (() => { throw new Error('Pass the owned upstream checkout path') })())
const patches = [
  ['apps/desktop/scripts/electron-builder-config.mjs',
    "const policy = packagesMacOS && unsigned ? undefined : resolveDesktopPolicyEnvironment(env)",
    "const policy = unsigned ? undefined : resolveDesktopPolicyEnvironment(env)"],
  ['apps/desktop/scripts/desktop-package-environment.mjs',
    "if (target.platform !== 'darwin' || !options.unsigned) resolveDesktopPolicyEnvironment(environment)",
    "if (!options.unsigned) resolveDesktopPolicyEnvironment(environment)"],
]
// Validate every exact preimage before writing any file. Signed builds keep upstream policy.
const edits = patches.map(([file, before, after]) => {
  const path = resolve(source, file)
  const text = readFileSync(path, 'utf8')
  if (text.split(before).length !== 2) throw new Error(`Patch preimage mismatch: ${file}`)
  return { path, text: text.replace(before, after) }
})
if (!process.argv.includes('--check')) {
  for (const edit of edits) writeFileSync(edit.path, edit.text)
}
console.log(`${process.argv.includes('--check') ? 'Validated' : 'Applied'} community-unsigned-no-policy-v1: unsigned only, no authentication or integrity changes`)
