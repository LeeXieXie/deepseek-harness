# DeepSeek Harness 0.2.1-rc.3.20261024.1

Naming update (2026-10-24): Scoop now uses the official Windows product name `DeepSeek Harness` for the Start Menu shortcut, matching the unchanged EXE product metadata. Package ID remains `dshdesktop`. Existing installs can close the app, run `scoop update`, `scoop uninstall dshdesktop` (without `--purge`), then `scoop install personal/dshdesktop` to replace the old Community-named shortcut. This same-version migration was verified with real Scoop install/uninstall commands. The original ZIP, version and SHA256 are unchanged.

Unofficial, unsigned Windows x64 portable build of DeepSeek Harness Desktop.
Not an official DeepSeek distribution. No signing certificate or official update service is used.

Pinned upstream: deepseek-ai/deepseek-harness@22ddee3792402c3e70ec5f86a63c3e3e895a2f60 (MIT).
Recipe: 45365945e905a0d67cc8af51b6a12a59a37d8a69.
Community patch: community-unsigned-no-policy-v1, omits optional update-policy metadata for unsigned builds only. Authentication, sandbox, runtime inventory and integrity checks are unchanged. Use Scoop for updates.

Validation observed:
- Complete upstream Windows packaging, runtime inventory, ASAR/payload/ConPTY/Host smoke and build:check passed in build job 40065258134.
- ZIP and all published file SHA256 checks passed during recovery job 40066861865.
- ZIP independently downloaded, hash verified and extracted on a Windows x64 workstation.
- Real desktop process launched in isolated DSH_HOME/user-data-dir, a responding DeepSeek Harness window and local Host were observed without fatal startup diagnostic.

Limitations:
- Screenshot capture did not reliably isolate the target Electron window, so visual UI correctness is not claimed.
- Startup emitted a nonfatal missing mandatory-status IPC handler warning in this unsigned no-policy mode.
- No account sign-in, model/API task, computer-use or end-to-end interactive session was tested.
- Native application title remains DeepSeek Harness, with upstream local-build identification. Unsigned community binaries may trigger SmartScreen. Do not disable security protection.

The ZIP contains the full bundled runtime, license files and build-source.json. Configuration remains in the upstream user-data locations. Do not run this community build concurrently with an official installation sharing the same configuration.
