# Single terminal launcher: BE + FE + embedding sidecar
# Usage:  .\dev-all.ps1
# Stops: Ctrl+C or any other keypress.

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
if (-not $root -or $root -eq "") {
  $root = "C:\Users\indocyber\Desktop\agent\projects\baileys test"
}

Write-Host ""
Write-Host "dev-all launcher (BE + FE + embedding sidecar)" -ForegroundColor Cyan
Write-Host "project root: $root" -ForegroundColor Cyan
Write-Host ""

$BE_COLOR = "Yellow"
$FE_COLOR = "Magenta"
$SC_COLOR = "Cyan"

# Ensure data dir exists.
New-Item -ItemType Directory -Path (Join-Path $root "data") -Force | Out-Null

# === 1. Sidecar ===
Write-Host "[sidecar] starting on http://127.0.0.1:8765 ..." -ForegroundColor $SC_COLOR
$env:EMBED_SIDECAR_HOST = "127.0.0.1"
$env:EMBED_SIDECAR_PORT = "8765"
$sidecarScript = Join-Path $root "src\scripts\embed_sidecar.py"
# Build a fully-quoted command line that preserves the space in the path
# under both PowerShell parsing and cmd.exe /C parsing.
$sidecarCmd = "python " + '"' + $sidecarScript + '"'
$sidecar = Start-Process -FilePath "cmd.exe" `
  -ArgumentList "/D", $root, "/C", $sidecarCmd `
  -RedirectStandardOutput (Join-Path $root "data\sidecar.out.log") `
  -RedirectStandardError (Join-Path $root "data\sidecar.err.log") `
  -NoNewWindow -PassThru

# === 2. BE ===
Write-Host "[be] starting on http://127.0.0.1:3000 ..." -ForegroundColor $BE_COLOR
$be = Start-Process -FilePath "cmd.exe" `
  -ArgumentList "/c", "pnpm dev" `
  -WorkingDirectory $root `
  -NoNewWindow -PassThru

# === 3. FE ===
Write-Host "[fe] starting on http://localhost:5176 ..." -ForegroundColor $FE_COLOR
$fe = Start-Process -FilePath "cmd.exe" `
  -ArgumentList "/c", "pnpm dev" `
  -WorkingDirectory (Join-Path $root "frontend") `
  -NoNewWindow -PassThru

Write-Host ""
Write-Host "All 3 launched. Press any key to stop." -ForegroundColor Green
Write-Host "Open: http://localhost:5176" -ForegroundColor Green
Write-Host ""

# === Stream stdout from BE + FE via OutputDataReceived events ===
$be.BeginOutputReadLine()
$fe.BeginOutputReadLine()

Register-ObjectEvent -InputObject $be -EventName "OutputDataReceived" -Action {
  if ($EventArgs.Data) {
    Write-Host "[be] $($EventArgs.Data)" -ForegroundColor Yellow
  }
} | Out-Null

Register-ObjectEvent -InputObject $fe -EventName "OutputDataReceived" -Action {
  if ($EventArgs.Data) {
    Write-Host "[fe] $($EventArgs.Data)" -ForegroundColor Magenta
  }
} | Out-Null

# === Sidecar: tail the log file via a background job ===
$sidecarLog = Join-Path $root "data\sidecar.out.log"
$sidecarJob = Start-Job -ScriptBlock {
  param($logPath, $color)
  while (-not (Test-Path $logPath)) { Start-Sleep -Milliseconds 200 }
  Get-Content $logPath -Tail 50 -Wait | ForEach-Object {
    Write-Host "[sidecar] $_" -ForegroundColor $color
  }
} -ArgumentList $sidecarLog, $SC_COLOR

# === Watchdog: any-key stop + child-death surfacing ===
$running = $true
try {
  while ($running) {
    Start-Sleep -Seconds 2
    foreach ($proc in $be, $fe, $sidecar) {
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
  Stop-Job $sidecarJob -PassThru -ErrorAction SilentlyContinue | Remove-Job -Force -ErrorAction SilentlyContinue
  Get-Job | Where-Object { $_.Id -ne $sidecarJob.Id } | Stop-Job -ErrorAction SilentlyContinue | Remove-Job -Force -ErrorAction SilentlyContinue
  Get-EventSubscriber | Unregister-Event
  foreach ($proc in $be, $fe, $sidecar) {
    if (-not $proc.HasExited) {
      Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
    }
  }
  Write-Host "Done." -ForegroundColor Yellow
}
