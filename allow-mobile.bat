@echo off
setlocal enabledelayedexpansion
REM ============================================================
REM  AutoSafe - Allow mobile/phone access helper
REM  RUN THIS FILE AS ADMINISTRATOR (right-click -> Run as administrator)
REM  Adds Windows Firewall rules for the API and web client so
REM  phones/tablets on the same Wi-Fi can reach the app.
REM ============================================================
title AutoSafe - Allow Mobile Access

echo.
echo   Adding firewall rules for AutoSafe...
echo.

netsh advfirewall firewall delete rule name="AutoSafe API 4000" >nul 2>nul
netsh advfirewall firewall add rule name="AutoSafe API 4000" dir=in action=allow protocol=TCP localport=4000 profile=private,domain >nul 2>nul
if errorlevel 1 (
    echo   [X] Could not add rule for port 4000. Did you run as administrator?
) else (
    echo   [OK] Port 4000 opened (API)
)

netsh advfirewall firewall delete rule name="AutoSafe Client 5173" >nul 2>nul
netsh advfirewall firewall add rule name="AutoSafe Client 5173" dir=in action=allow protocol=TCP localport=5173 profile=private,domain >nul 2>nul
if errorlevel 1 (
    echo   [X] Could not add rule for port 5173. Did you run as administrator?
) else (
    echo   [OK] Port 5173 opened (Web client)
)

echo.
echo   Your PC's LAN IP address(es) for the phone browser:
echo.
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
    echo      http://%%a:5173
)
echo.
echo   On your phone (same Wi-Fi), open:  http://YOUR-LAN-IP:5173
echo   Example:  http://10.124.40.158:5173
echo.
echo   NOTE: For the phone's QR camera scanner to work, the phone must
echo   open the site over HTTPS (camera access requires a secure context).
echo   Dashboard, simulation, and notifications work over plain HTTP.
echo.
pause
