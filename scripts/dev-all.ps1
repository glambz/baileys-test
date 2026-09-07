# Single terminal launcher: BE + FE + embedding sidecar
# Usage:  .\dev-all.ps1
# Stops: Ctrl+C or any other keypress.
#
# Monorepo layout (post-refactor 2026-07-23):
#   $root/apps/backend        - BE  (`pnpm dev` starts BE + sidecar)
#   $root/apps/frontend       - FE  (`pnpm dev`)
#   $root/apps/backend/runtime/inbox_logs - inbox markdown
#   $root/apps/backend/runtime/data      - sidecar log dir
#   $root/apps/backend/src/scripts/embed_sidecar.py - sidecar (started by pnpm dev)
#
# Each subprocess uses its own workdir so pnpm picks up the correct
# package.json + node_modules.

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
if (-not $root -or $root -eq "") {
  $root = "C:\Users\indocyber\Desktop\agent\projects\baileys test"
}

Write-Host ""
Write-Host "dev-all launcher (BE [with sidecar] + FE)" -ForegroundColor Cyan
Write-Host "project root: $root" -ForegroundColor Cyan
Write-Host ""
Write-Host "  apps/backend/pnpm dev   = concurrently: sidecar (cyan) + BE nodemon (yellow)" -ForegroundColor DarkGray
Write-Host "  apps/frontend/pnpm dev  = Vite (magenta)" -ForegroundColor DarkGray
Write-Host ""

$BE_COLOR = "Yellow"
$FE_COLOR = "Magenta"
$SC_COLOR = "Cyan"

$BE_DIR    = Join-Path $root "apps\backend"
$FE_DIR    = Join-Path $root "apps\frontend"
$SC_OUT    = Join-Path $BE_DIR "runtime\data\sidecar.out.log"
$SC_ERR    = Join-Path $BE_DIR "runtime\data\sidecar.err.log"

# Ensure runtime dirs exist.
New-Item -ItemType Directory -Path (Join-Path $BE_DIR "runtime\data") -Force | Out-Null

# === BE (which concurrently starts sidecar + BE) ===
Write-Host "[be + sidecar] starting on http://127.0.0.1:3000 (BE) and http://127.0.0.1:8765 (sidecar) ..." -ForegroundColor $BE_COLOR
$be = Start-Process -FilePath "cmd.exe" `
  -ArgumentList "/c", "pnpm dev" `
  -WorkingDirectory $BE_DIR `
  -NoNewWindow -PassThru

# === FE ===
# === 3. FE ===
Write-Host "[fe] starting on http://localhost:5176 ..." -ForegroundColor $FE_COLOR
$fe = Start-Process -FilePath "cmd.exe" `
  -ArgumentList "/c", "pnpm dev" `
  -WorkingDirectory $FE_DIR `
  -NoNewWindow -PassThru

Write-Host ""
Write-Host "All 3 launched. Press any key to stop." -ForegroundColor Green
Write-Host "Open: http://localhost:5176" -ForegroundColor Green
Write-Host ""

# === Stream stdout from BE (which contains BE + sidecar output via concurrently) + FE ===
$be.BeginOutputReadLine()
$fe.BeginOutputReadLine()

Register-ObjectEvent -InputObject $be -EventName "OutputDataReceived" -Action {
  if ($EventArgs.Data) {
    # concurrently prefixes each child's output with its name + tab.
    # Colour-code accordingly.
    $line = $EventArgs.Data
    if ($line -match '^\[sidecar\]\s') {
      Write-Host $line -ForegroundColor Cyan
    } elseif ($line -match '^\[be\]\s') {
      Write-Host $line -ForegroundColor Yellow
    } else {
      Write-Host "[be+sidecar] $line" -ForegroundColor Yellow
    }
  }
} | Out-Null

Register-ObjectEvent -InputObject $fe -EventName "OutputDataReceived" -Action {
  if ($EventArgs.Data) {
    Write-Host "[fe] $($EventArgs.Data)" -ForegroundColor Magenta
  }
} | Out-Null

# === Watchdog: any-key stop + child-death surfacing ===
$running = $true
try {
  while ($running) {
    Start-Sleep -Seconds 2
    foreach ($proc in $be, $fe) {
      if ($proc.HasExited -and $proc.ExitCode -ne 0) {
        Write-Host "[watchdog] process $($proc.Id) exited with code $($proc.ExitCode)" -ForegroundColor Red
      }
    }
    if ([Console]::KeyAvailable) {
      $k = [Console]::ReadKey($true)
      Write-Host ""
      Write-Host "Key pressed ($($k.Key)): shutting down." -ForegroundColor Yellow
      $running = $false
    }
  }
}
finally {
  Write-Host ""
  Write-Host "Shutting down..." -ForegroundColor Yellow
  Get-Job | Stop-Job -ErrorAction SilentlyContinue | Remove-Job -Force -ErrorAction SilentlyContinue
  Get-EventSubscriber | Unregister-Event
  foreach ($proc in $be, $fe) {
    if (-not $proc.HasExited) {
      Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
    }
  }
  Write-Host "Done." -ForegroundColor Yellow
}