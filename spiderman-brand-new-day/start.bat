@echo off
title Spider-Man Brand New Day
cd /d "%~dp0"

echo Installing dependencies if needed...
call npm install --silent

echo.
echo Starting server (port 3000 is often blocked — using 3847+)...
echo.

set PORT=3847
set HOST=0.0.0.0

start "" cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:3847"

node server.js
pause
