@echo off
chcp 65001 >nul 2>&1
title Build Nutrition Diary .exe

cd /d "%~dp0\.."

echo ============================================
echo   Building Nutrition Diary .exe
echo ============================================
echo.

REM Check Python
where python >nul 2>&1
if errorlevel 1 (
    echo Python not found! Need Python to build .exe
    pause
    exit /b
)

REM Create/activate build venv
if not exist "venv" (
    python -m venv venv
)
call venv\Scripts\activate.bat

echo Installing dependencies...
pip install -r requirements-desktop.txt >nul 2>&1
pip install pyinstaller >nul 2>&1
pip uninstall passlib -y >nul 2>&1

echo.
echo Building .exe (this takes 2-5 minutes)...
echo.
pyinstaller desktop\NutritionDiary.spec --noconfirm

if exist "dist\NutritionDiary\NutritionDiary.exe" (
    echo.
    echo ============================================
    echo   BUILD SUCCESSFUL!
    echo   Output: dist\NutritionDiary\
    echo   Run: dist\NutritionDiary\NutritionDiary.exe
    echo ============================================
    echo.
    echo Copy the entire dist\NutritionDiary\ folder
    echo to any PC - no Python needed!
) else (
    echo.
    echo BUILD FAILED. Check errors above.
)

pause
