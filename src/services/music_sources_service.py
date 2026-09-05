# -*- coding: utf-8 -*-
import re
import json
import requests
from typing import List, Dict, Optional
from .genre_classifier_service import GenreClassifierService

class SoundCloudService:
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    }

    @classmethod
    def is_soundcloud_url(cls, url: str) -> bool:
        if not url:
            return False
        return bool(re.search(r'(?:soundcloud\.com/[^/]+/[^/]+|on\.soundcloud\.com/\w+|m\.soundcloud\.com/[^/]+)', url.strip(), re.I))

    @classmethod
    def get_info(cls, url: str) -> List[Dict]:
        url = url.strip()
        tracks: List[Dict] = []
        try:
            # Resolve mobile shortened URLs (on.soundcloud.com)
            if 'on.soundcloud.com' in url:
                try:
                    resp = requests.head(url, headers=cls.headers, allow_redirects=True, timeout=5)
                    if resp and resp.url:
                        url = resp.url
                except Exception:
                    pass

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

                is_set = bool(re.search(r'/sets/', url, re.I))
                
                # If single track vs playlist/set
                if '_type' not in info or info.get('_type') == 'video' or not is_set:
                    entries = [info] if ('_type' not in info or info.get('_type') == 'video') else entries
                    playlist_title = 'SoundCloud'
                else:
                    playlist_title = info.get('title') or 'SoundCloud Set'

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
                    if thumb and '-large.' in thumb:
                        thumb = thumb.replace('-large.', '-t500x500.')

                    duration_ms = int(float(entry.get('duration') or 180) * 1000)
                    track_url = entry.get('webpage_url') or entry.get('url') or url

                    tracks.append({
                        'id': f"sc_{entry.get('id', idx)}",
                        'title': title_clean,
                        'artist': artist or 'SoundCloud Artist',
                        'album': playlist_title if is_set else (uploader or 'SoundCloud Release'),
                        'duration_ms': duration_ms,
                        'cover_url': thumb,
                        'genre': entry.get('genre') if entry.get('genre') and entry.get('genre').lower() not in ('dance', 'electronic', 'all') else GenreClassifierService.classify(artist or 'SoundCloud Artist', title_clean, playlist=playlist_title),
                        'camelot': '8A',
                        'bpm': 126.0,
                        'stars': 4,
                        'track_number': idx,
                        'source': 'SoundCloud',
                        'playlist_name': playlist_title,
                        'direct_url': track_url,
                        'url': track_url,
                        'sc_url': track_url,
                    })

            return tracks
        except Exception as e:
            print(f"[SoundCloudService] Error: {e}")
            return []


class BandcampService:
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    }

    @classmethod
    def is_bandcamp_url(cls, url: str) -> bool:
        if not url:
            return False
        return bool(re.search(r'[\w-]+\.bandcamp\.com/(?:track|album)/', url.strip(), re.I))

    @classmethod
    def get_info(cls, url: str) -> List[Dict]:
        url = url.strip()
        tracks: List[Dict] = []
        try:
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

                album_title = info.get('title') or 'Bandcamp Release'
                artist = info.get('artist') or info.get('uploader') or ''
                album_thumb = info.get('thumbnail') or ''

                if '_type' not in info or info.get('_type') == 'video':
                    entries = [info]
                else:
                    entries = info.get('entries', [])

                # If album flat extraction omitted artist or thumbnail, fetch first track to resolve artwork & artist
                if (not artist or not album_thumb) and entries and entries[0].get('url'):
                    try:
                        first_info = ydl.extract_info(entries[0]['url'], download=False)
                        if not artist:
                            artist = first_info.get('artist') or first_info.get('uploader') or ''
                        if not album_thumb:
                            album_thumb = first_info.get('thumbnail') or ''
                    except Exception as first_err:
                        print(f"[BandcampService] Notice resolving first track: {first_err}")

                # Upgrade Bandcamp cover art to original/high-res master (_10.jpg)
                if album_thumb and '_5.jpg' in album_thumb:
                    album_thumb = album_thumb.replace('_5.jpg', '_10.jpg')

                for idx, entry in enumerate(entries, 1):
                    title = entry.get('title') or 'Bandcamp Track'
                    entry_artist = entry.get('artist') or entry.get('uploader') or artist
                    thumb = entry.get('thumbnail') or album_thumb
                    if thumb and '_5.jpg' in thumb:
                        thumb = thumb.replace('_5.jpg', '_10.jpg')

                    dur_sec = float(entry.get('duration') or 180)
                    track_url = entry.get('webpage_url') or entry.get('url') or url

                    tracks.append({
                        'id': f"bc_{entry.get('id', idx)}",
                        'title': title,
                        'artist': entry_artist or 'Bandcamp Artist',
                        'album': album_title,
                        'duration_ms': int(dur_sec * 1000),
                        'cover_url': thumb,
                        'genre': GenreClassifierService.classify(entry_artist or 'Bandcamp Artist', title, playlist=album_title),
                        'camelot': '8A',
                        'bpm': 125.0,
                        'stars': 4,
                        'track_number': idx,
                        'source': 'Bandcamp',
                        'playlist_name': album_title,
                        'direct_url': track_url,
                        'url': track_url,
                    })
            return tracks
        except Exception as e:
            print(f"[BandcampService] Error: {e}")
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
                                            'genre': GenreClassifierService.classify(t_artist or 'Apple Music Artist', t_name, playlist=playlist_name),
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
