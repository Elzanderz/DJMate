# -*- coding: utf-8 -*-
import re
import yt_dlp
from typing import List, Dict, Optional

class YouTubeMixtapeService:
    """
    Extracts individual tracklist from full DJ Mixtape / Live Set videos on YouTube
    using YouTube Chapters, Description Timestamps, and Metadata.
    """

    TIMESTAMP_REGEX = re.compile(
        r'(?:\[|\()?\b(\d{1,2}:\d{2}(?::\d{2})?)\b(?:\]|\))?\s*[-–—:]?\s*(.+)',
        re.MULTILINE
    )

    CLEANUP_REGEX = re.compile(
        r'^(?:\d+[\.\)\-]\s*|\s*[-–—•]\s*)'
    )

    @classmethod
    def is_youtube_url(cls, url: str) -> bool:
        u = (url or '').strip()
        return bool(re.search(r'(?:youtube\.com\/(?:watch\?|embed\/|shorts\/|playlist\?)|youtu\.be\/|music\.youtube\.com\/)', u, flags=re.I))

    @classmethod
    def extract_mixtape_tracks(cls, url: str) -> List[Dict]:
        """
        Extracts songs from any YouTube URL: Single Video, Remix, Playlist, DJ Mixtape or Live Set.
        """
        url = url.strip()
        ydl_opts = {
            'quiet': True,
            'no_warnings': True,
            'skip_download': True,
            'extract_flat': 'in_playlist',
        }

        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=False)
                if not info:
                    return []

                tracks = []

                # Case 1: YouTube Playlist (playlist?list=...)
                if info.get('_type') == 'playlist' or ('entries' in info and isinstance(info.get('entries'), list)):
                    playlist_title = info.get('title') or 'YouTube Playlist'
                    entries = info.get('entries', [])
                    for idx, e in enumerate(entries):
                        if not e:
                            continue
                        e_id = e.get('id', '')
                        e_title = e.get('title', f'Track {idx+1}')
                        e_uploader = e.get('uploader', '')
                        e_thumb = e.get('thumbnail') or (f"https://i.ytimg.com/vi/{e_id}/hqdefault.jpg" if e_id else '')
                        e_dur = int(e.get('duration', 0) * 1000) if e.get('duration') else 0

                        artist, title = cls._split_artist_title(e_title)
                        if not artist and e_uploader:
                            artist = e_uploader

                        tracks.append({
                            'id': f"yt_{e_id}" if e_id else f"yt_p_{idx+1}",
                            'title': title,
                            'artist': artist,
                            'album': playlist_title,
                            'playlist_name': playlist_title,
                            'source': 'YouTube',
                            'duration_ms': e_dur,
                            'cover_url': e_thumb,
                            'year': '',
                            'track_number': idx + 1,
                            'search_query': e_title,
                            'direct_url': f"https://www.youtube.com/watch?v={e_id}" if e_id else url
                        })
                    if tracks:
                        return tracks

                # Case 2: Single Video / DJ Mixtape
                video_title = info.get('title', 'YouTube Audio')
                vid_id = info.get('id', '')
                description = info.get('description', '')
                thumbnail = info.get('thumbnail') or (f"https://i.ytimg.com/vi/{vid_id}/hqdefault.jpg" if vid_id else '')
                chapters = info.get('chapters')
                uploader = info.get('uploader', '')
                direct_url = f"https://www.youtube.com/watch?v={vid_id}" if vid_id else url

                # Method 1: Check YouTube native Video Chapters
                if chapters and len(chapters) > 1:
                    for idx, ch in enumerate(chapters):
                        ch_title = ch.get('title', '').strip()
                        if not ch_title or ch_title.lower() in ('intro', 'outro', 'start'):
                            continue

                        clean_title = cls._clean_track_name(ch_title)
                        artist, title = cls._split_artist_title(clean_title)
                        duration_s = ch.get('end_time', 0) - ch.get('start_time', 0)

                        tracks.append({
                            'id': f"yt_ch_{idx+1}",
                            'title': title,
                            'artist': artist,
                            'album': video_title,
                            'playlist_name': video_title,
                            'source': 'YouTube Mixtape',
                            'duration_ms': int(duration_s * 1000) if duration_s > 0 else 0,
                            'cover_url': thumbnail,
                            'year': '',
                            'track_number': idx + 1,
                            'search_query': f"{artist} - {title}" if artist else title,
                            'direct_url': direct_url
                        })

                # Method 2: Parse Tracklist Timestamps from Description
                if not tracks and description:
                    parsed_lines = cls.parse_timestamps_from_text(description)
                    if len(parsed_lines) >= 2:
                        for idx, item in enumerate(parsed_lines):
                            artist, title = cls._split_artist_title(item['name'])
                            tracks.append({
                                'id': f"yt_desc_{idx+1}",
                                'title': title,
                                'artist': artist,
                                'album': video_title,
                                'playlist_name': video_title,
                                'source': 'YouTube Mixtape',
                                'duration_ms': 0,
                                'cover_url': thumbnail,
                                'year': '',
                                'track_number': idx + 1,
                                'search_query': f"{artist} - {title}" if artist else title,
                                'direct_url': direct_url
                            })

                # Method 3: Single Video / Song / Remix (Default for regular YouTube music videos)
                if not tracks:
                    artist, title = cls._split_artist_title(video_title)
                    if not artist and uploader:
                        artist = uploader

                    tracks.append({
                        'id': f"yt_{vid_id}" if vid_id else "yt_single",
                        'title': title or video_title,
                        'artist': artist,
                        'album': uploader or 'YouTube',
                        'playlist_name': 'YouTube Downloads',
                        'source': 'YouTube',
                        'duration_ms': int(info.get('duration', 0) * 1000),
                        'cover_url': thumbnail,
                        'year': '',
                        'track_number': 1,
                        'search_query': video_title,
                        'direct_url': direct_url
                    })

                return tracks

        except Exception as e:
            print(f"Error extracting YouTube tracks: {e}")
            return []

    @classmethod
    def _enrich_with_spotify(cls, tracks: List[Dict]) -> List[Dict]:
        """Lookup Spotify official database to fetch studio cover art, clean artist, and album tags in parallel."""
        from .spotify_service import SpotifyService
        from concurrent.futures import ThreadPoolExecutor

        def enrich_single(t):
            query = t.get('search_query') or f"{t.get('artist', '')} - {t.get('title', '')}".strip(' -')
            if query:
                try:
                    sp_match = SpotifyService.search_track(query)
                    if sp_match:
                        t['title'] = sp_match['title']
                        if sp_match.get('artist'):
                            t['artist'] = sp_match['artist']
                        if sp_match.get('album'):
                            t['album'] = sp_match['album']
                        if sp_match.get('cover_url'):
                            t['cover_url'] = sp_match['cover_url']
                        if sp_match.get('year'):
                            t['year'] = sp_match['year']
                        if sp_match.get('id'):
                            t['id'] = sp_match['id']
                        t['search_query'] = sp_match.get('search_query', query)
                except Exception:
                    pass
            return t

        with ThreadPoolExecutor(max_workers=6) as executor:
            list(executor.map(enrich_single, tracks))

        return tracks

    @classmethod
    def _extract_music_in_this_video(cls, video_url: str) -> List[Dict]:
        """Extract songs from YouTube's official 'Music in this video' (Content ID Tag list)."""
        import requests, re, json
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Accept-Language': 'en-US,en;q=0.9,th;q=0.8'
        }
        try:
            r = requests.get(video_url, headers=headers, timeout=8)
            if r.status_code != 200:
                return []
            
            match = re.search(r'var ytInitialData = ({.*?});</script>', r.text) or re.search(r'window\["ytInitialData"\] = ({.*?});', r.text)
            if not match:
                return []
            
            data = json.loads(match.group(1))
            music_items = []
            
            def search_dict(d):
                if isinstance(d, dict):
                    if 'horizontalCardListRenderer' in d:
                        cards = d['horizontalCardListRenderer'].get('cards', [])
                        for card in cards:
                            renderer = card.get('videoAttributeViewModel', {}) or card.get('videoAttributeView', {})
                            if renderer:
                                title = renderer.get('title', '').strip()
                                sub = renderer.get('subtitle', '').strip()
                                img = renderer.get('image', {}).get('sources', [{}])[0].get('url', '')
                                if title:
                                    music_items.append({'title': title, 'artist': sub, 'cover_url': img})
                    for k, v in d.items():
                        search_dict(v)
                elif isinstance(d, list):
                    for item in d:
                        search_dict(item)

            search_dict(data)
            return music_items
        except Exception:
            return []

    @classmethod
    def parse_timestamps_from_text(cls, text: str) -> List[Dict]:
        results = []
        lines = text.splitlines()
        for line in lines:
            line = line.strip()
            if not line:
                continue
            match = cls.TIMESTAMP_REGEX.search(line)
            if match:
                time_str = match.group(1).strip()
                name_str = match.group(2).strip()
                clean_name = cls._clean_track_name(name_str)
                if len(clean_name) > 2 and clean_name.lower() not in ('intro', 'outro', 'start', 'end'):
                    results.append({
                        'timestamp': time_str,
                        'name': clean_name
                    })
        return results

    @classmethod
    def _clean_track_name(cls, raw: str) -> str:
        s = cls.CLEANUP_REGEX.sub('', raw).strip()
        s = re.sub(r'\[(?:FREE DOWNLOAD|OFFICIAL VIDEO|HQ|HD|OUT NOW)\]', '', s, flags=re.IGNORECASE).strip()
        s = re.sub(r'\((?:FREE DOWNLOAD|OFFICIAL VIDEO|HQ|HD|OUT NOW)\)', '', s, flags=re.IGNORECASE).strip()
        return s

    @classmethod
    def _split_artist_title(cls, full_text: str):
        if ' - ' in full_text:
            parts = full_text.split(' - ', 1)
            return parts[0].strip(), parts[1].strip()
        elif ' – ' in full_text:
            parts = full_text.split(' – ', 1)
            return parts[0].strip(), parts[1].strip()
        elif ' : ' in full_text:
            parts = full_text.split(' : ', 1)
            return parts[0].strip(), parts[1].strip()
        return '', full_text.strip()