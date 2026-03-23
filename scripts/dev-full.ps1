$ErrorActionPreference = 'Stop'

$nodeDir = 'C:\Program Files\nodejs'
$npmCmd = Join-Path $nodeDir 'npm.cmd'

if (-not (Test-Path $npmCmd)) {
  Write-Error "Node/npm introuvable dans $nodeDir. Installe Node.js LTS puis relance."
  exit 1
}

$env:Path = "$nodeDir;$env:Path"
& $npmCmd run dev:full
