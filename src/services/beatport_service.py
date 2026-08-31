# -*- coding: utf-8 -*-
import re
import json
import requests
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

class BeatportService:
    """
    Extracts high-resolution DJ track metadata, Camelot Key, BPM, Mix Title,
    Genre, Cover Art, and Label from Beatport track, release, top-100, and chart URLs.
    """
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
    }

    @classmethod
    def is_beatport_url(cls, url: str) -> bool:
        if not url:
            return False
        return bool(re.search(r'beatport\.com', url.strip(), re.IGNORECASE))

    @classmethod
    def _normalize_image_url(cls, img_data: any) -> str:
        if not img_data:
            return ''
        if isinstance(img_data, str):
            url = img_data
        elif isinstance(img_data, dict):
            if 'dynamic_uri' in img_data and img_data['dynamic_uri']:
                return img_data['dynamic_uri'].replace('{w}', '500').replace('{h}', '500')
            url = img_data.get('uri', '')
        else:
            return ''

        if url:
            url = re.sub(r'image_size/\d+x\d+/', 'image_size/500x500/', url)
        return url

    @classmethod
    def _parse_track_item(cls, item: dict, idx: int = 1) -> Optional[Dict]:
        if not isinstance(item, dict):
            return None
        title = item.get('name', '').strip()
        if not title:
            return None

        mix_name = (item.get('mix_name') or '').strip()
        display_title = f"{title} ({mix_name})" if mix_name and mix_name.lower() not in ('original mix', 'original') else title

        artists_list = [a.get('name') for a in item.get('artists', []) if isinstance(a, dict) and a.get('name')]
        remixers_list = [r.get('name') for r in item.get('remixers', []) if isinstance(r, dict) and r.get('name')]
        
        all_artists = artists_list.copy()
        for r in remixers_list:
            if r not in all_artists:
                all_artists.append(r)
        
        artist_str = ', '.join(artists_list) if artists_list else ''
        
        # BPM
        bpm = item.get('bpm')
        try:
            bpm = float(bpm) if bpm else 124.0
        except Exception:
            bpm = 124.0

        # Key & Camelot
        key_obj = item.get('key')
        camelot = '--'
        key_name = 'Unknown'
        if isinstance(key_obj, dict):
            c_num = key_obj.get('camelot_number')
            c_let = key_obj.get('camelot_letter')
            if c_num and c_let:
                camelot = f"{c_num}{c_let}"
            key_name = key_obj.get('name', 'Unknown')
        elif isinstance(key_obj, str):
            key_name = key_obj
            c_match = re.search(r'\b([1-9]|1[0-2])[AB]\b', key_obj)
            if c_match:
                camelot = c_match.group(0)

        color = CAMELOT_COLORS.get(camelot, '#666666')

        # Genre
        genre_obj = item.get('genre')
        genre = 'Electronic'
        if isinstance(genre_obj, dict):
            genre = genre_obj.get('name', 'Electronic')
        elif isinstance(genre_obj, str):
            genre = genre_obj

        # Subgenre if available
        sub_genre = item.get('sub_genre')
        if isinstance(sub_genre, dict) and sub_genre.get('name'):
            genre = f"{genre} / {sub_genre.get('name')}"

        # Image Cover: Always prioritize release/album square cover art over waveform banner
        release_obj = item.get('release')
        album_name = ''
        label_name = ''
        image_url = ''
        if isinstance(release_obj, dict):
            album_name = release_obj.get('name', '')
            image_url = cls._normalize_image_url(release_obj.get('image'))
            label_obj = release_obj.get('label')
            if isinstance(label_obj, dict):
                label_name = label_obj.get('name', '')

        if not image_url:
            raw_img = item.get('image')
            if isinstance(raw_img, dict) and '1500x250' not in str(raw_img.get('uri', '')):
                image_url = cls._normalize_image_url(raw_img)
            elif isinstance(raw_img, str) and '1500x250' not in raw_img:
                image_url = cls._normalize_image_url(raw_img)

        # Year / Date
        date_str = item.get('publish_date') or item.get('release_date') or (release_obj.get('publish_date') if isinstance(release_obj, dict) else '')
        year = date_str[:4] if date_str and len(date_str) >= 4 else ''

        # Search Query for YouTube/Streaming full track
        search_query = f"{artist_str} - {title} ({mix_name})" if mix_name else f"{artist_str} - {title}"

        duration_ms = item.get('length_ms') or (int(item.get('length', 0) * 1000) if item.get('length') else 0)

        stars = 4
        if bpm >= 130:
            stars = 5
        elif bpm <= 118:
            stars = 3

        return {
            'id': f"bp_{item.get('id', idx)}",
            'title': display_title,
            'artist': artist_str,
            'album': album_name,
            'label': label_name,
            'duration_ms': duration_ms,
            'cover_url': image_url,
            'bpm': bpm,
            'camelot': camelot,
            'key_name': key_name,
            'color': color,
            'genre': genre,
            'year': year,
            'track_number': idx,
            'search_query': search_query,
            'energy': min(10, max(1, int(round((bpm - 100) / 7.0)))) if bpm else 6,
            'stars': stars,
            'rating_255': int(stars * 51)
        }

    @classmethod
    def get_info(cls, url: str) -> List[Dict]:
        """
        Fetch track metadata from Beatport URL.
        Supports single tracks, releases, charts, and Top 100 lists.
        """
        url = url.strip()
        try:
            res = requests.get(url, headers=cls.headers, timeout=12)
            if res.status_code != 200:
                return []
            
            m = re.search(r'<script id="__NEXT_DATA__" type="application/json">(.+?)</script>', res.text)
            if not m:
                return []
            data = json.loads(m.group(1))
            page_props = data.get('props', {}).get('pageProps', {})

            # Extract playlist / chart name
            chart_obj = page_props.get('chart') or {}
            rel_obj = page_props.get('release') or {}
            playlist_name = chart_obj.get('name') or rel_obj.get('name') or ''
            if not playlist_name:
                slug_match = re.search(r'beatport\.com/(?:chart|release|genre)/([^/]+)/(\d+)', url)
                if slug_match:
                    playlist_name = slug_match.group(1).replace('-', ' ').title()
            if not playlist_name:
                playlist_name = 'Beatport Chart'

            tracks: List[Dict] = []

            # 1. Single Track Page
            if 'track' in page_props:
                tr = cls._parse_track_item(page_props['track'], 1)
                if tr:
                    tr['source'] = 'Beatport'
                    tr['playlist_name'] = playlist_name
                    tracks.append(tr)
                return tracks

            # 2. Release / Album Page
            if 'release' in page_props:
                rel = page_props['release']
                rel_tracks = rel.get('tracks', [])
                if rel_tracks:
                    for i, t in enumerate(rel_tracks, 1):
                        if isinstance(t, dict):
                            if not t.get('image'):
                                t['image'] = rel.get('image')
                            if not t.get('release'):
                                t['release'] = rel
                            parsed = cls._parse_track_item(t, i)
                            if parsed:
                                parsed['source'] = 'Beatport'
                                parsed['playlist_name'] = playlist_name
                                tracks.append(parsed)
                    if tracks:
                        return tracks

            # 3. DehydratedState Queries (Top 100, Genre Charts, Playlists, Crates)
            queries = page_props.get('dehydratedState', {}).get('queries', [])
            seen_ids = set()
            next_url = None

            for q in queries:
                q_data = q.get('state', {}).get('data', {})
                if isinstance(q_data, dict):
                    if q_data.get('next'):
                        next_url = q_data.get('next')
                    results = q_data.get('results', [])
                    if results:
                        for i, item in enumerate(results, len(tracks) + 1):
                            parsed = cls._parse_track_item(item, i)
                            if parsed:
                                tid = str(parsed.get('id') or parsed.get('title'))
                                if tid not in seen_ids:
                                    seen_ids.add(tid)
                                    parsed['source'] = 'Beatport'
                                    parsed['playlist_name'] = playlist_name
                                    tracks.append(parsed)

            # 4. Multi-Page Extraction: Fetch all remaining tracks via Beatport API
            anon_session = page_props.get('anonSession', {})
            token = anon_session.get('access_token')
            chart_id = chart_obj.get('id')

            if token and (next_url or chart_id):
                api_headers = {
                    'User-Agent': cls.headers['User-Agent'],
                    'Authorization': f'Bearer {token}',
                    'Accept': 'application/json',
                }
                cur_url = next_url or (f"https://api.beatport.com/v4/catalog/charts/{chart_id}/tracks/?page=2&per_page=100" if chart_id else None)
                while cur_url:
                    public_api_url = re.sub(r'https?://[^/]+', 'https://api.beatport.com', cur_url)
                    try:
                        api_res = requests.get(public_api_url, headers=api_headers, timeout=12)
                        if api_res.status_code == 200:
                            api_json = api_res.json()
                            results = api_json.get('results', [])
                            if not results:
                                break
                            new_count = 0
                            for item in results:
                                parsed = cls._parse_track_item(item, len(tracks) + 1)
                                if parsed:
                                    tid = str(parsed.get('id') or parsed.get('title'))
                                    if tid not in seen_ids:
                                        seen_ids.add(tid)
                                        parsed['source'] = 'Beatport'
                                        parsed['playlist_name'] = playlist_name
                                        tracks.append(parsed)
                                        new_count += 1
                            if not api_json.get('next') or new_count == 0:
                                break
                            cur_url = api_json.get('next')
                        else:
                            break
                    except Exception:
                        break

            return tracks
        except Exception:
            return []
