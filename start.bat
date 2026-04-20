@echo off
cd /d "%~dp0"
echo מפעיל את RecompOS...
start "RecompOS Dev Server" cmd /k "npm run dev"
echo ממתין לאתחול השרת...
:wait
timeout /t 2 /nobreak > nul
curl -s http://localhost:3000 > nul 2>&1
if errorlevel 1 goto wait
start "" http://localhost:3000/dashboard
