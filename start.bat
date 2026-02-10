@echo off
setlocal EnableDelayedExpansion

REM ============================================================================
REM Fix console encoding
REM ============================================================================
chcp 65001 >nul 2>&1

REM ============================================================================
REM Interactive LAN Game v0.0.1 - Server Launcher
REM ============================================================================
cd /d "%~dp0"

cls
echo.
echo ================================================================
echo              Interactive LAN Game v0.0.1
echo ================================================================
echo.

REM ============================================================================
REM Check if Node.js is installed
REM ============================================================================
echo [*] Checking Node.js installation...
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Node.js is not installed or not in PATH!
    echo.
    echo [!] Please install Node.js from: https://nodejs.org/
    echo.
    pause
    exit /b 1
)

REM Get Node.js version
for /f "tokens=*" %%i in ('node -v') do set NODE_VERSION=%%i
echo [OK] Node.js: %NODE_VERSION%
echo.

REM ============================================================================
REM Get Local IP Address
REM ============================================================================
echo [*] Detecting local network configuration...

set "LOCAL_IP="
set "LOCAL_HOST=http://localhost:3000"

REM Try to get IP from ipconfig
for /f "skip=1 tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
    set "ip_line=%%a"
    set "ip_line=!ip_line: =!"
    set "LOCAL_IP=!ip_line!"
)

REM Fallback if not found
if "%LOCAL_IP%"=="" (
    set "LOCAL_IP=192.168.1.100"
    echo [!] Using default IP: 192.168.1.100
) else (
    echo [OK] Local IP: %LOCAL_IP%
)

set "MOBILE_URL=http://%LOCAL_IP%:3000"
echo.

REM ============================================================================
REM Network information display
REM ============================================================================
echo ================================================================
echo                    NETWORK INFORMATION
echo ================================================================
echo.
echo   Host (Desktop):      %LOCAL_HOST%
echo   Mobile URL:          %MOBILE_URL%#/mobile
echo   Local IP:            %LOCAL_IP%
echo   Signalling Server:   ws://%LOCAL_IP%:9000
echo.
echo   Instructions:
echo.
echo     1. Open on HOST computer:
echo        %LOCAL_HOST%
echo.
echo     2. On MOBILE devices, scan QR code or use:
echo        %MOBILE_URL%#/mobile
echo.
echo ================================================================
echo.

REM ============================================================================
REM Free up ports 9000 and 3000
REM ============================================================================
echo [*] Checking ports 9000 and 3000...
set PORTS_FREED=0

REM Check port 9000
netstat -ano | findstr ":9000" >nul 2>&1
if %errorlevel% equ 0 (
    echo [!] Port 9000 is in use, freeing it...
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":9000"') do (
        taskkill /F /PID %%a >nul 2>&1
    )
    set PORTS_FREED=1
)

REM Check port 3000
netstat -ano | findstr ":3000" | findstr "LISTENING" >nul 2>&1
if %errorlevel% equ 0 (
    echo [!] Port 3000 is in use, freeing it...
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000" ^| findstr "LISTENING"') do (
        taskkill /F /PID %%a >nul 2>&1
    )
    set PORTS_FREED=1
)

if %PORTS_FREED% equ 1 (
    echo [OK] Ports freed
    timeout /t 1 /nobreak >nul
) else (
    echo [OK] Ports are available
)
echo.

REM ============================================================================
REM Check if node_modules exists
REM ============================================================================
if not exist "node_modules\" (
    echo [*] Installing dependencies...
    echo.
    call npm install
    echo.
    if %errorlevel% neq 0 (
        echo [ERROR] Failed to install dependencies!
        pause
        exit /b 1
    )
)

REM ============================================================================
REM Start servers
REM ============================================================================
echo [*] Starting servers (Signalling + Web)...
echo.
echo -------------------------------------------------------------------
echo.

title Interactive LAN Game - Servers

REM Run npm run start:all (signalling server + vite dev server)
call npm run start:all

REM ============================================================================
REM Server stopped
REM ============================================================================
echo.
echo ================================================================
echo                    SERVERS STOPPED
echo ================================================================
echo.
echo Press any key to close this window...
echo.

pause
