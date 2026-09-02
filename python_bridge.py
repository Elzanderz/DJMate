# -*- coding: utf-8 -*-
import sys
import os
import json

# Force UTF-8 stream encoding on Windows
if sys.platform == 'win32':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stdin.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except Exception:
        pass
os.environ["PYTHONIOENCODING"] = "utf-8"

# Add project root to sys.path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from src.services.spotify_service import SpotifyService
from src.services.dj_analyzer_service import DJAnalyzerService
from src.services.rekordbox_service import RekordboxService
from src.services.downloader_service import DownloaderService
from src.services.tagger_service import TaggerService
from src.services.history_service import HistoryService
from src.services.audio_normalizer_service import AudioNormalizerService
from src.services.beatport_service import BeatportService
from src.services.youtube_mixtape_service import YouTubeMixtapeService
from src.services.music_sources_service import SoundCloudService, AppleMusicService
from src.services.ai_curator_service import AICuratorService
from src.services.dj_exporters import DJExportersService
from src.services.music_search_service import MusicSearchService
import subprocess
import re
import base64

def handle_command(cmd_name: str, payload: dict) -> dict:
    spotify_service = SpotifyService()
    from src.services.settings_service import SettingsService
    output_dir = SettingsService.get_output_dir()
    os.makedirs(output_dir, exist_ok=True)

    if cmd_name == 'get_output_dir':
        return {'result': output_dir}

    elif cmd_name == 'set_output_dir':
        new_dir = payload.get('path', '').strip()
        saved_dir = SettingsService.set_output_dir(new_dir)
        from src.services.history_service import HistoryService
        HistoryService.sync_downloads_folder(saved_dir)
        return {'result': saved_dir}

    elif cmd_name == 'browse_folder':
        selected = SettingsService.browse_folder()
        if selected:
            from src.services.history_service import HistoryService
            HistoryService.sync_downloads_folder(selected)
        return {'result': selected or output_dir}

    elif cmd_name == 'open_folder':
        target_path = payload.get('path', '').strip()
        playlist_name = payload.get('playlist_name', '').strip()
        folder_to_open = None

        if playlist_name and playlist_name.lower() not in ['all', 'singles']:
            clean_p = DownloaderService.sanitize_filename(playlist_name)
            p_dir = os.path.join(output_dir, clean_p)
            folder_to_open = p_dir

        if not folder_to_open and target_path and target_path.strip():
            p_buf = os.path.abspath(target_path) if not os.path.isabs(target_path) else target_path
            if os.path.isfile(p_buf) or any(p_buf.lower().endswith(ext) for ext in ['.mp3', '.m4a', '.flac', '.wav', '.webm', '.ogg', '.m3u8', '.xml', '.txt']):
                folder_to_open = os.path.dirname(p_buf)
            else:
                folder_to_open = p_buf

        if not folder_to_open:
            folder_to_open = output_dir

        os.makedirs(folder_to_open, exist_ok=True)

        try:
            if sys.platform == 'win32':
                os.startfile(folder_to_open)
            else:
                subprocess.run(['open' if sys.platform == 'darwin' else 'xdg-open', folder_to_open])
            return {'result': True, 'path': folder_to_open}
        except Exception as e:
            return {'result': False, 'error': str(e)}

    elif cmd_name == 'fetch_metadata':
        url = payload.get('url', '').strip()
        from src.services.beatport_service import BeatportService
        from src.services.youtube_mixtape_service import YouTubeMixtapeService
        from src.services.music_sources_service import SoundCloudService, AppleMusicService
        from src.services.history_service import HistoryService
        from src.services.music_search_service import MusicSearchService

        is_url = url.startswith('http://') or url.startswith('https://') or url.startswith('spotify:')
        if is_url:
            if BeatportService.is_beatport_url(url):
                tracks = BeatportService.get_info(url)
            elif SoundCloudService.is_soundcloud_url(url):
                tracks = SoundCloudService.get_info(url)
            elif AppleMusicService.is_applemusic_url(url):
                tracks = AppleMusicService.get_info(url)
            elif YouTubeMixtapeService.is_youtube_url(url):
                tracks = YouTubeMixtapeService.extract_mixtape_tracks(url)
            else:
                tracks = spotify_service.get_info(url)
        else:
            # Smart multi-source online search for keywords / song name
            tracks = MusicSearchService.search_online_tracks(url, limit_per_source=8, check_local=True)
            if not tracks:
                tracks = spotify_service.get_info(url)
        
        # Deduplication check: mark tracks already present in local library
        tracks = HistoryService.mark_existing_tracks(tracks)
        return {'result': tracks}

    elif cmd_name == 'scan_youtube_shazam':
        url = payload.get('url', '').strip()
        from src.services.youtube_mixtape_service import YouTubeMixtapeService
        tracks = YouTubeMixtapeService.extract_mixtape_tracks(url)
        return {'result': tracks}

    elif cmd_name == 'generate_ai_playlist':
        prompt = str(payload.get('prompt') or '').strip()
        count = int(payload.get('count') or 15)
        raw_key = payload.get('api_key') or payload.get('apiKey')
        api_key = str(raw_key).strip() if raw_key else None
        provider = str(payload.get('provider') or 'gemini').strip().lower()
        languages = payload.get('languages') or ['thai', 'english']
        mixtape_mode = str(payload.get('mixtape_mode') or 'peak_climb')
        from src.services.ai_curator_service import AICuratorService
        result = AICuratorService.generate_playlist(prompt, count=count, api_key=api_key, provider=provider, languages=languages, mixtape_mode=mixtape_mode)
        return {'result': result}

    elif cmd_name == 'batch_update_tracks':
        from src.services.history_service import HistoryService
        filepaths = payload.get('filepaths', [])
        updated_fields = payload.get('updated_fields', {})
        ok = HistoryService.batch_update_tracks(filepaths, updated_fields)
        return {'result': ok}

    elif cmd_name == 'batch_delete_tracks':
        from src.services.history_service import HistoryService
        filepaths = payload.get('filepaths', [])
        delete_files = payload.get('delete_files', False)
        ok = HistoryService.batch_delete_tracks(filepaths, delete_files=delete_files)
        return {'result': ok}

    elif cmd_name == 'get_removable_drives':
        import string
        import ctypes
        drives = []
        if sys.platform == 'win32':
            bitmask = ctypes.windll.kernel32.GetLogicalDrives()
            for letter in string.ascii_uppercase:
                if bitmask & 1:
                    drive_path = f"{letter}:\\"
                    drive_type = ctypes.windll.kernel32.GetDriveTypeW(drive_path)
                    # 2 = DRIVE_REMOVABLE, 3 = DRIVE_FIXED
                    if drive_type in (2, 3) and letter != 'C':
                        buf = ctypes.create_unicode_buffer(1024)
                        vol_name = ''
                        try:
                            ctypes.windll.kernel32.GetVolumeInformationW(drive_path, buf, 1024, None, None, None, None, 0)
                            vol_name = buf.value
                        except Exception:
                            pass
                        label = f"{vol_name} ({letter}:)" if vol_name else f"Drive ({letter}:)"

                        subfolders = []
                        try:
                            if os.path.exists(drive_path):
                                for it in os.listdir(drive_path):
                                    fp = os.path.join(drive_path, it)
                                    if os.path.isdir(fp) and not it.startswith('$') and not it.startswith('.') and it not in ('System Volume Information', 'Recovery'):
                                        subfolders.append({
                                            'name': it,
                                            'path': fp
                                        })
                        except Exception:
                            pass

                        drives.append({
                            'letter': letter,
                            'path': drive_path,
                            'is_removable': (drive_type == 2),
                            'label': label,
                            'subfolders': subfolders
                        })
                bitmask >>= 1
        return {'result': drives}

    elif cmd_name == 'browse_directory':
        initial_dir = payload.get('initial_dir', '')
        import tkinter as tk
        from tkinter import filedialog
        try:
            root = tk.Tk()
            root.withdraw()
            root.attributes('-topmost', True)
            selected = filedialog.askdirectory(initialdir=initial_dir or None, title="Select Destination Folder / USB Drive")
            root.destroy()
            return {'result': selected or ''}
        except Exception as e:
            return {'result': '', 'error': str(e)}

    elif cmd_name == 'export_to_dj_drive':
        tracks = payload.get('tracks', [])
        target_dir = payload.get('target_dir', '')
        structure_mode = payload.get('structure_mode', 'by_playlist')
        playlist_name = payload.get('playlist_name', 'USB DJ Collection')
        if not target_dir:
            target_dir = os.path.join(output_dir, 'DJ_USB_Export')
        res = RekordboxService.export_to_dj_drive(tracks, target_dir, structure_mode=structure_mode, playlist_name=playlist_name)
        return {'result': res}

    elif cmd_name == 'get_gig_crates':
        from src.services.dj_crate_service import DJCrateService
        from src.services.history_service import HistoryService
        tracks = payload.get('tracks') or HistoryService.get_all()
        crates = DJCrateService.auto_classify_library(tracks)
        return {'result': crates}

    elif cmd_name == 'build_gig_storage':
        from src.services.dj_crate_service import DJCrateService
        from src.services.history_service import HistoryService
        tracks = payload.get('tracks') or HistoryService.get_all()
        target_dir = payload.get('target_dir') or output_dir
        res = DJCrateService.build_dj_storage_profiles(tracks, target_dir)
        return {'result': res}

    elif cmd_name == 'scan_duplicates':
        from src.services.cleaner_service import CleanerService
        from src.services.history_service import HistoryService
        tracks = payload.get('tracks') or HistoryService.get_all()
        res = CleanerService.scan_duplicates(tracks)
        return {'result': res}

    elif cmd_name == 'clean_duplicates_batch':
        from src.services.cleaner_service import CleanerService
        filepaths = payload.get('filepaths', [])
        res = CleanerService.clean_duplicates_batch(filepaths)
        return {'result': res}

    elif cmd_name == 'redownload_studio_master':
        from src.services.cleaner_service import CleanerService
        filepath = payload.get('filepath', '')
        res = CleanerService.redownload_studio_master(filepath)
        return {'result': res}

    elif cmd_name == 'get_activities':
        from src.services.activity_service import ActivityService
        limit = payload.get('limit', 200)
        res = ActivityService.get_activities(limit=limit)
        return {'result': res}

    elif cmd_name == 'log_activity':
        from src.services.activity_service import ActivityService
        cat = payload.get('category', 'general')
        title = payload.get('title', '')
        desc = payload.get('description', '')
        details = payload.get('details', {})
        res = ActivityService.log_activity(category=cat, title=title, description=desc, details=details)
        return {'result': res}

    elif cmd_name == 'clear_activities':
        from src.services.activity_service import ActivityService
        res = ActivityService.clear_activities()
        return {'result': res}

    elif cmd_name == 'find_mashup_matches':
        from src.services.mashup_service import MashupService
        from src.services.history_service import HistoryService
        tracks = payload.get('tracks') or HistoryService.get_all()
        min_score = payload.get('min_score', 80)
        limit = payload.get('limit', 50)
        res = MashupService.find_all_mashups(tracks, min_score=min_score, limit=limit)
        return {'result': res}

    elif cmd_name == 'search_spotify_tracks':
        queries = payload.get('queries', [])
        from concurrent.futures import ThreadPoolExecutor

        def match_single_query(item):
            idx, q = item
            q_clean = q.strip()
            match = SpotifyService.search_track(q_clean)
            if match:
                match['track_number'] = idx + 1
                match['source'] = 'DJ Tracklist'
                return match

            # Fallback: Parse artist and title from query string
            artist = ''
            title = q_clean
            if ' - ' in q_clean:
                parts = q_clean.split(' - ', 1)
                artist, title = parts[0].strip(), parts[1].strip()
            elif ' – ' in q_clean:
                parts = q_clean.split(' – ', 1)
                artist, title = parts[0].strip(), parts[1].strip()
            elif ' — ' in q_clean:
                parts = q_clean.split(' — ', 1)
                artist, title = parts[0].strip(), parts[1].strip()

            return {
                'id': f'custom_{idx+1}',
                'title': title or q_clean,
                'artist': artist,
                'album': 'DJ Tracklist',
                'source': 'DJ Tracklist',
                'duration_ms': 0,
                'cover_url': '',
                'year': '',
                'track_number': idx + 1,
                'search_query': q_clean
            }

        with ThreadPoolExecutor(max_workers=12) as executor:
            results = list(executor.map(match_single_query, enumerate(queries)))

        from src.services.history_service import HistoryService
        results = HistoryService.mark_existing_tracks(results)
        return {'result': results}

    elif cmd_name == 'search_music_unified':
        query = payload.get('query', '')
        from src.services.music_search_service import MusicSearchService
        res = MusicSearchService.search_unified(query, base_dir=output_dir)
        return {'result': res}

    elif cmd_name == 'search_local_folder':
        query = payload.get('query', '')
        from src.services.music_search_service import MusicSearchService
        res = MusicSearchService.search_local_library(query, base_dir=output_dir)
        return {'result': res}

    elif cmd_name == 'search_online_tracks':
        query = payload.get('query', '')
        limit = int(payload.get('limit', 10))
        from src.services.music_search_service import MusicSearchService
        res = MusicSearchService.search_online_tracks(query, limit_per_source=limit, check_local=True)
        return {'result': res}

    elif cmd_name == 'harmonic_sort':
        tracks = payload.get('tracks', [])
        sorted_tracks = DJAnalyzerService.smart_harmonic_sort(tracks)
        return {'result': sorted_tracks}

    elif cmd_name == 'build_smart_mixtape':
        tracks = payload.get('tracks', [])
        mode = payload.get('mode', 'peak_climb')
        genre_filter = payload.get('genre_filter', 'ALL')
        min_bpm = payload.get('min_bpm')
        max_bpm = payload.get('max_bpm')
        min_stars = payload.get('min_stars')
        max_stars = payload.get('max_stars')
        target_count = payload.get('target_count')

        randomize = payload.get('randomize', True)
        sorted_tracks = DJAnalyzerService.build_smart_mixtape(
            tracks,
            mode=mode,
            genre_filter=genre_filter,
            min_bpm=min_bpm,
            max_bpm=max_bpm,
            min_stars=min_stars,
            max_stars=max_stars,
            target_count=target_count,
            randomize=randomize
        )
        return {'result': sorted_tracks}

    elif cmd_name == 'export_smart_mixtape_package':
        from src.services.dj_exporters import DJExportersService
        tracks = payload.get('tracks', [])
        title = payload.get('title', 'Smart_Mixtape_DJ_Set')
        copy_audio = payload.get('copy_audio', False)
        res = DJExportersService.export_all_dj_formats(tracks, title, output_dir, copy_audio=copy_audio)
        return {'result': res}

    elif cmd_name == 'scan_youtube_shazam':
        from src.services.shazam_service import ShazamService
        url = payload.get('url', '')
        tracks = ShazamService.scan_youtube_audio(url)
        return {'result': tracks}

    elif cmd_name in ('sync_library', 'get_history'):
        from src.services.history_service import HistoryService
        rescan = payload.get('rescan', True) if cmd_name == 'get_history' else True
        history = HistoryService.sync_downloads_folder(output_dir) if rescan else HistoryService.get_all()
        return {'result': history}

    elif cmd_name == 'delete_history_track':
        from src.services.history_service import HistoryService
        filepath = payload.get('filepath', '')
        delete_file = payload.get('delete_file', False)
        ok = HistoryService.delete_track(filepath, delete_file=delete_file)
        return {'result': ok}

    elif cmd_name == 'export_rekordbox':
        tracks = payload.get('tracks', [])
        file_path = os.path.join(output_dir, 'rekordbox_spotify_dj_set.xml')
        saved = RekordboxService.export_rekordbox_xml(tracks, file_path)
        return {'result': saved}

    elif cmd_name == 'export_m3u8':
        tracks = payload.get('tracks', [])
        file_path = os.path.join(output_dir, 'spotify_dj_mixtape.m3u8')
        saved = RekordboxService.export_m3u8(tracks, file_path)
        return {'result': saved}

    elif cmd_name == 'export_tracklist_txt':
        tracks = payload.get('tracks', [])
        title = payload.get('title', 'Tracklist')
        format_mode = payload.get('format_mode', 'youtube')
        target_dir = payload.get('target_dir') or output_dir
        import re
        clean_title = re.sub(r'[\\/*?:"<>|]', '_', title).strip() or 'Tracklist'
        file_path = os.path.join(target_dir, f"{clean_title}_tracklist.txt")
        saved = RekordboxService.export_tracklist_txt(tracks, file_path, playlist_name=title, format_mode=format_mode)
        return {'result': saved}

    elif cmd_name == 'download_single':
        track = payload.get('track', {})
        fmt = payload.get('audio_format', 'MP3').lower()
        quality = payload.get('quality', '320 kbps')
        stem_type = payload.get('stem_type', 'full')
        folder_mode = payload.get('folder_mode') or track.get('folder_mode', 'playlist')
        normalize_audio = payload.get('normalize_audio', True)
        target_lufs = payload.get('target_lufs', -14.0)

        kbps = '320'
        if '256' in quality:
            kbps = '256'
        elif '192' in quality:
            kbps = '192'
        elif '128' in quality:
            kbps = '128'

        track['stem_type'] = stem_type
        track['folder_mode'] = folder_mode
        track['normalize_audio'] = normalize_audio
        track['target_lufs'] = target_lufs

        try:
            target_file = DownloaderService.download_track(
                track_info=track,
                output_dir=output_dir,
                audio_format=fmt,
                audio_quality=kbps
            )
            track['filepath'] = target_file
            track['done'] = True
            track['statusText'] = 'Downloaded'
            from src.services.history_service import HistoryService
            HistoryService.save_track(track)
            return {'result': {'success': True, 'track': track, 'filepath': target_file}}
        except Exception as e:
            return {'result': {'success': False, 'error': str(e)}}

    elif cmd_name == 'batch_normalize_tracks':
        filepaths = payload.get('filepaths', [])
        target_lufs = float(payload.get('target_lufs', -14.0))
        from src.services.audio_normalizer_service import AudioNormalizerService
        res = AudioNormalizerService.batch_normalize_files(filepaths, target_lufs=target_lufs)
        return {'result': res}

    elif cmd_name == 'get_audio_data_url':
        filepath = payload.get('filepath', '')
        if not filepath or not os.path.exists(filepath):
            # Auto-recovery fallback: search in downloads folder
            candidate = None
            if filepath:
                bn = os.path.basename(filepath)
                for root, dirs, files in os.walk('downloads'):
                    if bn in files:
                        candidate = os.path.abspath(os.path.join(root, bn))
                        break
            if not candidate:
                return {'result': ''}
            filepath = candidate

        import base64
        ext = os.path.splitext(filepath)[1].lower().replace('.', '')
        mime = 'audio/mpeg' if ext == 'mp3' else f'audio/{ext}'
        try:
            with open(filepath, 'rb') as f:
                encoded = base64.b64encode(f.read()).decode('utf-8')
            return {'result': f"data:{mime};base64,{encoded}"}
        except Exception:
            return {'result': ''}

    elif cmd_name == 'save_tags':
        track = payload.get('track', {})
        filepath = track.get('filepath')
        if filepath and os.path.exists(filepath):
            TaggerService.apply_tags(filepath, track)
            return {'result': True}
        return {'result': False}

    return {'error': f'Unknown command: {cmd_name}'}

if __name__ == '__main__':
    if len(sys.argv) > 1:
        cmd = sys.argv[1]
        data = {}
        if len(sys.argv) > 2:
            raw = sys.argv[2]
            try:
                data = json.loads(raw)
            except Exception:
                try:
                    import base64
                    data = json.loads(base64.b64decode(raw.encode('utf-8')).decode('utf-8'))
                except Exception:
                    data = {'url': raw}
        resp = handle_command(cmd, data)
        print(json.dumps(resp, ensure_ascii=False))
    else:
        # Standard input processing
        for line in sys.stdin:
            line = line.strip()
            if not line:
                continue
            try:
                req = json.loads(line)
                cmd = req.get('cmd')
                payload = req.get('args', {})
                resp = handle_command(cmd, payload)
                print(json.dumps(resp, ensure_ascii=False), flush=True)
            except Exception as e:
                print(json.dumps({'error': str(e)}), flush=True)
            break
