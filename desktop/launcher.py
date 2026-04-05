"""
Minimal launcher that catches ALL errors including import failures.
This is the PyInstaller entry point.
"""
import sys
import os
import traceback

def main():
    try:
        # Show console immediately
        print("Starting Nutrition Diary...")
        print(f"Python: {sys.version}")
        print(f"Frozen: {getattr(sys, 'frozen', False)}")
        if getattr(sys, 'frozen', False):
            print(f"MEIPASS: {sys._MEIPASS}")
            print(f"Executable: {sys.executable}")
        print()

        # Import and run the real app
        import app_exe
    except Exception as e:
        print(f"\n{'='*50}")
        print(f"FATAL ERROR: {e}")
        print(f"{'='*50}")
        traceback.print_exc()
        print()
        input("Press Enter to close...")
        sys.exit(1)

if __name__ == "__main__":
    main()
