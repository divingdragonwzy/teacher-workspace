@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Please install Node.js 22.13 or later first.
  pause
  exit /b 1
)
if not exist "node_modules\vinext\package.json" (
  echo Dependencies are missing. Run npm install in this folder first.
  pause
  exit /b 1
)
node scripts\local-setup.mjs
if errorlevel 1 (
  echo Database initialization failed. Check the message above.
  pause
  exit /b 1
)
echo.
echo Open http://127.0.0.1:5173/ in your browser.
echo Keep this window open while using the app. Press Ctrl+C to stop.
echo.
node scripts\run-framework.mjs dev --host 127.0.0.1
pause
