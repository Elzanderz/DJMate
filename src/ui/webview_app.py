# -*- coding: utf-8 -*-
import os
import sys
import subprocess
from typing import List, Dict
import webview
from tkinter import filedialog, Tk

from ..services.spotify_service import SpotifyService
from ..services.downloader_service import DownloaderService
from ..services.dj_analyzer_service import DJAnalyzerService
from ..services.rekordbox_service import RekordboxService

class DJWebviewApi:
    def __init__(self):
        self.spotify_service = SpotifyService()
        self.output_dir = os.path.abspath(os.path.join(os.getcwd(), 'downloads'))
        os.makedirs(self.output_dir, exist_ok=True)

    def get_output_dir(self) -> str:
        return self.output_dir

    def browse_folder(self) -> str:
        root = Tk()
        root.withdraw()
        root.attributes('-topmost', True)
        folder = filedialog.askdirectory(initialdir=self.output_dir)
        root.destroy()
        if folder:
            self.output_dir = folder
            return folder
        return self.output_dir

    def open_folder(self, path: str = None, playlist_name: str = '') -> bool:
        from ..services.downloader_service import DownloaderService
        target = (path or '').strip()
        folder_to_open = None

        if target and os.path.exists(target):
            if os.path.isfile(target):
                folder_to_open = os.path.dirname(os.path.abspath(target))
            else:
                folder_to_open = os.path.abspath(target)
        elif playlist_name:
            p_dir = os.path.join(self.output_dir, DownloaderService.sanitize_filename(playlist_name))
            if os.path.exists(p_dir):
                folder_to_open = p_dir

        if not folder_to_open or not os.path.exists(folder_to_open):
            folder_to_open = self.output_dir

        os.makedirs(folder_to_open, exist_ok=True)

        if sys.platform == 'win32':
            os.startfile(folder_to_open)
        else:
            subprocess.run(['open' if sys.platform == 'darwin' else 'xdg-open', folder_to_open])
        return True

    def fetch_metadata(self, url: str) -> List[Dict]:
        url = (url or '').strip()
        from ..services.beatport_service import BeatportService
        from ..services.youtube_mixtape_service import YouTubeMixtapeService
        if BeatportService.is_beatport_url(url):
            return BeatportService.get_info(url)
        elif YouTubeMixtapeService.is_youtube_url(url):
            return YouTubeMixtapeService.extract_mixtape_tracks(url)

        from ..services.music_search_service import MusicSearchService
        if not (url.startswith('http://') or url.startswith('https://') or url.startswith('spotify:')):
            return MusicSearchService.search_online_tracks(url, limit_per_source=8, check_local=True)
        return self.spotify_service.get_info(url)

    def search_music_unified(self, query: str = '') -> Dict:
        from ..services.music_search_service import MusicSearchService
        return MusicSearchService.search_unified(query, base_dir=self.output_dir)

    def search_local_folder(self, query: str = '') -> List[Dict]:
        from ..services.music_search_service import MusicSearchService
        return MusicSearchService.search_local_library(query, base_dir=self.output_dir)

    def search_online_tracks(self, query: str = '', limit: int = 10) -> List[Dict]:
        from ..services.music_search_service import MusicSearchService
        return MusicSearchService.search_online_tracks(query, limit_per_source=limit, check_local=True)

    def harmonic_sort(self, tracks: List[Dict]) -> List[Dict]:
        return DJAnalyzerService.smart_harmonic_sort(tracks)

    def export_rekordbox(self, tracks: List[Dict]) -> str:
        root = Tk()
        root.withdraw()
        root.attributes('-topmost', True)
        file_path = filedialog.asksaveasfilename(
            defaultextension='.xml',
            filetypes=[('rekordbox XML', '*.xml')],
            initialfile='rekordbox_spotify_dj_set.xml',
            initialdir=self.output_dir
        )
        root.destroy()
        if not file_path:
            file_path = os.path.join(self.output_dir, 'rekordbox_spotify_dj_set.xml')

        RekordboxService.export_rekordbox_xml(tracks, file_path)
        return file_path

    def export_m3u8(self, tracks: List[Dict]) -> str:
        root = Tk()
        root.withdraw()
        root.attributes('-topmost', True)
        file_path = filedialog.asksaveasfilename(
            defaultextension='.m3u8',
            filetypes=[('M3U8 Playlist', '*.m3u8')],
            initialfile='spotify_dj_mixtape.m3u8',
            initialdir=self.output_dir
        )
        root.destroy()
        if not file_path:
            file_path = os.path.join(self.output_dir, 'spotify_dj_mixtape.m3u8')

        RekordboxService.export_m3u8(tracks, file_path)
        return file_path

    def download_single(
        self,
        track: Dict,
        audio_format: str = 'MP3',
        quality: str = '320 kbps',
        stem_type: str = 'full',
        folder_mode: str = 'single',
        normalize_audio: bool = True,
        target_lufs: float = -14.0
    ) -> Dict:
        fmt = audio_format.lower()
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
                output_dir=self.output_dir,
                audio_format=fmt,
                audio_quality=kbps
            )
            return {'success': True, 'track': track, 'filepath': target_file}
        except Exception as e:
            return {'success': False, 'error': str(e)}

    def batch_normalize_tracks(self, filepaths: List[str], target_lufs: float = -14.0) -> Dict:
        from ..services.audio_normalizer_service import AudioNormalizerService
        return AudioNormalizerService.batch_normalize_files(filepaths, target_lufs=target_lufs)

    def get_audio_data_url(self, filepath: str) -> str:
        """Converts local audio file to base64 audio data URL for the in-app player."""
        if not filepath or not os.path.exists(filepath):
            return ''
        import base64
        ext = os.path.splitext(filepath)[1].lower().replace('.', '')
        mime = 'audio/mpeg' if ext == 'mp3' else f'audio/{ext}'
        try:
            with open(filepath, 'rb') as f:
                encoded = base64.b64encode(f.read()).decode('utf-8')
            return f"data:{mime};base64,{encoded}"
        except Exception:
            return ''

    def search_spotify_tracks(self, queries: List[str]) -> List[Dict]:
        """Fast parallel search for tracklist queries."""
        from concurrent.futures import ThreadPoolExecutor
        def match_single(item):
            idx, q = item
            q_clean = q.strip()
            match = SpotifyService.search_track(q_clean)
            if match:
                match['track_number'] = idx + 1
                match['source'] = 'DJ Tracklist'
                return match
            artist = ''
            title = q_clean
            if ' - ' in q_clean:
                parts = q_clean.split(' - ', 1)
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

        with ThreadPoolExecutor(max_workers=12) as ex:
            results = list(ex.map(match_single, enumerate(queries)))
        from ..services.history_service import HistoryService
        return HistoryService.mark_existing_tracks(results)

    def get_history(self) -> List[Dict]:
        from ..services.history_service import HistoryService
        return HistoryService.sync_downloads_folder(self.output_dir)

    def sync_library(self) -> List[Dict]:
        from ..services.history_service import HistoryService
        return HistoryService.sync_downloads_folder(self.output_dir)

    def save_tags(self, track_info: Dict) -> bool:
        """Updates tags on an existing audio file."""
        filepath = track_info.get('filepath')
        if filepath and os.path.exists(filepath):
            from ..services.tagger_service import TaggerService
            TaggerService.apply_tags(filepath, track_info)
            return True
        return False

    def generate_ai_playlist(self, prompt: str, count: int = 15, api_key: str = '', provider: str = 'gemini') -> Dict:
        """Generates AI DJ setlist based on mood, venue, and audience vibe."""
        from ..services.ai_curator_service import AICuratorService
        return AICuratorService.generate_playlist(prompt, count=count, api_key=api_key or None, provider=provider)

def run_app():
    api = DJWebviewApi()
    dist_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', 'dist', 'index.html'))
    html_path = dist_path if os.path.exists(dist_path) else os.path.abspath(os.path.join(os.path.dirname(__file__), 'index.html'))
    
    window = webview.create_window(
        title='Spotify DJ Suite & Harmonic Mixtape (rekordbox Ready)',
        url=html_path,
        js_api=api,
        width=1200,
        height=800,
        min_size=(980, 640),
        background_color='#000000'
    )
    webview.start(debug=False)