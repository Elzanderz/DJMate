# -*- coding: utf-8 -*-
import os
import json
import time
from typing import List, Dict, Optional
from datetime import datetime

class ActivityService:
    """
    Activity & History Logging Service:
    Tracks downloads, studio upgrades, duplicate cleanups, USB/Rekordbox exports, and playback sessions.
    """
    _LOG_FILE_NAME = 'activity_history.json'

    @classmethod
    def _get_log_path(cls) -> str:
        from src.services.settings_service import SettingsService
        out_dir = SettingsService.get_output_dir()
        if not out_dir or not os.path.exists(out_dir):
            out_dir = os.path.join(os.path.expanduser('~'), 'Music', 'DJMate')
            os.makedirs(out_dir, exist_ok=True)
        return os.path.join(out_dir, cls._LOG_FILE_NAME)

    @classmethod
    def get_activities(cls, limit: int = 200) -> List[Dict]:
        """
        Retrieves recent activity records, sorted from newest to oldest.
        """
        log_path = cls._get_log_path()
        if not os.path.exists(log_path):
            return []
        try:
            with open(log_path, 'r', encoding='utf-8') as f:
                records = json.load(f)
                if isinstance(records, list):
                    records.sort(key=lambda x: x.get('timestamp', 0), reverse=True)
                    return records[:limit]
        except Exception as e:
            print(f"[ActivityService] Error loading activity history: {e}")
        return []

    @classmethod
    def log_activity(
        cls,
        category: str,
        title: str,
        description: str = '',
        details: Optional[Dict] = None
    ) -> Dict:
        """
        Appends a new activity record to persistent history.
        """
        log_path = cls._get_log_path()
        records = []
        if os.path.exists(log_path):
            try:
                with open(log_path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    if isinstance(data, list):
                        records = data
            except Exception:
                records = []

        now = time.time()
        record = {
            'id': f"act_{int(now * 1000)}",
            'timestamp': now,
            'datetime_str': datetime.fromtimestamp(now).strftime('%Y-%m-%d %H:%M:%S'),
            'category': category,
            'title': title,
            'description': description,
            'details': details or {}
        }

        records.insert(0, record)
        records = records[:500]

        try:
            with open(log_path, 'w', encoding='utf-8') as f:
                json.dump(records, f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"[ActivityService] Error writing activity history: {e}")

        return record

    @classmethod
    def clear_activities(cls) -> bool:
        """
        Clears all activity history.
        """
        log_path = cls._get_log_path()
        if os.path.exists(log_path):
            try:
                with open(log_path, 'w', encoding='utf-8') as f:
                    json.dump([], f)
                return True
            except Exception as e:
                print(f"[ActivityService] Error clearing activity history: {e}")
                return False
        return True
