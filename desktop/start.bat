@echo off
title Дневник питания
echo ============================================
echo   Дневник питания - Desktop
echo ============================================
echo.

cd /d "%~dp0.."

REM Check Python
python --version >/dev/null 2>&1
if errorlevel 1 (
    echo Python не найден! Установите Python 3.12+
    echo https://python.org/downloads/
    pause
    exit /b
)

REM Install dependencies on first run
if not exist "venv" (
    echo Первый запуск - устанавливаю зависимости...
    python -m venv venv
    call venv\Scripts\activate
    pip install -r requirements-desktop.txt
) else (
    call venv\Scripts\activate
)

echo.
echo Запускаю приложение...
python desktop/run.py

pause
