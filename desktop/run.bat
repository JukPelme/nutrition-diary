@echo off
chcp 65001 >/dev/null 2>&1
title Nutrition Diary
echo Starting...
echo.

cd /d "%~dp0"
NutritionDiary.exe

echo.
echo ============================================
echo   Program exited with code: %errorlevel%
echo ============================================
pause
