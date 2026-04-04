#!/bin/bash
echo "============================================"
echo "  Дневник питания - Desktop"
echo "============================================"

cd "$(dirname "$0")/.."

# Check Python
if ! command -v python3 &> /dev/null; then
    echo "Python3 не найден! Установите Python 3.12+"
    exit 1
fi

# Create venv on first run
if [ ! -d "venv" ]; then
    echo "Первый запуск — устанавливаю зависимости..."
    python3 -m venv venv
    source venv/bin/activate
    pip install -r requirements-desktop.txt
else
    source venv/bin/activate
fi

echo ""
echo "Запускаю приложение..."
python desktop/run.py
