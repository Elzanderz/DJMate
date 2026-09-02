# -*- coding: utf-8 -*-
import os
import sqlite3
import json
import time
from typing import List, Dict, Optional

class DBService:
    """
    High-Performance Embedded SQLite Database Engine for DJmate:
    Provides sub-millisecond query execution, indexed lookups, and auto-migration from JSON.
    """

    @classmethod
    def get_db_path(cls, target_dir: Optional[str] = None) -> str:
        if target_dir and os.path.exists(target_dir):
            return os.path.abspath(os.path.join(target_dir, 'djmate_library.db'))
        try:
            from src.services.settings_service import SettingsService
            active_dir = SettingsService.get_output_dir()
            return os.path.abspath(os.path.join(active_dir, 'djmate_library.db'))
        except Exception:
            base = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', 'downloads'))
            os.makedirs(base, exist_ok=True)
            return os.path.join(base, 'djmate_library.db')

    @classmethod
    def get_connection(cls, target_dir: Optional[str] = None) -> sqlite3.Connection:
        db_path = cls.get_db_path(target_dir)
        os.makedirs(os.path.dirname(db_path), exist_ok=True)
        conn = sqlite3.connect(db_path, timeout=10.0)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA synchronous=NORMAL")
        cls._init_schema(conn)
        return conn

    @classmethod
    def _init_schema(cls, conn: sqlite3.Connection):
        conn.execute("""
            CREATE TABLE IF NOT EXISTS tracks (
                id TEXT PRIMARY KEY,
                filepath TEXT UNIQUE,
                title TEXT,
                artist TEXT,
                album TEXT,
                playlist_name TEXT,
                source TEXT,
                duration_ms INTEGER,
                cover_url TEXT,
                bpm REAL,
                camelot TEXT,
                key_name TEXT,
                color TEXT,
                genre TEXT,
                year TEXT,
                energy INTEGER,
                stars INTEGER,
                rating_255 INTEGER,
                bitrate_kbps INTEGER,
                size_mb REAL,
                raw_json TEXT,
                updated_at REAL
            )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_tracks_filepath ON tracks(filepath)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_tracks_playlist ON tracks(playlist_name)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_tracks_camelot ON tracks(camelot)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_tracks_bpm ON tracks(bpm)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_tracks_artist ON tracks(artist)")
        conn.commit()

    @classmethod
    def upsert_track(cls, track: Dict, target_dir: Optional[str] = None):
        if not track:
            return
        conn = cls.get_connection(target_dir)
        try:
            tid = str(track.get('id') or f"track_{int(time.time()*1000)}")
            fp = os.path.abspath(track.get('filepath', '')) if track.get('filepath') else None
            title = track.get('title', '')
            artist = track.get('artist', '')
            album = track.get('album', '')
            pname = track.get('playlist_name', '')
            source = track.get('source', '')
            dur = int(track.get('duration_ms') or 0)
            cover = track.get('cover_url', '')
            bpm = float(track.get('bpm') or 128.0)
            camelot = track.get('camelot', '8A')
            key_name = track.get('key_name', camelot)
            color = track.get('color', '#fb923c')
            genre = track.get('genre', '')
            year = str(track.get('year', ''))
            energy = int(track.get('energy') or 6)
            stars = int(track.get('stars') or 3)
            r255 = int(track.get('rating_255') or 153)
            bitrate = int(track.get('bitrate_kbps') or 320)
            size_mb = float(track.get('size_mb') or 0.0)
            raw_json = json.dumps(track, ensure_ascii=False)
            now = time.time()

            conn.execute("""
                INSERT INTO tracks (
                    id, filepath, title, artist, album, playlist_name, source,
                    duration_ms, cover_url, bpm, camelot, key_name, color,
                    genre, year, energy, stars, rating_255, bitrate_kbps, size_mb,
                    raw_json, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    filepath=excluded.filepath,
                    title=excluded.title,
                    artist=excluded.artist,
                    album=excluded.album,
                    playlist_name=excluded.playlist_name,
                    source=excluded.source,
                    duration_ms=excluded.duration_ms,
                    cover_url=excluded.cover_url,
                    bpm=excluded.bpm,
                    camelot=excluded.camelot,
                    key_name=excluded.key_name,
                    color=excluded.color,
                    genre=excluded.genre,
                    year=excluded.year,
                    energy=excluded.energy,
                    stars=excluded.stars,
                    rating_255=excluded.rating_255,
                    bitrate_kbps=excluded.bitrate_kbps,
                    size_mb=excluded.size_mb,
                    raw_json=excluded.raw_json,
                    updated_at=excluded.updated_at
            """, (
                tid, fp, title, artist, album, pname, source,
                dur, cover, bpm, camelot, key_name, color,
                genre, year, energy, stars, r255, bitrate, size_mb,
                raw_json, now
            ))
            conn.commit()
        finally:
            conn.close()

    @classmethod
    def get_all_tracks(cls, target_dir: Optional[str] = None) -> List[Dict]:
        conn = cls.get_connection(target_dir)
        try:
            cursor = conn.execute("SELECT raw_json FROM tracks ORDER BY updated_at DESC")
            rows = cursor.fetchall()
            tracks = []
            for r in rows:
                try:
                    tracks.append(json.loads(r['raw_json']))
                except Exception:
                    pass
            return tracks
        finally:
            conn.close()

    @classmethod
    def delete_track(cls, filepath: str, track_id: Optional[str] = None, target_dir: Optional[str] = None):
        conn = cls.get_connection(target_dir)
        try:
            if filepath:
                abs_fp = os.path.abspath(filepath)
                conn.execute("DELETE FROM tracks WHERE filepath = ? OR filepath = ?", (filepath, abs_fp))
            if track_id:
                conn.execute("DELETE FROM tracks WHERE id = ?", (str(track_id),))
            conn.commit()
        finally:
            conn.close()

    @classmethod
    def sync_from_json_if_needed(cls, json_file: str, target_dir: Optional[str] = None):
        """Auto-migrates existing library_history.json into SQLite DB on first run."""
        if not os.path.exists(json_file):
            return
        conn = cls.get_connection(target_dir)
        try:
            count = conn.execute("SELECT COUNT(*) as c FROM tracks").fetchone()['c']
            if count == 0:
                with open(json_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                if isinstance(data, list) and data:
                    for t in data:
                        cls.upsert_track(t, target_dir)
        except Exception as e:
            print(f"[DBService] Migration warning: {e}")
        finally:
            conn.close()
