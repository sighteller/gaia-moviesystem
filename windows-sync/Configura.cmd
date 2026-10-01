@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Gaia-Sync.ps1" -Verify
if errorlevel 1 goto end
echo.
echo Vuoi attivare gli aggiornamenti automatici settimanali?
choice /C SN /M "S = Si, N = No"
if errorlevel 2 goto end
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Gaia-Sync.ps1" -Install
:end
pause
