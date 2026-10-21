@echo off
setlocal
title Tavi - app preview

rem Double-click this to start the app preview.
rem
rem It runs from this file's own folder rather than wherever you happened to
rem double-click from, which is the difference between working and a "cannot
rem find package.json" no matter where in Explorer you started it.
rem
rem It starts everything there is to start:
rem
rem   - the Node server on 8787, which is what the browser talks to
rem   - Vite on 1420, which serves the frontend to both
rem   - the Tauri app itself, which reloads as you edit
rem   - a browser tab on http://localhost:1420, so the web target is there too
rem
rem The two servers are started by `pnpm dev`, which the Tauri command runs
rem before it builds the app, so there is one thing to stop and one window to
rem read the output from.

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

rem Two ports have to be free.
rem
rem 1420 is the Vite dev server that both the app and the browser load from.
rem 8787 is the Node server behind it, which is what answers /api. If either is
rem already listening, the preview will quietly use whatever is already there —
rem or fail to connect, and both of those look like a bug in the app rather
rem than a stale process. Worth catching before the stack trace.

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

netstat -ano | findstr ":8787" | findstr "LISTENING" >nul
if not errorlevel 1 (
    echo.
    echo   Port 8787 is already in use.
    echo.
    echo   That is the port the Node server answers /api on. Something is
    echo   already serving it - usually a preview that was left running. Close
    echo   that window, or stop it with Ctrl+C, then run this again.
    echo.
    pause
    exit /b 1
)

echo.
echo   Starting the app preview
echo.
echo   This starts the Node server, Vite and the Tauri app, and opens a
echo   browser tab on http://localhost:1420
echo.
echo   Keep this window open while you work. Press Ctrl+C to stop it.
echo.

rem The browser is opened by Vite, which opens it when the dev server is
rem ready rather than when this file is run - a tab opened before the server
rem is listening shows a connection error that looks like the app is broken.
rem
rem `pnpm dev:web` is what starts Vite, so the browser opens whichever of the
rem three commands is used: this one, `pnpm dev`, or `pnpm dev:web` on its own.

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