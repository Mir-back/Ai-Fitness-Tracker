$ErrorActionPreference = 'Stop'
$node = Get-Command node.exe -ErrorAction SilentlyContinue
if (-not $node) { throw 'Node.js 18 or newer is required. Install it from https://nodejs.org/' }
Write-Host 'Starting Forme Fitness at http://localhost:4173/' -ForegroundColor Green
node (Join-Path $PSScriptRoot 'server.mjs')
