"""
Minimal launcher that catches ALL errors including import failures.
This is the PyInstaller entry point.
"""
import sys
import os
import traceback

def main():
    try:
        print("Starting Nutrition Diary...")
        print(f"Python: {sys.version}")
        print(f"Frozen: {getattr(sys, 'frozen', False)}")
        if getattr(sys, 'frozen', False):
            print(f"MEIPASS: {sys._MEIPASS}")
            print(f"Executable: {sys.executable}")
        print()

        # Run app_exe as __main__ so its if-block executes
        import runpy
        runpy.run_module("app_exe", run_name="__main__", alter_sys=True)
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
