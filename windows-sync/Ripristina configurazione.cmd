@echo off
echo Le chiavi salvate su questo Windows verranno rimosse. Il catalogo Gaia resta conservato.
choice /C SN /M "Continuare? S = Si, N = No"
if errorlevel 2 goto end
del "%LOCALAPPDATA%\GaiaSync\credentials.xml" 2>nul
call "%~dp0Configura.cmd"
:end
