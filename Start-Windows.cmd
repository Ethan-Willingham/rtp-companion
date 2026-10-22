@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js from https://nodejs.org, then reopen this file.
  pause
  exit /b 1
)
if not exist node_modules\electron\dist\electron.exe (
  echo Run npm ci and npm run assets once in this folder, then try again.
  echo For normal use, download the Windows installer from GitHub Releases instead.
  pause
  exit /b 1
)
call npm start
pause
