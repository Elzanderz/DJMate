import sys
import os

# Add project root to sys.path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

def main():
    try:
        from src.ui.webview_app import run_app
        run_app()
    except Exception as e:
        print(f"Fallback to Native UI: {e}")
        from src.ui.app import SpotifyConverterApp
        app = SpotifyConverterApp()
        app.mainloop()

if __name__ == '__main__':
    main()
