# -*- coding: utf-8 -*-
import os
import re
import json
import time
from typing import List, Dict, Optional

CAMELOT_COLORS = {
    '1A': '#2dd4bf', '1B': '#14b8a6',
    '2A': '#38bdf8', '2B': '#0ea5e9',
    '3A': '#60a5fa', '3B': '#3b82f6',
    '4A': '#a78bfa', '4B': '#8b5cf6',
    '5A': '#c084fc', '5B': '#a855f7',
    '6A': '#f472b6', '6B': '#ec4899',
    '7A': '#fb7185', '7B': '#f43f5e',
    '8A': '#fb923c', '8B': '#f97316',
    '9A': '#facc15', '9B': '#eab308',
    '10A': '#a3e635', '10B': '#84cc16',
    '11A': '#4ade80', '11B': '#22c55e',
    '12A': '#34d399', '12B': '#10b981',
}

class HistoryService:
    @classmethod
    def get_db_file(cls, target_dir: Optional[str] = None) -> str:
        if target_dir and os.path.exists(target_dir):
            return os.path.abspath(os.path.join(target_dir, 'library_history.json'))
        try:
            from src.services.settings_service import SettingsService
            active_dir = SettingsService.get_output_dir()
            return os.path.abspath(os.path.join(active_dir, 'library_history.json'))
        except Exception:
            return os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', 'downloads', 'library_history.json'))

    @classmethod
    def _ensure_db(cls, target_dir: Optional[str] = None):
        db_file = cls.get_db_file(target_dir)
        os.makedirs(os.path.dirname(db_file), exist_ok=True)
        if not os.path.exists(db_file):
            with open(db_file, 'w', encoding='utf-8') as f:
                json.dump([], f, ensure_ascii=False, indent=2)

    @staticmethod
    def normalize_name(text: str) -> str:
        """Normalize song title or artist for accurate duplicate matching."""
        t = (text or '').lower()
        # Remove common remix/edit/bootleg/tag brackets
        t = re.sub(r'\s*[\(\[\{](?:official|audio|video|lyric|lyrics|clean|dirty|edit|remix|bootleg|flip|vip|dub|mashup|extended|club|hq|hd|original\s*mix)[^\)\]\}]*[\)\]\}]', '', t, flags=re.I)
        t = re.sub(r'[\(\[\{].*?[\)\]\}]', '', t)
        t = re.sub(r'[^\w\s]', '', t)
        t = re.sub(r'\s+', ' ', t).strip()
        return t

    @classmethod
    def find_existing_track(cls, title: str, artist: str = '') -> Optional[Dict]:
        """
        Strict check if track already exists in library with a valid file on disk.
        Both normalized Title AND Artist must match.
        """
        norm_t = cls.normalize_name(title)
        norm_a = cls.normalize_name(artist)
        if not norm_t:
            return None

        tracks = cls.get_all()
        for t in tracks:
            fp = t.get('filepath', '')
            if not fp or not os.path.exists(fp):
                continue

            t_title = cls.normalize_name(t.get('title', ''))
            t_artist = cls.normalize_name(t.get('artist', ''))

            # Strict matching: Both Title AND Artist must match
            if norm_a and t_artist:
                if norm_t == t_title and norm_a == t_artist:
                    return t
            elif not norm_a and not t_artist:
                if norm_t == t_title:
                    return t

        return None

    @classmethod
    def mark_existing_tracks(cls, tracks: List[Dict]) -> List[Dict]:
        """
        Scans a list of incoming tracks (e.g. from Spotify / Beatport / YouTube playlist)
        and marks tracks that already exist in the local library.
        """
        if not tracks:
            return []

        all_local = cls.get_all()
        # Build quick lookup map of existing valid local files
        local_valid = [t for t in all_local if t.get('filepath') and os.path.exists(t.get('filepath', ''))]

        for t in tracks:
            title = t.get('title', '')
            artist = t.get('artist', '')
            matched = cls.find_existing_track(title, artist)
            if matched:
                t['is_already_downloaded'] = True
                t['existing_filepath'] = matched.get('filepath')
                t['filepath'] = matched.get('filepath')
                t['done'] = True
                t['statusText'] = 'Already in Library'
                t['progress'] = 100
                if matched.get('bpm'): t['bpm'] = matched.get('bpm')
                if matched.get('camelot'): t['camelot'] = matched.get('camelot')
                if matched.get('key_name'): t['key_name'] = matched.get('key_name')
                if matched.get('genre'): t['genre'] = matched.get('genre')
                if matched.get('color'): t['color'] = matched.get('color')
                if matched.get('stars'): t['stars'] = matched.get('stars')
                if not t.get('cover_url') and matched.get('cover_url'):
                    t['cover_url'] = matched.get('cover_url')
            else:
                t['is_already_downloaded'] = False

        return tracks

    @classmethod
    def extract_cover(cls, fp: str, artist: str = '', title: str = '', fetch_online: bool = False) -> str:
        """
        Extracts album artwork from embedded ID3/APIC tags (rejecting non-square waveform banners),
        or fetches official artwork from iTunes only if fetch_online is True.
        """
        if fp and os.path.exists(fp):
            ext = os.path.splitext(fp)[1].lower()
            try:
                if ext in ('.mp3', '.wav', '.aiff', '.aif'):
                    from mutagen.mp3 import MP3
                    audio = MP3(fp)
                    if audio.tags:
                        for k in audio.tags.keys():
                            if k.startswith('APIC'):
                                raw_b = audio.tags[k].data
                                from PIL import Image
                                import io
                                try:
                                    im = Image.open(io.BytesIO(raw_b))
                                    w, h = im.size
                                    if w / h > 1.35 or h / w > 1.35:
                                        continue
                                except Exception:
                                    pass
                                return cls._to_thumbnail_data_url(raw_b)
                elif ext in ('.m4a', '.mp4', '.aac'):
                    from mutagen.mp4 import MP4
                    audio = MP4(fp)
                    if audio.tags and 'covr' in audio.tags and audio.tags['covr']:
                        return cls._to_thumbnail_data_url(bytes(audio.tags['covr'][0]))
                elif ext == '.flac':
                    from mutagen.flac import FLAC
                    audio = FLAC(fp)
                    if audio.pictures:
                        return cls._to_thumbnail_data_url(audio.pictures[0].data)
            except Exception:
                pass

        if not fetch_online:
            return ""

        # Fallback to iTunes API search only if explicitly requested
        import re
        clean_artist = artist.strip() if artist and artist.lower() not in ('unknown artist', 'unknown', 'various artists', 'none') else ''
        clean_title = title.strip()
        clean_search = re.sub(r'\s*\([^)]*(?:edit|bootleg|flip|vip|dub|mashup|clean|dirty|intro|outro|short|quick|extended|club|remix|kastraget|dj\s*city|bpm\s*supreme)[^)]*\)', '', clean_title, flags=re.I)
        clean_search = re.sub(r'\s*\[[^\]]*\]', '', clean_search)
        query = f"{clean_artist} {clean_search}".strip() if clean_artist else clean_search.strip()
        if query:
            res = cls._fetch_itunes_cover(query)
            if res:
                return res
        if clean_artist and clean_artist != query:
            res = cls._fetch_itunes_cover(clean_artist)
            if res:
                return res
        return ""

    @staticmethod
    def _to_thumbnail_data_url(raw_bytes: bytes) -> str:
        try:
            import io
            import base64
            from PIL import Image
            im = Image.open(io.BytesIO(raw_bytes))
            im.thumbnail((160, 160))
            buf = io.BytesIO()
            im.convert('RGB').save(buf, format='JPEG', quality=80)
            b64 = base64.b64encode(buf.getvalue()).decode('utf-8')
            return f"data:image/jpeg;base64,{b64}"
        except Exception:
            try:
                import base64
                b64 = base64.b64encode(raw_bytes).decode('utf-8')
                return f"data:image/jpeg;base64,{b64}"
            except Exception:
                return ""

    @staticmethod
    def _fetch_itunes_cover(query: str) -> str:
        try:
            import urllib.request
            import urllib.parse
            url = f"https://itunes.apple.com/search?term={urllib.parse.quote(query)}&entity=song&limit=1"
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req, timeout=2.5) as resp:
                data = json.loads(resp.read().decode('utf-8'))
                if data.get('resultCount', 0) > 0:
                    art = data['results'][0].get('artworkUrl100', '')
                    return art.replace('100x100bb', '300x300bb')
        except Exception:
            pass
        return ""

    @classmethod
    def sync_downloads_folder(cls, target_dir: Optional[str] = None) -> List[Dict]:
        """
        Auto-scans the downloads folder and synchronizes the library database:
        1. Verifies existing records: updates their current location and playlist folder name if moved.
        2. Detects moved files where the old filepath no longer exists.
        3. Removes dead/deleted files.
        4. Discovers and indexes any new audio files on disk with full metadata extraction.
        5. Writes updated library_history.json.
        """
        cls._ensure_db(target_dir)
        db_file = cls.get_db_file(target_dir)
        folder = os.path.abspath(target_dir) if target_dir else os.path.dirname(db_file)
        if not os.path.exists(folder):
            return []

        existing_tracks = []
        try:
            with open(db_file, 'r', encoding='utf-8') as f:
                existing_tracks = json.load(f)
        except Exception:
            existing_tracks = []

        # 1. Scan all physical audio files on disk
        physical_files = {}  # abs_path -> { filename, rel_folder, playlist_name }
        physical_by_filename = {}  # filename.lower() -> list of abs_paths
        
        for root, dirs, files in os.walk(folder):
            # Exclude hidden or build/cache system folders
            dirs[:] = [d for d in dirs if not d.startswith('.') and d not in ('node_modules', '__pycache__', '.git', 'scratch')]
            for file in files:
                if file.lower().endswith(('.mp3', '.m4a', '.flac', '.wav', '.aac', '.ogg')) and not file.startswith('.'):
                    abs_p = os.path.abspath(os.path.join(root, file))
                    rel_dir = os.path.relpath(root, folder)
                    playlist_name = ''
                    if rel_dir and rel_dir != '.':
                        playlist_name = rel_dir.split(os.sep)[0]
                    
                    physical_files[abs_p] = {
                        'filename': file,
                        'playlist_name': playlist_name,
                        'rel_dir': rel_dir
                    }
                    fn_lower = file.lower()
                    if fn_lower not in physical_by_filename:
                        physical_by_filename[fn_lower] = []
                    physical_by_filename[fn_lower].append(abs_p)

        updated_list = []
        claimed_paths = set()
        needs_save = False

        # 2. Reconcile existing tracks with physical disk state
        for t in existing_tracks:
            old_fp = os.path.abspath(t.get('filepath', '')) if t.get('filepath') else ''
            resolved_fp = None

            if old_fp and os.path.exists(old_fp) and old_fp in physical_files:
                resolved_fp = old_fp
            elif old_fp:
                # File was moved! Try to find by matching filename in physical_by_filename
                fn = os.path.basename(old_fp).lower()
                candidates = physical_by_filename.get(fn, [])
                for cand in candidates:
                    if cand not in claimed_paths:
                        resolved_fp = cand
                        break

            if not resolved_fp:
                # Try matching by normalized title + artist
                norm_t = cls.normalize_name(t.get('title', ''))
                norm_a = cls.normalize_name(t.get('artist', ''))
                if norm_t:
                    for cand_fp, cand_info in physical_files.items():
                        if cand_fp not in claimed_paths:
                            cand_fn = cls.normalize_name(cand_info['filename'])
                            if norm_t in cand_fn and (not norm_a or norm_a in cand_fn):
                                resolved_fp = cand_fp
                                break

            if resolved_fp and resolved_fp in physical_files:
                claimed_paths.add(resolved_fp)
                cur_info = physical_files[resolved_fp]
                cur_playlist = cur_info['playlist_name']

                # Update filepath if moved
                if t.get('filepath') != resolved_fp:
                    t['filepath'] = resolved_fp
                    needs_save = True

                # Update playlist_name tag badge if moved to a different folder
                if t.get('playlist_name') != cur_playlist:
                    t['playlist_name'] = cur_playlist
                    needs_save = True

                # Update source badge accurately (preserve original source if set)
                orig_source = t.get('source')
                if not orig_source or orig_source in ('Beatport', 'Library', 'Playlist'):
                    if cur_playlist and 'beatport' in cur_playlist.lower():
                        t['source'] = 'Beatport'
                    elif cur_playlist and 'youtube' in cur_playlist.lower():
                        t['source'] = 'YouTube'
                    elif cur_playlist and 'apple' in cur_playlist.lower():
                        t['source'] = 'Apple Music'
                    elif orig_source in ('Spotify', 'Apple Music', 'Deezer', 'SoundCloud', 'YouTube'):
                        t['source'] = orig_source
                    else:
                        t['source'] = 'Spotify'

                # Backfill cover if missing
                if not t.get('cover_url'):
                    cov = cls.extract_cover(resolved_fp, t.get('artist', ''), t.get('title', ''))
                    if cov:
                        t['cover_url'] = cov
                        needs_save = True

                updated_list.append(t)
            else:
                # File no longer exists on disk anywhere in downloads -> removed
                needs_save = True

        # 3. Discover and index any newly added audio files
        for abs_fp, file_info in physical_files.items():
            if abs_fp in claimed_paths:
                continue

            claimed_paths.add(abs_fp)
            base = os.path.splitext(file_info['filename'])[0]
            title = base
            artist = ''
            if ' - ' in base:
                parts = base.split(' - ', 1)
                artist = parts[0].strip()
                title = parts[1].strip()

            bpm = 128.0
            camelot = '8A'
            genre = 'Dance / DJ'
            dur_ms = 180000
            album = ''
            year = ''
            cover_url = ''

            try:
                if abs_fp.lower().endswith('.mp3'):
                    from mutagen.mp3 import MP3
                    audio = MP3(abs_fp)
                    dur_ms = int((audio.info.length or 180) * 1000)
                    tags = audio.tags or {}
                    if tags.get('TIT2'): title = str(tags.get('TIT2'))
                    if tags.get('TPE1'): artist = str(tags.get('TPE1'))
                    if tags.get('TALB'): album = str(tags.get('TALB'))
                    if tags.get('TDRC'): year = str(tags.get('TDRC'))
                    if tags.get('TBPM'):
                        try: bpm = float(str(tags.get('TBPM')))
                        except Exception: pass
                    if tags.get('TKEY'):
                        camelot = str(tags.get('TKEY'))
                    if tags.get('TCON'):
                        genre = str(tags.get('TCON'))
            except Exception:
                pass

            cover_url = cls.extract_cover(abs_fp, artist, title)
            playlist_name = file_info['playlist_name']
            source = 'Beatport' if 'beatport' in playlist_name.lower() else 'YouTube' if 'youtube' in playlist_name.lower() else 'Apple Music' if 'apple' in playlist_name.lower() else 'Spotify'

            color = CAMELOT_COLORS.get(camelot, '#fb923c')
            new_item = {
                'id': f'local_{int(time.time()*1000)}_{len(updated_list)}',
                'title': title,
                'artist': artist,
                'album': album,
                'playlist_name': playlist_name,
                'source': source,
                'duration_ms': dur_ms,
                'cover_url': cover_url,
                'bpm': round(bpm, 1),
                'camelot': camelot,
                'key_name': camelot,
                'color': color,
                'genre': genre,
                'year': year,
                'energy': min(10, max(1, int(round((bpm - 100) / 7.0)))),
                'stars': 4 if bpm >= 126 else 3,
                'rating_255': 204 if bpm >= 126 else 153,
                'filepath': abs_fp,
                'done': True,
                'statusText': 'Downloaded',
                'added_at': int(time.time() * 1000)
            }
            updated_list.insert(0, new_item)
            needs_save = True

        if needs_save or len(updated_list) != len(existing_tracks):
            try:
                with open(db_file, 'w', encoding='utf-8') as f:
                    json.dump(updated_list, f, ensure_ascii=False, indent=2)
            except Exception as e:
                print(f"[HistoryService] Error saving synchronized database: {e}")

        # Update SQLite DB Engine in background
        try:
            from src.services.db_service import DBService
            for t in updated_list:
                DBService.upsert_track(t, target_dir)
        except Exception:
            pass

        return updated_list

    @classmethod
    def get_all(cls, force_rescan: bool = False, target_dir: Optional[str] = None) -> List[Dict]:
        cls._ensure_db(target_dir)
        db_file = cls.get_db_file(target_dir)
        if force_rescan:
            return cls.sync_downloads_folder(target_dir)
        
        # Fast SQLite Query with fallback to JSON
        try:
            from src.services.db_service import DBService
            DBService.sync_from_json_if_needed(db_file, target_dir)
            db_tracks = DBService.get_all_tracks(target_dir)
            if db_tracks:
                return db_tracks
        except Exception:
            pass

        try:
            with open(db_file, 'r', encoding='utf-8') as f:
                tracks = json.load(f)
                return tracks if isinstance(tracks, list) else []
        except Exception:
            return cls.sync_downloads_folder(target_dir)

    @classmethod
    def save_track(cls, track: Dict):
        cls._ensure_db()
        db_file = cls.get_db_file()
        tracks = cls.get_all()
        filepath = track.get('filepath')
        existing_idx = next((i for i, t in enumerate(tracks) if t.get('filepath') == filepath), None)
        track['added_at'] = int(time.time())
        if existing_idx is not None:
            tracks[existing_idx] = track
        else:
            tracks.insert(0, track)

        try:
            with open(db_file, 'w', encoding='utf-8') as f:
                json.dump(tracks, f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"[HistoryService] Error saving track: {e}")

        try:
            from src.services.db_service import DBService
            DBService.upsert_track(track)
        except Exception:
            pass

    @classmethod
    def delete_track(cls, filepath: str, delete_file: bool = True, track_id: Optional[str] = None) -> bool:
        cls._ensure_db()
        db_file = cls.get_db_file()
        tracks = cls.get_all()

        try:
            from src.services.db_service import DBService
            DBService.delete_track(filepath, track_id=track_id)
        except Exception:
            pass
        norm_target = os.path.normpath(os.path.abspath(filepath)).lower() if filepath else ''
        
        remaining = []
        deleted_fps = []
        for t in tracks:
            t_fp = t.get('filepath', '')
            t_norm = os.path.normpath(os.path.abspath(t_fp)).lower() if t_fp else ''
            t_id = str(t.get('id', ''))
            
            is_match = False
            if norm_target and t_norm == norm_target:
                is_match = True
            elif track_id and (t_id == str(track_id) or str(t.get('id')) == str(track_id)):
                is_match = True
            
            if is_match:
                if t_fp:
                    deleted_fps.append(t_fp)
                continue
            remaining.append(t)

        if filepath and filepath not in deleted_fps:
            deleted_fps.append(filepath)

        try:
            with open(db_file, 'w', encoding='utf-8') as f:
                json.dump(remaining, f, ensure_ascii=False, indent=2)
            
            if delete_file:
                import stat
                import gc
                for p in set(deleted_fps):
                    if not p:
                        continue
                    norm_p = os.path.normpath(os.path.abspath(p))
                    if os.path.exists(norm_p):
                        try:
                            try:
                                os.chmod(norm_p, stat.S_IWRITE)
                            except Exception:
                                pass
                            os.remove(norm_p)
                        except Exception:
                            gc.collect()
                            time.sleep(0.05)
                            try:
                                try:
                                    os.chmod(norm_p, stat.S_IWRITE)
                                except Exception:
                                    pass
                                os.remove(norm_p)
                            except Exception as err:
                                print(f"[HistoryService] Warning: Could not delete physical file: {err}")
            return True
        except Exception as e:
            print(f"[HistoryService] Error deleting track from DB: {e}")
            return False

    @classmethod
    def batch_update_tracks(cls, filepaths: List[str], updated_fields: Dict) -> bool:
        cls._ensure_db()
        db_file = cls.get_db_file()
        tracks = cls.get_all()
        target_fps = {os.path.normpath(os.path.abspath(fp)).lower() for fp in filepaths if fp}
        for t in tracks:
            t_fp = t.get('filepath', '')
            t_norm = os.path.normpath(os.path.abspath(t_fp)).lower() if t_fp else ''
            if t_norm in target_fps:
                t.update(updated_fields)
        try:
            with open(db_file, 'w', encoding='utf-8') as f:
                json.dump(tracks, f, ensure_ascii=False, indent=2)
            return True
        except Exception:
            return False

    @classmethod
    def batch_delete_tracks(cls, filepaths: List[str], delete_files: bool = True, track_ids: Optional[List[str]] = None) -> bool:
        cls._ensure_db()
        db_file = cls.get_db_file()
        tracks = cls.get_all()
        target_fps = {os.path.normpath(os.path.abspath(fp)).lower() for fp in filepaths if fp}
        target_ids = {str(tid) for tid in (track_ids or []) if tid}
        
        remaining = []
        deleted_paths = list(filepaths)
        for t in tracks:
            t_fp = t.get('filepath', '')
            t_norm = os.path.normpath(os.path.abspath(t_fp)).lower() if t_fp else ''
            t_id = str(t.get('id', ''))
            if (t_norm and t_norm in target_fps) or (t_id and t_id in target_ids):
                if t_fp:
                    deleted_paths.append(t_fp)
            else:
                remaining.append(t)
        try:
            with open(db_file, 'w', encoding='utf-8') as f:
                json.dump(remaining, f, ensure_ascii=False, indent=2)
            if delete_files:
                import stat
                import gc
                for fp in set(deleted_paths):
                    if not fp:
                        continue
                    norm_p = os.path.normpath(os.path.abspath(fp))
                    if os.path.exists(norm_p):
                        try:
                            try:
                                os.chmod(norm_p, stat.S_IWRITE)
                            except Exception:
                                pass
                            os.remove(norm_p)
                        except Exception:
                            gc.collect()
                            time.sleep(0.05)
                            try:
                                try:
                                    os.chmod(norm_p, stat.S_IWRITE)
                                except Exception:
                                    pass
                                os.remove(norm_p)
                            except Exception:
                                pass
            return True
        except Exception:
            return False
