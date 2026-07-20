@echo off
rem Single-terminal launcher (BE + FE + sidecar) wrapper.
rem Delegates to dev-all.ps1 under PowerShell so cmd.exe users
rem can launch the suite with:    dev-all.cmd
rem
rem Press Ctrl+C in the PowerShell window to kill all 3 children.
cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -NoLogo -NoProfile -File "%~dp0dev-all.ps1"
endlocal