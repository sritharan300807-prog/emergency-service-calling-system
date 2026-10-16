@echo off
setlocal enabledelayedexpansion
REM ============================================================
REM  AutoSafe - Emergency Calling System - One-click launcher
REM  Starts the server which serves both API + the web app.
REM ============================================================

set "ROOT=%~dp0"
cd /d "%ROOT%"

echo [AutoSafe] Checking Node.js...
where node >nul 2>nul
if errorlevel 1 (
    echo [AutoSafe] node not on PATH - trying known locations...
    if exist "C:\Program Files\nodejs\node.exe" (
        set "PATH=C:\Program Files\nodejs;%PATH%"
    ) else if exist "%ProgramFiles(x86)%\nodejs\node.exe" (
        set "PATH=%ProgramFiles(x86)%\nodejs;%PATH%"
    ) else if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" (
        set "PATH=%LOCALAPPDATA%\Programs\nodejs;%PATH%"
    ) else (
        echo ERROR: Node.js not found. Install Node.js LTS from https://nodejs.org
        pause
        exit /b 1
    )
)
for /f "delims=" %%v in ('node -v 2^>nul') do set "NODEV=%%v"
echo [AutoSafe] Node %NODEV% detected.

REM ---- Install dependencies if not already installed ----
if not exist "%ROOT%server\node_modules" (
    echo [AutoSafe] Installing server dependencies...
    pushd "%ROOT%server"
    call npm install
    popd
)
if not exist "%ROOT%client\node_modules" (
    echo [AutoSafe] Installing client dependencies...
    pushd "%ROOT%client"
    call npm install
    popd
)

REM ---- Build the React client if dist is missing ----
if not exist "%ROOT%client\dist\index.html" (
    echo [AutoSafe] Building production client...
    pushd "%ROOT%client"
    call npm run build
    popd
)

REM ---- Seed the database on first run (idempotent) ----
echo [AutoSafe] Seeding database (idempotent)...
pushd "%ROOT%server"
call npx tsx src/seed.ts
popd

REM ---- Start the server (serves API + the web app on one port) ----
echo [AutoSafe] Starting server on http://localhost:4000 ...
start "AutoSafe Server" cmd /k "cd /d "%ROOT%server" && npm run dev"

echo.
echo ============================================================
echo   AutoSafe is running!
echo     http://localhost:4000
echo.
echo   Keep the new terminal window open.
echo ============================================================
echo.
echo Press any key to close this launcher window.
pause >nul
