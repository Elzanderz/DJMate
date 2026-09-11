# -*- coding: utf-8 -*-
import os
import glob
import re
import struct
from typing import Dict, Any, Optional

class DJLiveMonitorService:
    """
    Monitors live playing track from external DJ software:
    - Serato DJ Pro/Lite (_Serato_/History/Sessions)
    - Rekordbox
    - VirtualDJ
    - Traktor
    """

    @classmethod
    def detect_active_dj_software(cls) -> Dict[str, Any]:
        appdata = os.environ.get('APPDATA', '')
        userprofile = os.environ.get('USERPROFILE', '')

        serato_dir = os.path.join(userprofile, 'Music', '_Serato_')
        rekordbox_dir = os.path.join(appdata, 'Pioneer', 'rekordbox')
        virtualdj_dir = os.path.join(userprofile, 'Documents', 'VirtualDJ')
        traktor_dirs = glob.glob(os.path.join(userprofile, 'Documents', 'Native Instruments', 'Traktor*'))

        return {
            'serato': os.path.exists(serato_dir),
            'rekordbox': os.path.exists(rekordbox_dir),
            'virtualdj': os.path.exists(virtualdj_dir),
            'traktor': len(traktor_dirs) > 0,
        }

    @classmethod
    def get_live_playing_track(cls) -> Dict[str, Any]:
        """
        Polls the most recently updated session file across installed DJ software.
        """
        userprofile = os.environ.get('USERPROFILE', '')
        candidates = []

        # 1. Check Rekordbox USBANLZ live analysis/playback
        appdata = os.environ.get('APPDATA', '')
        rb_pattern = os.path.join(appdata, 'Pioneer', 'rekordbox', 'share', 'PIONEER', 'USBANLZ', '**', 'ANLZ0000.DAT')
        rb_files = glob.glob(rb_pattern, recursive=True)
        if rb_files:
            rb_files.sort(key=os.path.getmtime, reverse=True)
            for f in rb_files[:5]:
                info = cls._parse_rekordbox_anlz(f)
                if info:
                    info['mtime'] = os.path.getmtime(f)
                    info['software'] = 'Rekordbox'
                    candidates.append(info)
                    break

        # 2. Check Serato live session
        serato_sessions = glob.glob(os.path.join(userprofile, 'Music', '_Serato_', 'History', 'Sessions', '*.session'))
        if serato_sessions:
            latest_session = max(serato_sessions, key=os.path.getmtime)
            track_info = cls._parse_serato_session(latest_session)
            if track_info:
                track_info['mtime'] = os.path.getmtime(latest_session)
                track_info['software'] = 'Serato DJ'
                candidates.append(track_info)

        # 3. Check VirtualDJ history
        vdj_m3us = glob.glob(os.path.join(userprofile, 'Documents', 'VirtualDJ', 'History', '*.m3u'))
        if vdj_m3us:
            latest_vdj = max(vdj_m3us, key=os.path.getmtime)
            track_info = cls._parse_vdj_m3u(latest_vdj)
            if track_info:
                track_info['mtime'] = os.path.getmtime(latest_vdj)
                track_info['software'] = 'VirtualDJ'
                candidates.append(track_info)

        if not candidates:
            return {'found': False, 'track': None}

        # Pick candidate with most recent mtime
        candidates.sort(key=lambda x: x.get('mtime', 0), reverse=True)
        winner = candidates[0]

        # Enrich with local library metadata (BPM, Camelot Key, genre) if available
        winner = cls._enrich_with_library(winner)
        return {'found': True, 'track': winner}

    @classmethod
    def _parse_serato_session(cls, filepath: str) -> Optional[Dict[str, Any]]:
        try:
            with open(filepath, 'rb') as f:
                data = f.read()

            # Serato session files contain UTF-16 BE or LE strings
            # Look for common tag fields like 'ttlk' (title), 'tart' (artist)
            decoded = data.decode('latin1', errors='ignore')
            # Extract plain text segments
            chunks = re.findall(r'[\x20-\x7E\u0E00-\u0E7F]{4,}', decoded)
            if chunks:
                return {
                    'title': chunks[-1],
                    'artist': chunks[-2] if len(chunks) > 1 else 'Live Deck',
                    'source': 'Serato Live Session'
                }
        except Exception:
            pass
        return None

    @classmethod
    def _parse_vdj_m3u(cls, filepath: str) -> Optional[Dict[str, Any]]:
        try:
            with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
                lines = [l.strip() for l in f if l.strip() and not l.startswith('#')]
            if lines:
                last_path = lines[-1]
                bn = os.path.splitext(os.path.basename(last_path))[0]
                parts = bn.split(' - ')
                if len(parts) >= 2:
                    return {'artist': parts[0].strip(), 'title': parts[1].strip(), 'filepath': last_path}
                return {'title': bn, 'artist': 'Live Deck', 'filepath': last_path}
        except Exception:
            pass
        return None

    @classmethod
    def _parse_rekordbox_anlz(cls, filepath: str) -> Optional[Dict[str, Any]]:
        try:
            with open(filepath, 'rb') as fp:
                d = fp.read()
            idx = d.find(b'PPTH')
            if idx != -1:
                header_len, total_len, str_len = struct.unpack('>III', d[idx+4:idx+16])
                raw_path = d[idx+16:idx+16+str_len].decode('utf-16-be', errors='ignore').strip('\x00').strip()
                if raw_path.startswith('?/') or raw_path.startswith('?\\'):
                    raw_path = raw_path[2:]
                filename = os.path.basename(raw_path)
                name_no_ext = os.path.splitext(filename)[0]
                parts = name_no_ext.split(' - ')
                artist = parts[0].strip() if len(parts) >= 2 else 'Live Deck'
                title = ' - '.join(parts[1:]).strip() if len(parts) >= 2 else name_no_ext
                return {
                    'title': title,
                    'artist': artist,
                    'filename': filename,
                    'raw_path': raw_path,
                    'source': 'Rekordbox Live Deck'
                }
        except Exception:
            pass
        return None

    @classmethod
    def _enrich_with_library(cls, track_info: Dict[str, Any]) -> Dict[str, Any]:
        """
        Attempts to match detected track with existing library to get BPM, Camelot Key, cues, etc.
        """
        try:
            from src.services.history_service import HistoryService
            library = HistoryService.get_history()
            if not library:
                return track_info

            t_title = track_info.get('title', '').lower().strip()
            t_artist = track_info.get('artist', '').lower().strip()

            best_match = None
            for item in library:
                item_title = item.get('title', '').lower().strip()
                item_artist = item.get('artist', '').lower().strip()

                # Exact match
                if item_title and (item_title == t_title or item_title in t_title or t_title in item_title):
                    if t_artist and ('live deck' in t_artist or item_artist == t_artist or item_artist in t_artist or t_artist in item_artist):
                        best_match = item
                        break
                    elif not best_match:
                        best_match = item

            if best_match:
                enriched = dict(best_match)
                # Keep live software marker
                enriched['software'] = track_info.get('software', 'DJ Software')
                enriched['live_source'] = True
                return enriched
        except Exception:
            pass

        # Default fallback key / bpm if not found
        if not track_info.get('bpm'):
            track_info['bpm'] = 128
        if not track_info.get('camelot'):
            track_info['camelot'] = '8A'
        return track_info

