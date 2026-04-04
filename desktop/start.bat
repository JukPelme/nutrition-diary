@echo off
chcp 65001 >nul 2>&1
title Nutrition Diary

cd /d "%~dp0\.."

echo ============================================
echo   Nutrition Diary - Desktop
echo ============================================
echo.

REM Check Python
where python >nul 2>&1
if errorlevel 1 (
    echo Python not found! Install Python 3.12+
    echo https://python.org/downloads/
    pause
    exit /b
)

REM Install dependencies on first run
if not exist "venv" (
    echo First run - installing dependencies...
    python -m venv venv
    call venv\Scripts\activate.bat
    pip install -r requirements-desktop.txt
) else (
    call venv\Scripts\activate.bat
)

REM Remove passlib if present (incompatible with bcrypt 4.1+)
pip uninstall passlib -y >nul 2>&1

echo.
echo Starting app...
python desktop\run.py

pause
