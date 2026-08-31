# -*- coding: utf-8 -*-
import re
import json
import requests
from typing import List, Dict, Optional

class SoundCloudService:
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    }

    @classmethod
    def is_soundcloud_url(cls, url: str) -> bool:
        return bool(re.search(r'soundcloud\.com/[^/]+/[^/]+', url, re.I))

    @classmethod
    def get_info(cls, url: str) -> List[Dict]:
        url = url.strip()
        tracks: List[Dict] = []
        try:
            # Try yt-dlp flat extraction for complete playlist/track details
            import yt_dlp
            ydl_opts = {
                'extract_flat': True,
                'quiet': True,
                'no_warnings': True,
            }
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=False)
                if not info:
                    return []

                playlist_title = info.get('title') or 'SoundCloud Set'
                
                # If single track
                if '_type' not in info or info.get('_type') == 'video':
                    entries = [info]
                else:
                    entries = info.get('entries', [])

                for idx, entry in enumerate(entries, 1):
                    title = entry.get('title') or 'Unknown Title'
                    uploader = entry.get('uploader') or entry.get('artist') or ''
                    
                    if ' - ' in title and not uploader:
                        parts = title.split(' - ', 1)
                        artist = parts[0].strip()
                        title_clean = parts[1].strip()
                    else:
                        artist = uploader
                        title_clean = title

                    thumb = entry.get('thumbnail') or ''
                    duration_ms = int(float(entry.get('duration') or 180) * 1000)

                    tracks.append({
                        'id': f"sc_{entry.get('id', idx)}",
                        'title': title_clean,
                        'artist': artist or 'SoundCloud Artist',
                        'album': playlist_title,
                        'duration_ms': duration_ms,
                        'cover_url': thumb,
                        'genre': entry.get('genre') or 'Electronic / Dance',
                        'camelot': '8A',
                        'bpm': 126.0,
                        'stars': 4,
                        'track_number': idx,
                        'source': 'SoundCloud',
                        'playlist_name': playlist_title,
                        'sc_url': entry.get('url') or entry.get('webpage_url') or url,
                    })

            return tracks
        except Exception as e:
            print(f"[SoundCloudService] Error: {e}")
            return []


class AppleMusicService:
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    }

    @classmethod
    def is_applemusic_url(cls, url: str) -> bool:
        return bool(re.search(r'music\.apple\.com/[^/]+/(?:album|playlist|song)/', url, re.I))

    @classmethod
    def get_info(cls, url: str) -> List[Dict]:
        url = url.strip()
        tracks: List[Dict] = []
        try:
            res = requests.get(url, headers=cls.headers, timeout=12)
            if res.status_code != 200:
                return []

            json_ld_matches = re.findall(r'<script type="application/ld\+json">(.+?)</script>', res.text, re.DOTALL)
            playlist_name = 'Apple Music'

            for jld in json_ld_matches:
                try:
                    data = json.loads(jld.strip())
                    if isinstance(data, dict):
                        if data.get('@type') in ('MusicPlaylist', 'MusicAlbum'):
                            playlist_name = data.get('name') or playlist_name
                            track_items = data.get('track', [])
                            if isinstance(track_items, list):
                                for idx, tr in enumerate(track_items, 1):
                                    t_name = tr.get('name')
                                    t_artist = ''
                                    by_artist = tr.get('byArtist', {})
                                    if isinstance(by_artist, dict):
                                        t_artist = by_artist.get('name', '')
                                    elif isinstance(by_artist, list) and by_artist:
                                        t_artist = by_artist[0].get('name', '')
                                    
                                    img = data.get('image') or ''
                                    if isinstance(img, dict):
                                        img = img.get('url', '')

                                    if t_name:
                                        tracks.append({
                                            'id': f"am_{idx}",
                                            'title': t_name,
                                            'artist': t_artist or 'Apple Music Artist',
                                            'album': playlist_name,
                                            'duration_ms': 180000,
                                            'cover_url': img,
                                            'genre': 'Pop / Dance',
                                            'camelot': '8A',
                                            'bpm': 124.0,
                                            'stars': 4,
                                            'track_number': idx,
                                            'source': 'Apple Music',
                                            'playlist_name': playlist_name,
                                        })
                except Exception:
                    continue

            return tracks
        except Exception as e:
            print(f"[AppleMusicService] Error: {e}")
            return []
