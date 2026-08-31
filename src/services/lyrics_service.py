# -*- coding: utf-8 -*-
import os
import requests
from typing import Optional, Dict

class LyricsService:
    LRCLIB_API = "https://lrclib.net/api/get"

    @classmethod
    def fetch_lyrics(cls, title: str, artist: str, album: str = "", duration: float = 0.0) -> Optional[Dict[str, str]]:
        """
        Fetches synced lyrics (.lrc) and plain lyrics.
        Returns dict with keys: 'synced', 'plain', or None if not found.
        """
        try:
            params = {
                "track_name": title,
                "artist_name": artist,
            }
            if album:
                params["album_name"] = album
            if duration > 0:
                params["duration"] = int(duration)

            headers = {
                "User-Agent": "SpotifyDJConverter/2.0"
            }

            resp = requests.get(cls.LRCLIB_API, params=params, headers=headers, timeout=5)
            if resp.status_code == 200:
                data = resp.json()
                return {
                    "synced": data.get("syncedLyrics") or "",
                    "plain": data.get("plainLyrics") or ""
                }
        except Exception:
            pass
        return None

    @classmethod
    def save_lrc_file(cls, audio_filepath: str, synced_lyrics: str) -> Optional[str]:
        """Saves a .lrc file next to the audio file if synced lyrics exist."""
        if not synced_lyrics:
            return None
        try:
            base, _ = os.path.splitext(audio_filepath)
            lrc_path = f"{base}.lrc"
            with open(lrc_path, "w", encoding="utf-8") as f:
                f.write(synced_lyrics)
            return lrc_path
        except Exception:
            return None
