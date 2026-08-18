$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $repoRoot

$runtimeRoot = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies'
$nodeBin = Join-Path $runtimeRoot 'node\bin'
$fallbackBin = Join-Path $runtimeRoot 'bin\fallback'
if (Test-Path -LiteralPath $nodeBin) { $env:Path = "$nodeBin;$env:Path" }
if (Test-Path -LiteralPath $fallbackBin) { $env:Path = "$fallbackBin;$env:Path" }

Write-Host 'VOCE RC.4 Seedream composition acceptance'
Write-Host 'Maximum paid calls: 3. No retries. The API key is used only by this child process.'

pnpm run build
if ($LASTEXITCODE -ne 0) { throw 'Build failed before credential input.' }

pnpm run rc4:composition:prepare
if ($LASTEXITCODE -ne 0) { throw 'Composition closure or local input preflight failed before credential input.' }

$secureKey = Read-Host 'Paste the complete ARK API key' -AsSecureString
$keyPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)

try {
  $plainKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($keyPointer)
  if ([string]::IsNullOrWhiteSpace($plainKey)) { throw 'API key was empty.' }

  $env:VOCE_SEEDREAM_API_KEY = $plainKey
  if ([string]::IsNullOrWhiteSpace($env:VOCE_SEEDREAM_ENDPOINT)) {
    $env:VOCE_SEEDREAM_ENDPOINT = 'https://ark.cn-beijing.volces.com/api/v3/images/generations'
  }
  if ([string]::IsNullOrWhiteSpace($env:VOCE_SEEDREAM_MODEL)) {
    $env:VOCE_SEEDREAM_MODEL = 'doubao-seedream-5-0-pro-260628'
  }

  node scripts/m9-seedream-smoke.mjs --composition-acceptance
  $exitCode = $LASTEXITCODE
} finally {
  Remove-Item Env:VOCE_SEEDREAM_API_KEY -ErrorAction SilentlyContinue
  $plainKey = $null
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($keyPointer)
}

Write-Host ''
Write-Host "RC.4 composition runner finished with exit code $exitCode."
exit $exitCode
