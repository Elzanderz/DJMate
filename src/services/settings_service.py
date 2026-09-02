# -*- coding: utf-8 -*-
import os
import sys
import json
import subprocess
from typing import Optional

class SettingsService:
    CONFIG_FILE = os.path.abspath(os.path.join(os.path.expanduser('~'), '.djmate_settings.json'))

    @classmethod
    def get_settings(cls) -> dict:
        if os.path.exists(cls.CONFIG_FILE):
            try:
                with open(cls.CONFIG_FILE, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except Exception:
                pass
        return {}

    @classmethod
    def save_settings(cls, settings: dict):
        try:
            with open(cls.CONFIG_FILE, 'w', encoding='utf-8') as f:
                json.dump(settings, f, ensure_ascii=False, indent=2)
        except Exception:
            pass

    @classmethod
    def get_output_dir(cls) -> str:
        settings = cls.get_settings()
        custom_dir = settings.get('output_dir', '').strip()
        if custom_dir and os.path.exists(custom_dir):
            return os.path.abspath(custom_dir)

        # Check existing downloads in project
        project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
        proj_downloads = os.path.join(project_root, 'downloads')
        if os.path.exists(proj_downloads) and len(os.listdir(proj_downloads)) > 0:
            return proj_downloads

        # Default to user's standard Music directory
        user_music = os.path.join(os.path.expanduser('~'), 'Music', 'DJMate_Music')
        os.makedirs(user_music, exist_ok=True)
        return user_music

    @classmethod
    def set_output_dir(cls, new_path: str) -> str:
        if not new_path or not new_path.strip():
            return cls.get_output_dir()
        
        expanded = os.path.expanduser(new_path.strip())
        path_abs = os.path.abspath(expanded)
        os.makedirs(path_abs, exist_ok=True)
        
        settings = cls.get_settings()
        settings['output_dir'] = path_abs
        cls.save_settings(settings)
        return path_abs

    @classmethod
    def browse_folder(cls, initial_dir: Optional[str] = None) -> Optional[str]:
        """Open native OS folder picker dialog."""
        initial = initial_dir or cls.get_output_dir()
        
        # 1. Try tkinter filedialog
        try:
            import tkinter as tk
            from tkinter import filedialog
            root = tk.Tk()
            root.withdraw()
            root.attributes('-topmost', True)
            selected = filedialog.askdirectory(
                initialdir=initial,
                title="Select Music / Download Folder"
            )
            root.destroy()
            if selected and selected.strip():
                return cls.set_output_dir(selected.strip())
        except Exception:
            pass

        # 2. Fallback for Windows PowerShell dialog
        if sys.platform == 'win32':
            try:
                ps_script = (
                    "[System.Reflection.Assembly]::LoadWithPartialName('System.windows.forms') | Out-Null; "
                    "$dialog = New-Object System.Windows.Forms.FolderBrowserDialog; "
                    f"$dialog.SelectedPath = '{initial.replace('/', chr(92))}'; "
                    "$dialog.Description = 'Select Music / Download Folder'; "
                    "if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $dialog.SelectedPath }"
                )
                res = subprocess.check_output(['powershell', '-Command', ps_script], text=True, timeout=30).strip()
                if res and os.path.exists(res):
                    return cls.set_output_dir(res)
            except Exception:
                pass

        # 3. Fallback for macOS AppleScript dialog
        elif sys.platform == 'darwin':
            try:
                as_script = 'POSIX path of (choose folder with prompt "Select Music / Download Folder")'
                res = subprocess.check_output(['osascript', '-e', as_script], text=True, timeout=30).strip()
                if res and os.path.exists(res):
                    return cls.set_output_dir(res)
            except Exception:
                pass

        return None
