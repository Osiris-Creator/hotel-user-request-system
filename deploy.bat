@echo off
REM Deploy script for Windows
REM Hotel User Request System - Auto Deploy

echo.
echo ====================================
echo   Hotel Request System Deployment
echo ====================================
echo.

REM Check if wrangler is installed
where wrangler >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Wrangler is not installed!
    echo Please run: npm install -g wrangler
    pause
    exit /b 1
)

echo [INFO] Deploying Worker (Backend)...
echo.
call wrangler deploy
if %errorlevel% neq 0 (
    echo [ERROR] Worker deployment failed!
    pause
    exit /b 1
)

echo.
echo [INFO] Deploying Pages (Frontend)...
echo.
call wrangler pages deploy public --project-name=hotel-request-ui
if %errorlevel% neq 0 (
    echo [ERROR] Pages deployment failed!
    pause
    exit /b 1
)

echo.
echo ====================================
echo   Deployment Completed Successfully!
echo ====================================
echo.
echo URLs:
echo   Worker: https://hotel-user-request-system.avanivacationclubsamui1.workers.dev
echo   Pages:  https://hotel-request-ui.pages.dev
echo.
pause
