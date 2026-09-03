import re
import json
import requests
from typing import List, Dict, Optional

class SpotifyService:
    _cover_cache = {}

    def __init__(self):
        self.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9,th;q=0.8',
        }

    def get_track_cover(self, track_id: str) -> str:
        """Fetch high-resolution cover art for a specific track ID."""
        if not track_id or track_id in ('custom', 'oembed', 'raw'):
            return ''
        if track_id in self._cover_cache:
            return self._cover_cache[track_id]

        try:
            oembed_url = f'https://open.spotify.com/oembed?url=https://open.spotify.com/track/{track_id}'
            res = requests.get(oembed_url, headers=self.headers, timeout=6)
            if res.status_code == 200:
                thumb = res.json().get('thumbnail_url', '')
                if thumb:
                    high_res = thumb.replace('00001e02', '0000b273')
                    self._cover_cache[track_id] = high_res
                    return high_res
        except Exception:
            pass

        return ''

    _client_initialized = False

    @classmethod
    def _ensure_spotify_client(cls):
        if not cls._client_initialized:
            try:
                from spotdl.utils.spotify import SpotifyClient
                if not SpotifyClient._instance:
                    SpotifyClient.init('', '')
                cls._client_initialized = True
            except Exception:
                pass

    @classmethod
    def _is_unwanted_version(cls, title: str, artist: str, query: str, expected_artist: str = '', expected_title: str = '') -> bool:
        """Check if candidate is an unwanted karaoke, tribute, or mismatched song."""
        t_low = (title or '').lower()
        a_low = (artist or '').lower()
        q_low = (query or '').lower()

        # If user explicitly searched for karaoke or tribute, allow it
        if 'karaoke' in q_low or 'tribute' in q_low or 'cover' in q_low:
            return False

        bad_phrases = [
            'karaoke', 'tribute to', 'originally performed by', 'originally by',
            'made famous by', 'in the style of', 'as made famous by', 'tribute version',
            'cover version', 'instrumental cover', 'backing track', 'minus one'
        ]
        if any(bad in t_low or bad in a_low for bad in bad_phrases):
            return True

        # Check artist match if an expected artist was given in query
        if expected_artist:
            exp_clean = re.sub(r'[^\w\s]', '', expected_artist.lower()).strip()
            art_clean = re.sub(r'[^\w\s]', '', a_low).strip()
            exp_words = [w for w in exp_clean.split() if len(w) > 1]
            if exp_words and not any(w in art_clean for w in exp_words):
                return True

        # Check title match if an expected title was given
        if expected_title:
            exp_t_clean = re.sub(r'[^\w\s]', '', expected_title.lower()).strip()
            title_clean = re.sub(r'[^\w\s]', '', t_low).strip()
            t_words = [w for w in exp_t_clean.split() if len(w) > 1]
            if t_words and not any(w in title_clean for w in t_words):
                return True

        return False

    @classmethod
    def search_track(cls, query: str) -> Optional[Dict]:
        """Search music databases (Deezer / iTunes / Spotify) for official track metadata, high-res cover art, album, and duration."""
        if not query or len(query.strip()) < 2:
            return None
        q = query.strip()

        # Extract expected artist and title if query is in 'Artist - Title' format
        expected_artist = ''
        expected_title = ''
        if ' - ' in q:
            parts = q.split(' - ', 1)
            expected_artist, expected_title = parts[0].strip(), parts[1].strip()
        elif ' – ' in q:
            parts = q.split(' – ', 1)
            expected_artist, expected_title = parts[0].strip(), parts[1].strip()

        # 1. Deezer Fast Public Search (Highest accuracy for DJ tracks, EDM, Hip-Hop, Pop)
        try:
            r = requests.get('https://api.deezer.com/search', params={'q': q, 'limit': 5}, timeout=2.5)
            if r.status_code == 200:
                data = r.json().get('data', [])
                for d in data:
                    artists = d.get('artist', {}).get('name', '')
                    title = d.get('title', q)
                    if cls._is_unwanted_version(title, artists, q, expected_artist, expected_title):
                        continue
                    album = d.get('album', {}).get('title', '')
                    cover = d.get('album', {}).get('cover_big') or d.get('album', {}).get('cover_medium') or ''
                    dur = int(d.get('duration', 0) * 1000)
                    dz_id = d.get('id', 'dz')
                    return {
                        'id': f'dz_{dz_id}',
                        'title': title,
                        'artist': artists,
                        'album': album,
                        'duration_ms': dur,
                        'cover_url': cover,
                        'year': '',
                        'search_query': f"{artists} - {title}" if artists else title
                    }
        except Exception:
            pass

        # 2. iTunes Public Search API Fallback
        try:
            r = requests.get('https://itunes.apple.com/search', params={'term': q, 'media': 'music', 'limit': 5}, timeout=2.5)
            if r.status_code == 200:
                results = r.json().get('results', [])
                for d in results:
                    artists = d.get('artistName', '')
                    title = d.get('trackName', q)
                    if cls._is_unwanted_version(title, artists, q, expected_artist, expected_title):
                        continue
                    album = d.get('collectionName', '')
                    cover = d.get('artworkUrl100', '').replace('100x100bb', '600x600bb')
                    dur = int(d.get('trackTimeMillis', 0))
                    year = d.get('releaseDate', '')[:4] if d.get('releaseDate') else ''
                    it_id = d.get('trackId', 'it')
                    return {
                        'id': f'it_{it_id}',
                        'title': title,
                        'artist': artists,
                        'album': album,
                        'duration_ms': dur,
                        'cover_url': cover,
                        'year': year,
                        'search_query': f"{artists} - {title}" if artists else title
                    }
        except Exception:
            pass

        # 3. SpotDL Fallback
        try:
            cls._ensure_spotify_client()
            from spotdl.types.song import Song
            song = Song.from_search_term(q)
            if song:
                artists = ', '.join(song.artists) if song.artists else ''
                return {
                    'id': song.song_id or 'sp_search',
                    'title': song.name or q,
                    'artist': artists,
                    'album': song.album_name or '',
                    'duration_ms': int(song.duration * 1000) if song.duration else 0,
                    'cover_url': song.cover_url or '',
                    'year': str(song.year) if song.year else '',
                    'search_query': f"{artists} - {song.name}" if artists else song.name
                }
        except Exception:
            pass
        return None

    def parse_url(self, url: str) -> Dict[str, str]:
        """Extract type and id from Spotify URL or URI."""
        url = url.strip()
        
        # URI format spotify:track:id
        uri_match = re.match(r'spotify:(track|album|playlist|artist):([a-zA-Z0-9]+)', url)
        if uri_match:
            return {'type': uri_match.group(1), 'id': uri_match.group(2)}

        # URL format https://open.spotify.com/track/id?si=...
        url_match = re.search(r'spotify\.com\/(track|album|playlist|artist)\/([a-zA-Z0-9]+)', url)
        if url_match:
            return {'type': url_match.group(1), 'id': url_match.group(2)}

        return {'type': 'unknown', 'query': url}

    def get_info(self, url: str) -> List[Dict]:
        """
        Fetch track metadata from Spotify link.
        Returns a list of track objects with title, artist, album, duration, cover_url, year.
        """
        parsed = self.parse_url(url)
        item_type = parsed.get('type')
        item_id = parsed.get('id')

        if item_type == 'unknown':
            # Plain search query
            return [{
                'id': 'custom',
                'title': parsed['query'],
                'artist': '',
                'album': '',
                'duration_ms': 0,
                'cover_url': '',
                'year': '',
                'track_number': 1,
                'search_query': parsed['query']
            }]

        # Auto-Healing candidate IDs for case variants
        candidate_ids = [item_id]
        if item_id:
            if item_id[-1].islower():
                candidate_ids.append(item_id[:-1] + item_id[-1].upper())
            elif item_id[-1].isupper():
                candidate_ids.append(item_id[:-1] + item_id[-1].lower())
            if 'l' in item_id:
                candidate_ids.append(item_id.replace('l', 'L'))
            if 'L' in item_id:
                candidate_ids.append(item_id.replace('L', 'l'))

        # Fast & Complete Spotify Web API Paginated Extractor for Playlists & Albums
        if item_type in ('playlist', 'album'):
            for cid in candidate_ids:
                try:
                    self._ensure_spotify_client()
                    from spotdl.utils.spotify import SpotifyClient
                    sp = SpotifyClient()
                    all_tracks = []
                    offset = 0
                    limit = 100
                    
                    if item_type == 'playlist':
                        p_name = 'Spotify Playlist'
                        try:
                            p_info = sp.playlist(cid, fields='name')
                            if p_info and p_info.get('name'):
                                p_name = p_info['name']
                        except Exception:
                            pass

                        while True:
                            res = sp.playlist_items(
                                cid,
                                fields='items(track(id,name,artists(name),album(name,images,release_date),duration_ms)),total,next',
                                limit=limit,
                                offset=offset
                            )
                            items = res.get('items', [])
                            if not items:
                                break
                            for item in items:
                                t = item.get('track')
                                if t and t.get('name'):
                                    artists = ', '.join([a['name'] for a in t.get('artists', [])])
                                    cover = t.get('album', {}).get('images', [{}])[0].get('url', '')
                                    year = t.get('album', {}).get('release_date', '')[:4]
                                    all_tracks.append({
                                        'id': t.get('id', f'sp_{len(all_tracks)+1}'),
                                        'title': t.get('name'),
                                        'artist': artists,
                                        'album': t.get('album', {}).get('name', ''),
                                        'playlist_name': p_name,
                                        'source': 'Spotify',
                                        'duration_ms': t.get('duration_ms', 0),
                                        'cover_url': cover,
                                        'year': year,
                                        'track_number': len(all_tracks) + 1,
                                        'search_query': f"{artists} - {t.get('name')}" if artists else t.get('name')
                                    })
                            total = res.get('total', len(all_tracks))
                            if not res.get('next') or len(all_tracks) >= total:
                                break
                            offset += limit
                        
                        if all_tracks:
                            from concurrent.futures import ThreadPoolExecutor
                            import urllib.parse

                            def enrich_track(t):
                                if t.get('cover_url'):
                                    return
                                # 1. Try iTunes search API
                                try:
                                    q = f"{t.get('artist', '')} {t.get('title', '')}".strip()
                                    if q:
                                        u = f"https://itunes.apple.com/search?term={urllib.parse.quote(q)}&entity=song&limit=1"
                                        r = requests.get(u, timeout=2.5).json()
                                        if r.get('results'):
                                            art = r['results'][0].get('artworkUrl100', '')
                                            if art:
                                                t['cover_url'] = art.replace('100x100bb', '640x640bb')
                                                return
                                except Exception:
                                    pass

                                # 2. Try Spotify oembed
                                tid = t.get('id', '')
                                if tid and not tid.startswith('sp_') and len(tid) > 10:
                                    try:
                                        u = f"https://open.spotify.com/oembed?url=https://open.spotify.com/track/{tid}"
                                        r = requests.get(u, timeout=2.0).json()
                                        thumb = r.get('thumbnail_url', '')
                                        if thumb:
                                            t['cover_url'] = thumb.replace('00001e02', '0000b273')
                                            return
                                    except Exception:
                                        pass

                            try:
                                with ThreadPoolExecutor(max_workers=12) as executor:
                                    list(executor.map(enrich_track, all_tracks))
                            except Exception:
                                pass

                            return all_tracks

                    elif item_type == 'album':
                        album_res = sp.album(cid)
                        if album_res:
                            album_name = album_res.get('name', '')
                            album_cover = album_res.get('images', [{}])[0].get('url', '')
                            year = album_res.get('release_date', '')[:4]
                            for idx, t in enumerate(album_res.get('tracks', {}).get('items', [])):
                                artists = ', '.join([a['name'] for a in t.get('artists', [])])
                                all_tracks.append({
                                    'id': t.get('id', f'sp_alb_{idx+1}'),
                                    'title': t.get('name'),
                                    'artist': artists,
                                    'album': album_name,
                                    'playlist_name': album_name,
                                    'source': 'Spotify',
                                    'duration_ms': t.get('duration_ms', 0),
                                    'cover_url': album_cover,
                                    'year': year,
                                    'track_number': idx + 1,
                                    'search_query': f"{artists} - {t.get('name')}" if artists else t.get('name')
                                })
                            if all_tracks:
                                return all_tracks
                except Exception:
                    pass

        # Fallback 1: Auto-Healing Spotify Embed Extractor
        for cid in candidate_ids:
            embed_url = f'https://open.spotify.com/embed/{item_type}/{cid}'
            try:
                res = requests.get(embed_url, headers=self.headers, timeout=8)
                if res.status_code == 200:
                    match = re.search(r'<script id=\"__NEXT_DATA__\" type=\"application\/json\">(.+?)<\/script>', res.text)
                    if match:
                        data = json.loads(match.group(1))
                        entity = data.get('props', {}).get('pageProps', {}).get('state', {}).get('data', {}).get('entity', {})
                        if entity and (entity.get('trackList') or entity.get('title') or entity.get('name')):
                            if item_type == 'track':
                                return [self._parse_track_entity(entity)]
                            elif item_type in ('playlist', 'album'):
                                return self._parse_collection_entity(entity, item_type)
            except Exception:
                continue

        # Fallback to SpotDL / spotapi
        try:
            if item_type == 'playlist':
                from spotdl.types.playlist import Playlist
                p = Playlist.from_url(url, fetch_songs=True)
                if p and p.songs:
                    tracks = []
                    for idx, s in enumerate(p.songs):
                        tracks.append({
                            'id': s.song_id or f'{idx+1}',
                            'title': s.name or 'Unknown Title',
                            'artist': ', '.join(s.artists) if s.artists else 'Unknown Artist',
                            'album': s.album_name or p.name or '',
                            'duration_ms': int(s.duration * 1000) if s.duration else 0,
                            'cover_url': s.cover_url or '',
                            'year': str(s.year) if s.year else '',
                            'track_number': s.track_number or (idx + 1),
                            'search_query': f"{', '.join(s.artists)} - {s.name}" if s.artists else s.name
                        })
                    if tracks:
                        return tracks
            elif item_type == 'track':
                from spotdl.types.song import Song
                s = Song.from_url(url)
                if s:
                    return [{
                        'id': s.song_id or 'custom',
                        'title': s.name or 'Unknown Title',
                        'artist': ', '.join(s.artists) if s.artists else 'Unknown Artist',
                        'album': s.album_name or '',
                        'duration_ms': int(s.duration * 1000) if s.duration else 0,
                        'cover_url': s.cover_url or '',
                        'year': str(s.year) if s.year else '',
                        'track_number': s.track_number or 1,
                        'search_query': f"{', '.join(s.artists)} - {s.name}" if s.artists else s.name
                    }]
        except Exception:
            pass

        return self._fallback_oembed(url)

    def _parse_track_entity(self, entity: Dict) -> Dict:
        title = entity.get('title') or entity.get('name') or 'Unknown Title'
        artists_list = entity.get('artists', [])
        artist_names = [a.get('name') for a in artists_list if isinstance(a, dict) and a.get('name')]
        artist = ', '.join(artist_names) if artist_names else entity.get('subtitle', 'Unknown Artist')
        
        album_obj = entity.get('album', {})
        album_name = album_obj.get('name') if isinstance(album_obj, dict) else ''
        
        # Cover image
        cover_url = ''
        visual_images = entity.get('visualIdentity', {}).get('image', [])
        if visual_images:
            # Pick highest resolution
            sorted_imgs = sorted(visual_images, key=lambda x: x.get('maxWidth', 0), reverse=True)
            cover_url = sorted_imgs[0].get('url', '')
        
        # Release year
        release_date = entity.get('releaseDate', {})
        year = ''
        if isinstance(release_date, dict):
            iso = release_date.get('isoString', '')
            if iso and len(iso) >= 4:
                year = iso[:4]

        duration_ms = entity.get('duration', 0)
        track_id = entity.get('id', entity.get('uri', '').split(':')[-1])

        return {
            'id': track_id,
            'title': title,
            'artist': artist,
            'album': album_name,
            'duration_ms': duration_ms,
            'cover_url': cover_url,
            'year': year,
            'track_number': 1,
            'search_query': f'{artist} - {title}' if artist else title
        }

    def _parse_collection_entity(self, entity: Dict, entity_type: str) -> List[Dict]:
        tracks = []
        collection_name = entity.get('name', '')
        track_list = entity.get('trackList', [])

        playlist_cover = ''
        cover_sources = entity.get('coverArt', {}).get('sources', [])
        if cover_sources:
            sorted_covers = sorted(cover_sources, key=lambda x: x.get('width', 0) or 0, reverse=True)
            playlist_cover = sorted_covers[0].get('url', '')
        elif 'visualIdentity' in entity:
            images = entity.get('visualIdentity', {}).get('image', [])
            if images:
                sorted_imgs = sorted(images, key=lambda x: x.get('maxWidth', 0) or 0, reverse=True)
                playlist_cover = sorted_imgs[0].get('url', '')

        release_date = entity.get('releaseDate', {})
        year = ''
        if isinstance(release_date, dict):
            iso = release_date.get('isoString', '')
            if iso and len(iso) >= 4:
                year = iso[:4]

        for index, item in enumerate(track_list):
            title = (item.get('title') or item.get('name') or f'Track {index+1}').replace('\xa0', ' ').strip()
            subtitle = item.get('subtitle', '').replace('\xa0', ' ').strip()
            artists = item.get('artists', [])
            if artists:
                artist_names = [a.get('name', '').replace('\xa0', ' ').strip() for a in artists if isinstance(a, dict) and a.get('name')]
                artist = ', '.join(artist_names)
            else:
                artist = subtitle

            track_id = item.get('uri', '').split(':')[-1] or f'{index+1}'
            track_cover = playlist_cover

            tracks.append({
                'id': track_id,
                'title': title,
                'artist': artist,
                'album': collection_name if entity_type == 'album' else '',
                'playlist_name': collection_name,
                'source': 'Spotify',
                'duration_ms': item.get('duration', 0),
                'cover_url': track_cover,
                'year': year,
                'track_number': index + 1,
                'search_query': f'{artist} - {title}' if artist else title
            })

        # Enrich individual track covers in parallel using iTunes & Spotify oembed
        if tracks:
            from concurrent.futures import ThreadPoolExecutor
            import urllib.parse

            def enrich_single_track(t):
                # 1. Try iTunes search
                try:
                    q = f"{t.get('artist', '')} {t.get('title', '')}".strip()
                    if q:
                        u = f"https://itunes.apple.com/search?term={urllib.parse.quote(q)}&entity=song&limit=1"
                        r = requests.get(u, timeout=2.5).json()
                        if r.get('results'):
                            art = r['results'][0].get('artworkUrl100', '')
                            if art:
                                t['cover_url'] = art.replace('100x100bb', '640x640bb')
                                return
                except Exception:
                    pass

                # 2. Try Spotify oembed
                tid = t.get('id', '')
                if tid and len(tid) > 10:
                    try:
                        u = f"https://open.spotify.com/oembed?url=https://open.spotify.com/track/{tid}"
                        r = requests.get(u, timeout=2.0).json()
                        thumb = r.get('thumbnail_url', '')
                        if thumb:
                            t['cover_url'] = thumb.replace('00001e02', '0000b273')
                            return
                    except Exception:
                        pass

            try:
                with ThreadPoolExecutor(max_workers=10) as executor:
                    list(executor.map(enrich_single_track, tracks[:100]))
            except Exception:
                pass

        return tracks

    def _fallback_oembed(self, url: str) -> List[Dict]:
        try:
            oembed_url = f'https://open.spotify.com/oembed?url={url}'
            res = requests.get(oembed_url, headers=self.headers, timeout=10)
            if res.status_code == 200:
                data = res.json()
                title = data.get('title', 'Unknown Track')
                thumbnail = data.get('thumbnail_url', '')
                return [{
                    'id': 'oembed',
                    'title': title,
                    'artist': '',
                    'album': '',
                    'duration_ms': 0,
                    'cover_url': thumbnail,
                    'year': '',
                    'track_number': 1,
                    'search_query': title
                }]
        except Exception:
            pass

        return [{
            'id': 'raw',
            'title': url,
            'artist': '',
            'album': '',
            'duration_ms': 0,
            'cover_url': '',
            'year': '',
            'track_number': 1,
            'search_query': url
        }]
