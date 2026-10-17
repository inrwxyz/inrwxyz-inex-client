@echo off
title Building INEX CLIENT Windows Executable (.exe)
echo ========================================================
echo   INEX CLIENT - One-Click Windows .exe Builder
echo ========================================================
echo.
echo Step 1: Installing dependencies if needed...
call npm.cmd install
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] npm install failed. Make sure Node.js is installed.
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo Step 2: Running backend verification tests...
call node test\test-backend.js
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Verification test suite failed.
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo Step 3: Compiling standalone Windows .exe with electron-builder...
call npm.cmd run build:win
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Build failed.
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo ========================================================
echo   BUILD SUCCESSFUL!
echo   Your standalone Windows .exe is ready in:
echo   dist\INEX CLIENT Setup 1.0.0.exe
echo   dist\INEX CLIENT 1.0.0.exe
echo ========================================================
pause
