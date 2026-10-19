@echo off
setlocal
title Tavi - app preview

rem Double-click this to start the app preview.
rem
rem It runs from this file's own folder rather than wherever you happened to
rem double-click from, which is the difference between working and a "cannot
rem find package.json" no matter where in Explorer you started it.

cd /d "%~dp0"

rem pnpm only, and no fallback to npm.
rem
rem There used to be one, and it was wrong. This repo used to ship a
rem package-lock.json, so npm and pnpm agreed on the same tree and falling
rem back was harmless. That lockfile is gone: the tree now lives in
rem pnpm-lock.yaml, and an npm install would resolve a different set of
rem versions from the registry and put it in node_modules without saying so.
rem The app would still start, which is the problem - it would just be
rem running against dependencies nobody else has, and the first symptom
rem would be a bug report about something that is not really broken.
rem
rem So: pnpm, or nothing. If you do not have it: npm install -g --allow-scripts=pnpm pnpm
rem The --allow-scripts flag is not optional on npm 12. It blocks install
rem scripts by default, and pnpm's own setup is one, so without it the
rem command appears to succeed and then prints nothing when run.

where pnpm >nul 2>&1
if errorlevel 1 (
    echo.
    echo   pnpm was not found on PATH.
    echo.
    echo   This project uses pnpm. To install it, run:
    echo.
    echo       npm install -g --allow-scripts=pnpm pnpm
    echo.
    echo   --allow-scripts is required: npm 12 blocks install scripts by
    echo   default, and without it pnpm installs but does not work.
    echo.
    pause
    exit /b 1
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
echo   Starting the app preview
echo.
echo   Keep this window open while you work. Press Ctrl+C to stop it.
echo.

pnpm tauri dev
set "EXITCODE=%errorlevel%"

rem The window has to stay open on failure. A double-clicked .bat that closes
rem the instant it fails shows the reader nothing at all, and a preview that
rem refuses to start with no explanation is worse than one that crashes visibly.

if not "%EXITCODE%"=="0" (
    echo.
    echo   The preview stopped with exit code %EXITCODE%.
    echo   The output above is why.
    echo.
    pause
)

exit /b %EXITCODE%