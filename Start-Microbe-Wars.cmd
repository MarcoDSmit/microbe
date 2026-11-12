@echo off
setlocal
cd /d "%~dp0"
set "PORT=4182"
set "HOST=127.0.0.1"
where node >nul 2>nul
if errorlevel 1 (
  echo Microbe Wars requires Node.js 22.13 or later.
  pause
  exit /b 1
)
node scripts\build.mjs
if errorlevel 1 (
  pause
  exit /b 1
)
node server.mjs --open-browser
if errorlevel 1 pause
