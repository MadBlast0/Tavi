@echo off
setlocal
title Tavi - app preview

rem Double-click this to start the app preview.
rem
rem It runs from this file's own folder rather than wherever you happened to
rem double-click from, which is the difference between working and a "cannot
rem find package.json" no matter where in Explorer you started it.

cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
    echo.
    echo   Node.js was not found on PATH.
    echo   Install Node.js, reopen this window, and try again.
    echo.
    pause
    exit /b 1
)

rem pnpm first, npm second.
rem
rem This repo ships package-lock.json, so npm is the package manager that
rem actually matches it and pnpm is a second-class citizen here - but the two
rem can share a node_modules folder well enough for this, and pnpm is faster
rem when it is there. Whichever answers first is the one that runs.

where pnpm >nul 2>&1
if errorlevel 1 (
    set "RUNNER=npm run tauri dev"
    set "PACKAGE_MANAGER=npm ^(pnpm was not found, so this uses npm^)"
) else (
    set "RUNNER=pnpm tauri dev"
    set "PACKAGE_MANAGER=pnpm"
)

rem Port 1420 is the Vite dev server the desktop app loads from. If something is
rem already listening on it, the app will quietly load whatever is already being
rem served there, or fail to connect - both of which look like a bug in the app
rem rather than a stale process. Worth catching before the stack trace.

netstat -ano | findstr ":1420" | findstr "LISTENING" >nul
if not errorlevel 1 (
    echo.
    echo   Port 1420 is already in use.
    echo.
    echo   Something is already serving the dev server - usually a preview that
    echo   was left running. Close that window, or stop it with Ctrl+C, then run
    echo   this again.
    echo.
    pause
    exit /b 1
)

echo.
echo   Starting the app preview  (%PACKAGE_MANAGER%)
echo.
echo   Keep this window open while you work. Press Ctrl+C to stop it.
echo.

%RUNNER%
set "EXITCODE=%errorlevel%"

rem The window has to stay open on failure. A double-clicked .bat that closes
rem the instant it fails shows the reader nothing at all, and a preview that
refuses to start with no explanation is worse than one that crashes visibly.

if not "%EXITCODE%"=="0" (
    echo.
    echo   The preview stopped with exit code %EXITCODE%.
    echo   The output above is why.
    echo.
    pause
)

exit /b %EXITCODE%