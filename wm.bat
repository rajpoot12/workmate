@echo off
REM WorkMemory AI — Windows launcher (requires WSL)
REM Double-click this file from Windows Desktop to start WorkMemory AI.
REM WSL (Windows Subsystem for Linux) must be installed: wsl --install

title WorkMemory AI
echo.
echo  =========================================
echo   WorkMemory AI — Starting...
echo  =========================================
echo.

REM Check WSL is available
where wsl >nul 2>&1
if errorlevel 1 (
    echo  ERROR: WSL not found.
    echo  Please install WSL first:
    echo    1. Open PowerShell as Administrator
    echo    2. Run: wsl --install
    echo    3. Restart your computer
    echo    4. Try again
    pause
    exit /b 1
)

REM Get the WSL path of this script's directory
for /f "delims=" %%i in ('wsl wslpath -u "%~dp0"') do set WSL_ROOT=%%i
REM Remove trailing slash
set WSL_ROOT=%WSL_ROOT:~0,-1%

echo  Starting services (database, backend, web)...
wsl bash -c "cd '%WSL_ROOT%' && ./wm.sh start"

echo.
echo  Opening WorkMemory AI in your browser...
timeout /t 4 /nobreak >nul
start http://localhost:5173

echo.
echo  WorkMemory AI is running.
echo  To stop it, run: wm.sh stop   (from WSL terminal)
echo.
pause
