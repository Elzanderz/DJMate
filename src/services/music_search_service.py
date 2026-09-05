# -*- coding: utf-8 -*-
import os
import re
import json
import time
import unicodedata
import requests
from typing import List, Dict, Optional, Tuple
from concurrent.futures import ThreadPoolExecutor
from .genre_classifier_service import GenreClassifierService

class MusicSearchService:
    @staticmethod
    def normalize_text(text: str) -> str:
        """
        Normalize text for robust comparison across Thai and English.
        Handles Unicode NFC normalization, case folding, stripping punctuation and redundant whitespace.
        """
        if not text:
            return ""
        # 1. Unicode NFC normalization
        t = unicodedata.normalize('NFC', str(text)).strip().lower()
        # 2. Remove common remix/tag brackets
        t = re.sub(r'\s*[\(\[\{](?:official|audio|video|lyric|lyrics|clean|dirty|edit|remix|bootleg|flip|vip|dub|mashup|extended|club|hq|hd|original\s*mix|mv)[^\)\]\}]*[\)\]\}]', '', t, flags=re.I)
        t = re.sub(r'[\(\[\{].*?[\)\]\}]', '', t)
        # 3. Replace punctuation and separators with space
        t = re.sub(r'[^\w\s\u0E00-\u0E7F]', ' ', t)
        # 4. Collapse spaces
        t = re.sub(r'\s+', ' ', t).strip()
        return t

    @staticmethod
    def strip_thai_tones(text: str) -> str:
        """
        Strip Thai tone marks and diacritics for tolerant fuzzy search
        (e.g., 'โต๊ะ' -> 'โตะ', 'ไม้' -> 'ไม', preserves 'รัก' as 'รัก')
        """
        if not text:
            return ""
        # Thai tone marks: U+0E48-U+0E4C (Mai Ek, Mai Tho, Mai Tri, Mai Chattawa, Thanthakhat/Garan), U+0E47 (Maitaikhu)
        tones = re.compile(r'[\u0E48-\u0E4C\u0E47\u0E4D\u0E4E\u0E3A]')
        return tones.sub('', text)

    @classmethod
    def match_score(cls, query: str, candidate_text: str) -> float:
        """
        Calculate matching score (0 to 100) between query and candidate text.
        Supports exact match, token containment, Thai tone-stripped matching.
        """
        q_norm = cls.normalize_text(query)
        c_norm = cls.normalize_text(candidate_text)
        if not q_norm or not c_norm:
            return 0.0

        if q_norm == c_norm:
            return 100.0

        if q_norm in c_norm:
            # Substring match ratio
            ratio = len(q_norm) / float(len(c_norm))
            return 80.0 + (ratio * 15.0)

        # Token matching
        q_tokens = [tok for tok in q_norm.split() if tok]
        c_tokens = set([tok for tok in c_norm.split() if tok])
        if q_tokens:
            matched_tokens = [tok for tok in q_tokens if tok in c_norm or any(tok in ct for ct in c_tokens)]
            if len(matched_tokens) == len(q_tokens):
                return 75.0 + (len(matched_tokens) / len(q_tokens)) * 15.0
            elif matched_tokens:
                return 40.0 + (len(matched_tokens) / len(q_tokens)) * 30.0

        # Thai tone-stripped fuzzy matching
        q_notones = cls.strip_thai_tones(q_norm)
        c_notones = cls.strip_thai_tones(c_norm)
        if q_notones and q_notones in c_notones:
            return 70.0

        return 0.0

    @classmethod
    def search_local_library(cls, query: str, base_dir: Optional[str] = None, tracks: Optional[List[Dict]] = None) -> List[Dict]:
        """
        Intelligent local search inside downloaded tracks / folders.
        Searches title, artist, album, playlist_name, genre, key, and filename.
        """
        from .history_service import HistoryService
        local_tracks = tracks if tracks is not None else HistoryService.get_all()
        
        # If no tracks provided in db or need resync, check disk
        if not local_tracks and base_dir and os.path.exists(base_dir):
            local_tracks = HistoryService.sync_downloads_folder(base_dir)

        if not query or not query.strip():
            # Return all valid existing local tracks
            return [t for t in local_tracks if t.get('filepath') and os.path.exists(t.get('filepath', ''))]

        q = query.strip()
        scored_tracks = []

        for t in local_tracks:
            fp = t.get('filepath', '')
            if fp and not os.path.exists(fp):
                continue

            title = t.get('title', '')
            artist = t.get('artist', '')
            album = t.get('album', '')
            playlist = t.get('playlist_name', '')
            genre = t.get('genre', '')
            key_name = t.get('camelot', '') or t.get('key_name', '')
            filename = os.path.basename(fp) if fp else ''

            combined = f"{title} {artist} {album} {playlist} {genre} {filename}".strip()
            
            score_title = cls.match_score(q, title) * 1.3
            score_artist = cls.match_score(q, artist) * 1.1
            score_combined = cls.match_score(q, combined)
            
            best_score = max(score_title, score_artist, score_combined)

            # Special match for key e.g. "8A" or "11B"
            if q.upper() == key_name.upper():
                best_score = max(best_score, 85.0)

            # Special match for BPM e.g. "128"
            if q.isdigit() and t.get('bpm'):
                try:
                    target_bpm = float(q)
                    if abs(float(t.get('bpm', 0)) - target_bpm) < 1.0:
                        best_score = max(best_score, 85.0)
                except Exception:
                    pass

            if best_score > 35.0:
                t_copy = dict(t)
                t_copy['search_score'] = round(best_score, 1)
                t_copy['is_local'] = True
                t_copy['is_already_downloaded'] = True
                t_copy['existing_filepath'] = fp
                scored_tracks.append((best_score, t_copy))

        scored_tracks.sort(key=lambda x: x[0], reverse=True)
        return [item[1] for item in scored_tracks]

    @classmethod
    def search_itunes(cls, query: str, limit: int = 10, country: str = 'TH') -> List[Dict]:
        """Search iTunes / Apple Music catalog with support for Thai music & international."""
        results = []
        try:
            url = "https://itunes.apple.com/search"
            params = {
                'term': query,
                'media': 'music',
                'entity': 'song',
                'limit': limit,
                'country': country
            }
            r = requests.get(url, params=params, timeout=4)
            if r.status_code == 200:
                data = r.json().get('results', [])
                for d in data:
                    t_name = d.get('trackName', '')
                    a_name = d.get('artistName', '')
                    alb_name = d.get('collectionName', '')
                    cover = d.get('artworkUrl100', '').replace('100x100bb', '600x600bb')
                    dur_ms = int(d.get('trackTimeMillis', 0))
                    year = d.get('releaseDate', '')[:4] if d.get('releaseDate') else ''
                    preview_url = d.get('previewUrl', '')
                    track_id = f"it_{d.get('trackId', '')}"
                    genre = d.get('primaryGenreName', 'Pop')

                    results.append({
                        'id': track_id,
                        'title': t_name,
                        'artist': a_name,
                        'album': alb_name,
                        'duration_ms': dur_ms,
                        'cover_url': cover,
                        'preview_url': preview_url,
                        'year': year,
                        'genre': genre,
                        'source': 'iTunes / Apple Music',
                        'search_query': f"{a_name} - {t_name}" if a_name else t_name,
                        'raw_source': 'itunes'
                    })
        except Exception:
            pass
        return results

    @classmethod
    def search_deezer(cls, query: str, limit: int = 10) -> List[Dict]:
        """Search Deezer API with 30s audio previews and high quality metadata."""
        results = []
        try:
            url = "https://api.deezer.com/search"
            r = requests.get(url, params={'q': query, 'limit': limit}, timeout=4)
            if r.status_code == 200:
                data = r.json().get('data', [])
                for d in data:
                    t_name = d.get('title', '')
                    a_name = d.get('artist', {}).get('name', '')
                    alb_name = d.get('album', {}).get('title', '')
                    cover = d.get('album', {}).get('cover_big') or d.get('album', {}).get('cover_medium') or ''
                    dur_ms = int(d.get('duration', 0) * 1000)
                    preview_url = d.get('preview', '')
                    track_id = f"dz_{d.get('id', '')}"

                    results.append({
                        'id': track_id,
                        'title': t_name,
                        'artist': a_name,
                        'album': alb_name,
                        'duration_ms': dur_ms,
                        'cover_url': cover,
                        'preview_url': preview_url,
                        'year': '',
                        'genre': GenreClassifierService.classify(a_name, t_name),
                        'source': 'Deezer',
                        'search_query': f"{a_name} - {t_name}" if a_name else t_name,
                        'raw_source': 'deezer'
                    })
        except Exception:
            pass
        return results

    @classmethod
    def search_youtube(cls, query: str, limit: int = 8) -> List[Dict]:
        """
        Fast YouTube search using yt-dlp to find Thai songs, DJ mixes, live versions, and indie releases.
        """
        results = []
        try:
            import yt_dlp
            ydl_opts = {
                'quiet': True,
                'no_warnings': True,
                'extract_flat': 'in_playlist',
                'skip_download': True,
                'ignoreerrors': True,
            }
            search_term = f"ytsearch{limit}:{query}"
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(search_term, download=False)
                if info and 'entries' in info:
                    for idx, entry in enumerate(info['entries']):
                        if not entry:
                            continue
                        raw_title = entry.get('title', '')
                        uploader = entry.get('uploader') or entry.get('channel') or ''
                        dur = entry.get('duration') or 0
                        dur_ms = int(dur * 1000) if dur else 0
                        url = entry.get('url') or entry.get('webpage_url') or f"https://www.youtube.com/watch?v={entry.get('id')}"
                        thumbnails = entry.get('thumbnails', [])
                        cover = thumbnails[-1].get('url', '') if thumbnails else ''
                        
                        # Parse artist and clean title
                        artist = uploader
                        title = raw_title
                        if ' - ' in raw_title:
                            parts = raw_title.split(' - ', 1)
                            artist = parts[0].strip()
                            title = parts[1].strip()
                        elif ' – ' in raw_title:
                            parts = raw_title.split(' – ', 1)
                            artist = parts[0].strip()
                            title = parts[1].strip()

                        # Strip (Official MV), [Audio], etc. from title
                        clean_title = re.sub(r'[\(\[\{](?:official|mv|audio|video|lyric|lyrics|hq|hd)[^\)\]\}]*[\)\]\}]', '', title, flags=re.I).strip()
                        if clean_title:
                            title = clean_title

                        results.append({
                            'id': f"yt_{entry.get('id', idx)}",
                            'title': title,
                            'artist': artist,
                            'album': 'YouTube Release',
                            'duration_ms': dur_ms,
                            'cover_url': cover,
                            'preview_url': '',
                            'youtube_url': url,
                            'year': '',
                            'genre': GenreClassifierService.classify(artist, title),
                            'source': 'YouTube',
                            'search_query': f"{artist} - {title}" if artist else title,
                            'raw_source': 'youtube'
                        })
        except Exception:
            pass
        return results

    @classmethod
    def search_soundcloud(cls, query: str, limit: int = 8) -> List[Dict]:
        """
        Fast SoundCloud search using yt-dlp to find DJ edits, remixes, bootlegs, and club versions.
        """
        results = []
        try:
            import yt_dlp
            ydl_opts = {
                'quiet': True,
                'no_warnings': True,
                'extract_flat': True,
                'skip_download': True,
                'ignoreerrors': True,
            }
            search_term = f"scsearch{limit}:{query}"
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(search_term, download=False)
                if info and 'entries' in info:
                    for idx, entry in enumerate(info['entries']):
                        if not entry:
                            continue
                        raw_title = entry.get('title', '')
                        uploader = entry.get('uploader') or entry.get('artist') or ''
                        dur = entry.get('duration') or 0
                        dur_ms = int(dur * 1000) if dur else 0
                        url = entry.get('url') or entry.get('webpage_url') or ''
                        
                        cover = entry.get('thumbnail') or ''
                        thumbnails = entry.get('thumbnails', [])
                        if thumbnails:
                            cover = thumbnails[-1].get('url', cover)
                        if cover and '-large.' in cover:
                            cover = cover.replace('-large.', '-t500x500.')

                        artist = uploader
                        title = raw_title
                        if ' - ' in raw_title and not uploader:
                            parts = raw_title.split(' - ', 1)
                            artist = parts[0].strip()
                            title = parts[1].strip()

                        genre = entry.get('genre') if entry.get('genre') and entry.get('genre').lower() not in ('dance', 'electronic', 'all') else GenreClassifierService.classify(artist or 'SoundCloud Producer', title)

                        results.append({
                            'id': f"sc_{entry.get('id', idx)}",
                            'title': title,
                            'artist': artist or 'SoundCloud Producer',
                            'album': 'SoundCloud Release',
                            'duration_ms': dur_ms,
                            'cover_url': cover,
                            'preview_url': '',
                            'direct_url': url,
                            'url': url,
                            'sc_url': url,
                            'year': '',
                            'genre': genre,
                            'source': 'SoundCloud',
                            'search_query': f"{artist} - {title}" if artist else title,
                            'raw_source': 'soundcloud'
                        })
        except Exception as e:
            print(f"[MusicSearchService] SoundCloud search notice: {e}")
        return results

    @classmethod
    def search_online_tracks(cls, query: str, limit_per_source: int = 8, check_local: bool = True) -> List[Dict]:
        """
        Aggregate and deduplicate online search results across iTunes, Deezer, SoundCloud, and YouTube.
        Then, automatically marks if each song is ALREADY present in the local library!
        """
        if not query or len(query.strip()) < 1:
            return []

        q = query.strip()

        # Run multi-source searches in parallel for maximum responsiveness
        with ThreadPoolExecutor(max_workers=4) as executor:
            fut_itunes = executor.submit(cls.search_itunes, q, limit_per_source, 'TH')
            fut_deezer = executor.submit(cls.search_deezer, q, limit_per_source)
            fut_soundcloud = executor.submit(cls.search_soundcloud, q, limit_per_source)
            fut_youtube = executor.submit(cls.search_youtube, q, limit_per_source)

            res_itunes = fut_itunes.result()
            res_deezer = fut_deezer.result()
            res_soundcloud = fut_soundcloud.result()
            res_youtube = fut_youtube.result()

        # Combine results prioritizing rich metadata sources (iTunes / Deezer / SoundCloud first, then YouTube)
        raw_combined = []
        raw_combined.extend(res_itunes)
        raw_combined.extend(res_deezer)
        raw_combined.extend(res_soundcloud)
        raw_combined.extend(res_youtube)

        # Deduplicate across online sources by title & artist
        seen_keys = set()
        deduped = []
        for t in raw_combined:
            norm_t = cls.normalize_text(t.get('title', ''))
            norm_a = cls.normalize_text(t.get('artist', ''))
            key = f"{norm_a}::{norm_t}" if norm_a else norm_t
            if key and key not in seen_keys:
                seen_keys.add(key)
                deduped.append(t)
            elif not key:
                deduped.append(t)

        # Check local duplication
        if check_local:
            from .history_service import HistoryService
            deduped = HistoryService.mark_existing_tracks(deduped)

        return deduped

    @classmethod
    def search_unified(cls, query: str, base_dir: Optional[str] = None) -> Dict[str, List[Dict]]:
        """
        Unified Search Entry Point:
        Returns both:
        1. 'local_results': songs in local library / folders matching the query.
        2. 'online_results': songs found online with real-time duplicate status tag.
        """
        q = (query or '').strip()
        if not q:
            local = cls.search_local_library('', base_dir=base_dir)
            return {'local_results': local, 'online_results': []}

        # Run local and online searches in parallel
        with ThreadPoolExecutor(max_workers=2) as executor:
            fut_local = executor.submit(cls.search_local_library, q, base_dir)
            fut_online = executor.submit(cls.search_online_tracks, q, 10, True)

            local_res = fut_local.result()
            online_res = fut_online.result()

        return {
            'query': q,
            'local_results': local_res,
            'online_results': online_res,
            'local_count': len(local_res),
            'online_count': len(online_res)
        }
