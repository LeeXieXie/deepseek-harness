#requires -Version 7.0
[CmdletBinding()]
param(
    [string]$Version,
    [switch]$CheckOnly
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$Root = Split-Path $PSScriptRoot -Parent
$Pin = Get-Content (Join-Path $Root 'upstream.json') -Raw | ConvertFrom-Json
if (!$Version) { $Version = $Pin.version }
if ($Version -notmatch ('^' + [regex]::Escape($Pin.productVersion) + '\.\d{8}\.\d+$')) {
    throw 'Version must be PRODUCTVERSION.YYYYMMDD.SEQUENCE, with no reused release version.'
}
if (!$IsWindows -or [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture -ne 'X64') {
    throw 'A Windows x64 build host is required.'
}
function Invoke-Checked([string]$Command, [string[]]$Arguments) {
    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Command failed with exit code $LASTEXITCODE" }
}
$NodeVersion = & node -p 'process.versions.node'
if ($LASTEXITCODE -ne 0 -or [version]$NodeVersion -lt [version]'24.9.0' -or ([version]$NodeVersion).Major -ne 24) {
    throw 'Node 24.9+ (major 24) is required.'
}
$PnpmVersion = & pnpm --version
if ($LASTEXITCODE -ne 0 -or $PnpmVersion.Trim() -ne $Pin.pnpm) { throw "Install pnpm $($Pin.pnpm) first." }
# Every run owns a new checkout. Never write to the user's existing upstream clone.
$WorkRoot = Join-Path ([IO.Path]::GetPathRoot($Root)) 'dsh-build'
$Run = Join-Path $WorkRoot ([guid]::NewGuid().ToString('N').Substring(0, 8))
$Source = Join-Path $Run 'source'
$Config = Join-Path $Run 'config'
$Output = Join-Path $Root ('dist/' + $Version)
if (Test-Path $Output) { throw "Output already exists, refusing to overwrite: $Output" }
New-Item -ItemType Directory -Path "$Config/presets" -Force | Out-Null
Invoke-Checked git @('init', $Source)
Invoke-Checked git @('-C', $Source, 'remote', 'add', 'origin', $Pin.repository)
Invoke-Checked git @('-C', $Source, 'fetch', '--depth=1', 'origin', $Pin.commit)
Invoke-Checked git @('-C', $Source, '-c', 'core.longpaths=true', 'checkout', '--detach', 'FETCH_HEAD')
$Commit = & git -C $Source rev-parse HEAD
if ($LASTEXITCODE -ne 0 -or $Commit.Trim() -ne $Pin.commit) { throw 'Upstream commit mismatch.' }
$Manifest = Get-Content "$Source/apps/desktop/package.json" -Raw | ConvertFrom-Json
if ($Manifest.version -ne $Pin.productVersion) { throw 'Desktop version mismatch.' }
$UpstreamRoot = Get-Content "$Source/package.json" -Raw | ConvertFrom-Json
if ($UpstreamRoot.packageManager -notlike "pnpm@$($Pin.pnpm)*") { throw 'Upstream pnpm pin mismatch.' }
@"
DSH_DESKTOP_APP_ID=$($Pin.appId)
DSH_DESKTOP_AUTO_UPDATE_ENV=production
"@ | Set-Content "$Config/presets/production.env" -Encoding utf8NoBOM
Invoke-Checked node @((Join-Path $PSScriptRoot 'apply-community-patch.mjs'), $Source)
$PreviousConfig = $env:DSH_PACKAGING_CONFIG_DIR
$PreviousPreset = $env:DSH_PACKAGING_PRESET
try {
    $env:DSH_PACKAGING_CONFIG_DIR = $Config
    $env:DSH_PACKAGING_PRESET = 'production'
    Push-Location $Source
    try {
        Invoke-Checked pnpm @('install', '--frozen-lockfile')
        $PackageArgs = @('--dir', 'apps/desktop', 'run', 'package:win:x64', '--dir', '--unsigned', '--build-version', $Version)
        Invoke-Checked pnpm ($PackageArgs + @('--check'))
        if ($CheckOnly) { Write-Host 'Configuration/toolchain preflight passed. No application built.'; return }
        Invoke-Checked pnpm $PackageArgs
        Invoke-Checked pnpm @('run', 'build:check')
    } finally { Pop-Location }
} finally {
    $env:DSH_PACKAGING_CONFIG_DIR = $PreviousConfig
    $env:DSH_PACKAGING_PRESET = $PreviousPreset
}
$Application = Join-Path $Source 'apps/desktop/.desktop-build/targets/win-x64/unsigned-artifacts/win-unpacked'
$Required = @('DeepSeek Harness.exe', 'resources/app.asar', 'resources/app.asar.unpacked/dsh/node_modules',
    'resources/runtime/primary-runtime', 'resources/runtime/primary-runtime/dependencies/node/bin/node.exe')
foreach ($Path in $Required) {
    if (!(Test-Path (Join-Path $Application $Path))) { throw "Incomplete application: $Path" }
}
if (Test-Path "$Application/resources/app-update.yml") { throw 'Unexpected automatic update feed in unsigned package.' }
if (!(Get-ChildItem "$Application/resources/runtime/primary-runtime" -Recurse -File -Filter 'python.exe')) {
    throw 'Bundled Python missing.'
}
# Preserve every upstream file and notice, including nested licenses. Add attribution outside sealed resources.
Copy-Item "$Source/LICENSE" "$Application/LICENSE" -Force
$NoticeCandidates = @(Get-ChildItem $Application -Recurse -File | Where-Object { $_.Name -match '(?i)(license|notice|copying)' })
$NoticeText = @('Community unsigned build of DeepSeek Harness. Not an official DeepSeek release.',
    "Source: $($Pin.repository) @ $($Pin.commit)",
    'Upstream and third-party license files remain at their original paths. Electron notices are LICENSE.electron.txt and LICENSES.chromium.html when supplied.',
    '', 'Retained license and notice files:')
$NoticeText += $NoticeCandidates | ForEach-Object { [IO.Path]::GetRelativePath($Application, $_.FullName).Replace('\', '/') }
$NoticeText | Set-Content "$Application/THIRD_PARTY_NOTICES" -Encoding utf8NoBOM
$Record = [ordered]@{
    schemaVersion = 1; repository = $Pin.repository; commit = $Commit.Trim(); productVersion = $Pin.productVersion
    version = $Version; appId = $Pin.appId; platform = 'windows'; architecture = 'x64'; unsigned = $true
    automaticUpdates = $false; mandatoryUpdatePolicy = $false; upstreamDirty = $true
    communityPatch = 'community-unsigned-no-policy-v1'
    node = $NodeVersion.Trim(); pnpm = $PnpmVersion.Trim(); builtAt = [DateTime]::UtcNow.ToString('o')
    verification = 'Upstream package-target runtime/ASAR/payload/Host smoke and build:check passed. GUI/policy service acceptance not tested.'
}
$Record | ConvertTo-Json -Depth 10 | Set-Content "$Application/build-source.json" -Encoding utf8NoBOM
New-Item -ItemType Directory -Path $Output | Out-Null
$Archive = Join-Path $Output "dshdesktop-$Version-windows-x64.zip"
Add-Type -AssemblyName System.IO.Compression.FileSystem
[IO.Compression.ZipFile]::CreateFromDirectory($Application, $Archive, [IO.Compression.CompressionLevel]::Optimal, $false)
$Zip = [IO.Compression.ZipFile]::OpenRead($Archive)
try {
    $Names = @($Zip.Entries | ForEach-Object { $_.FullName.Replace('\', '/') })
    foreach ($Path in @('DeepSeek Harness.exe', 'resources/app.asar', 'LICENSE', 'THIRD_PARTY_NOTICES', 'build-source.json', 'resources/runtime/primary-runtime/dependencies/node/bin/node.exe')) {
        if ($Names -cnotcontains $Path) { throw "ZIP missing $Path" }
    }
    $Files = @(Get-ChildItem $Application -Recurse -File)
    if (@($Zip.Entries | Where-Object { !$_.FullName.EndsWith('/') }).Count -ne $Files.Count) { throw 'ZIP file count mismatch.' }
} finally { $Zip.Dispose() }
Copy-Item "$Application/build-source.json" $Output
Copy-Item "$Application/LICENSE" $Output
Copy-Item "$Application/THIRD_PARTY_NOTICES" $Output
$Hashes = Get-ChildItem $Output -File | Sort-Object Name | ForEach-Object {
    '{0}  {1}' -f (Get-FileHash $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant(), $_.Name
}
$Hashes | Set-Content "$Output/SHA256SUMS" -Encoding utf8NoBOM
Write-Host "Verified ZIP and SHA256SUMS: $Output"
