@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js не найден. Установите Node.js LTS с https://nodejs.org/
  pause
  exit /b 1
)
echo Запуск приложения «Мой бюджет»...
start "" "http://localhost:4173"
node server.mjs
pause
