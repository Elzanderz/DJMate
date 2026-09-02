@echo off
title DJmate - Pro DJ Suite
cd /d "%~dp0"

echo ===================================================
echo   Starting DJmate (Pro DJ Desktop Suite)
echo ===================================================

:: Auto-free port 1420 if previously occupied
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":1420" ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)
taskkill /F /IM "djmate.exe" >nul 2>&1
taskkill /F /IM "spotify-dj-converter.exe" >nul 2>&1

where npm >nul 2>&1
if %errorlevel% equ 0 (
    echo Launching Tauri v2 Desktop Studio...
    npm run tauri dev
    goto end
)

where py >nul 2>&1
if %errorlevel% equ 0 (
    echo Launching Python Engine...
    py main.py
    goto end
)

where python >nul 2>&1
if %errorlevel% equ 0 (
    echo Launching Python Engine...
    python main.py
    goto end
)

echo [ERROR] Required environment (Node / Python) not found.
pause

:end


