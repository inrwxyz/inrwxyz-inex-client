@echo off
title Starting INEX CLIENT
echo Starting INEX CLIENT Windows Launcher...
call npm.cmd start
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo If npm script execution is disabled by Windows PowerShell ExecutionPolicy,
    echo run this launcher directly using:
    echo     npm.cmd start
    echo.
    pause
)
