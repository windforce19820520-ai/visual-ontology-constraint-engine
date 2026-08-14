$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $repoRoot

$runtimeRoot = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies'
$nodeBin = Join-Path $runtimeRoot 'node\bin'
$fallbackBin = Join-Path $runtimeRoot 'bin\fallback'
if (Test-Path -LiteralPath $nodeBin) { $env:Path = "$nodeBin;$env:Path" }
if (Test-Path -LiteralPath $fallbackBin) { $env:Path = "$fallbackBin;$env:Path" }

Write-Host 'VOCE M9 Seedream real smoke'
Write-Host 'The API key is used only by this child process and is never written to disk.'

pnpm run build
if ($LASTEXITCODE -ne 0) { throw 'Build failed before credential input.' }

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

  node scripts/m9-seedream-smoke.mjs
  $exitCode = $LASTEXITCODE
} finally {
  Remove-Item Env:VOCE_SEEDREAM_API_KEY -ErrorAction SilentlyContinue
  $plainKey = $null
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($keyPointer)
}

Write-Host ''
Write-Host "M9 runner finished with exit code $exitCode."
exit $exitCode
