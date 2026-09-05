# -*- coding: utf-8 -*-
import urllib.request
import json
import urllib.parse
import unicodedata
import re
from typing import Dict, Optional

def normalize_text(text: str) -> str:
    if not text:
        return ''
    nfkd = unicodedata.normalize('NFKD', str(text).lower())
    return ''.join([c for c in nfkd if not unicodedata.combining(c)]).strip()

class GenreClassifierService:
    _CACHE: Dict[str, str] = {}

    THAI_ROCK_ARTISTS = {
        'potato', 'klear', "yes'sir days", 'bodyslam', 'loso', 'lomosonic',
        'big ass', 'labanoon', 'clash', 'silly fools', 'paradox', 'retrospect',
        'sweet mullet', 'freehand', 'goodmood', 'bedroom audio', 'spf', 'pause',
        'cocktail', 'slot machine', 'flure', 'moderndog', 'blackhead', 'zeal',
        'ebola', 'y not 7', 'sillyfools', 'sweetmullet'
    }

    THAI_HIPHOP_ARTISTS = {
        'saran', 'maiyarap', 'z9', 'uno', 'หลาวทอง', 'f.hero', 'fhero', 'youngohm',
        'urboytj', '1mill', 'illslick', 'pun', 'blvckheart', 'tangbadvoice', 'sprite',
        'diamond', 'fiixd', 'twopee', 'og-anic', 'lazyloxy', 'rachyo', 'alie blackcobra',
        'jh4y', 'ten', 'southside', 'daboyway', 'thaitanium', 'pee clock', 'milli',
        '8botsboyz', 'already deadd', 'bigslp', 'stage-n', 'ben bizzy', 'zentyarb',
        'chink99', 'nicecnx', 'k.aglet', 'ozeeoos', 'meyou', 'gavin:d', 'd gerrard',
        'ironboy', 'repaeze', 'cyanide', '19tc', 'vkl', 'jonin', 'younggu'
    }

    THAI_POP_ARTISTS = {
        'three man down', 'tilly birds', 'bowkylion', 'nont tanont', 'polycat',
        'tattoo colour', 'the toys', 'ink waruntorn', 'safeplanet', 'dept',
        'anatomy rabbit', 'scrubb', 'palmy', 'purpeech', 'billkin', 'proxie',
        'bus', 'serious bacon', 'fellow fellow', 'guncharlie', 'cornboi',
        'landokmai', 'sarah salola', 'mirrr', 'nunew', 'lykn', 'hers', 'the ge',
        'violette wautier', 'jeff satur', 'mew suppasit', 'pp krit', '4eve', 'bamm'
    }

    EDM_DANCE_ARTISTS = {
        'tiesto', 'dimitri vegas', 'like mike', 'gabry ponte', 'marnage', 'braaheim',
        'ely oaks', 'guetta', 'garrix', 'alesso', 'avicii', 'hardwell', 'skrillex',
        'marshmello', 'harris', 'alok', 'armin', 'afrojack', 'steve aoki', 'r3hab',
        'kungs', 'hugel', 'meduza', 'vintage culture', 'acraze', 'james hype',
        'fisher', 'chris lake', 'fred again', 'peggy gou', 'solomun', 'boris brejcha',
        'swedish house mafia', 'kygo', 'lost frequencies', 'robin schulz', 'galantis',
        'chainsmokers', 'major lazer', 'dj snake', 'shouse', 'otto knows', 'cid',
        'john summit', 'dom dolla', 'mau p', 'cloonee', 'daft punk', 'dillon francis',
        'deadmau5', 'zedd', 'kshmr', 'felix jaehn', 'sigala', 'jonas blue', 'jax jones'
    }

    KPOP_ARTISTS = {
        'bts', 'blackpink', 'newjeans', 'twice', 'aespa', 'ive', 'stray kids',
        'seventeen', 'le sserafim', 'exo', 'red velvet', 'itzy', 'nct', 'enhypen',
        'txt', 'riize', 'babymonster', 'gidle', '(g)i-dle', 'kiss of life', 'illit'
    }

    GLOBAL_ROCK_ARTISTS = {
        'linkin park', 'queen', 'green day', 'oasis', 'radiohead', 'red hot chili peppers',
        'nirvana', 'arctic monkeys', 'imagine dragons', 'fall out boy', 'the 1975',
        'twenty one pilots', 'paramore', 'foo fighters', 'my chemical romance',
        'muse', 'weezer', 'metallica', 'ac/dc', 'guns n roses', 'bon jovi', 'aerosmith'
    }

    GLOBAL_RNB_ARTISTS = {
        'sza', 'frank ocean', 'daniel caesar', 'giveon', 'h.e.r.', 'brent faiyaz',
        'summer walker', 'khalid', 'chris brown', 'miguel', 'bryson tiller', 'kehlani',
        'alicia keys', 'john legend', 'usher', 'beyonce', 'jhene aiko', 'steve lacy',
        'mac ayres', 'leon bridges', 'erykah badu', 'jill scott', 'jordan rakei'
    }

    GLOBAL_INDIE_ARTISTS = {
        'mac demarco', 'men i trust', 'boy pablo', 'phum viphurit', 'hybs', 'wave to earth',
        'keshi', 'lany', 'lauv', 'jeremy zucker', 'rex orange county', 'clairo',
        'wallows', 'beabadoobee', 'cuco', 'faye webster', 'prep', 'honne', 'umi'
    }

    @classmethod
    def classify(cls, artist: str = '', title: str = '', bpm: float = 120.0, playlist: str = '') -> str:
        """
        Classifies track into official, rich, diverse genres using iTunes API,
        artist databases, and intelligent music knowledge.
        """
        artist_clean = (artist or '').strip()
        title_clean = (title or '').strip()
        cache_key = f"{artist_clean.lower()}:{title_clean.lower()}"

        if cache_key in cls._CACHE:
            return cls._CACHE[cache_key]

        artist_norm = normalize_text(artist_clean)
        title_norm = normalize_text(title_clean)
        playlist_norm = normalize_text(playlist)
        has_thai = any('\u0e00' <= char <= '\u0e7f' for char in f"{artist_clean} {title_clean} {playlist}") or 'thai' in playlist_norm

        # 1. Thai Classification
        if has_thai:
            if any(a in artist_norm for a in cls.THAI_ROCK_ARTISTS):
                cls._CACHE[cache_key] = 'Thai Rock'
                return 'Thai Rock'
            if any(a in artist_norm for a in cls.THAI_HIPHOP_ARTISTS):
                cls._CACHE[cache_key] = 'Thai Hip-Hop / Rap'
                return 'Thai Hip-Hop / Rap'
            if any(a in artist_norm for a in cls.THAI_POP_ARTISTS):
                cls._CACHE[cache_key] = 'Thai Pop / Indie'
                return 'Thai Pop / Indie'
            if any(w in playlist_norm for w in ['hiphop', 'hip-hop', 'rap']):
                cls._CACHE[cache_key] = 'Thai Hip-Hop / Rap'
                return 'Thai Hip-Hop / Rap'
            if any(w in playlist_norm for w in ['rock', 'pub']):
                cls._CACHE[cache_key] = 'Thai Rock'
                return 'Thai Rock'
            if any(w in playlist_norm for w in ['indie', 'chill', 'acoustic']):
                cls._CACHE[cache_key] = 'Thai Pop / Indie'
                return 'Thai Pop / Indie'

        # 2. Check K-Pop
        if any(kp in artist_norm for kp in cls.KPOP_ARTISTS):
            cls._CACHE[cache_key] = 'K-Pop'
            return 'K-Pop'

        # 3. Check Global Hip-Hop Legends
        if any(w in artist_norm for w in ['drake', 'eminem', 'kanye', 'travis scott', 'future', 'kendrick', 'cardi', 'nicki minaj', 'flo rida', '50 cent', '21 savage', 'metro boomin', 'lil baby', 'lil durk', 'post malone', 'central cee', 'jack harlow', 'j. cole', 'snoop dogg']):
            cls._CACHE[cache_key] = 'Hip-Hop / Rap'
            return 'Hip-Hop / Rap'

        # 4. Check Global R&B / Soul
        if any(w in artist_norm for w in cls.GLOBAL_RNB_ARTISTS):
            cls._CACHE[cache_key] = 'R&B / Soul'
            return 'R&B / Soul'

        # 5. Check Global Rock
        if any(w in artist_norm for w in cls.GLOBAL_ROCK_ARTISTS):
            cls._CACHE[cache_key] = 'Rock / Alternative'
            return 'Rock / Alternative'

        # 6. Check Global Indie / Chill
        if any(w in artist_norm for w in cls.GLOBAL_INDIE_ARTISTS):
            cls._CACHE[cache_key] = 'Indie / Chill'
            return 'Indie / Chill'

        # 7. Check Latin / Reggaeton
        if any(w in artist_norm for w in ['bad bunny', 'j balvin', 'don omar', 'daddy yankee', 'ozuna', 'maluma', 'rauw alejandro', 'karol g', 'feid', 'anuel']):
            cls._CACHE[cache_key] = 'Latin / Reggaeton'
            return 'Latin / Reggaeton'

        # 8. Check Global Pop Icons
        if any(w in artist_norm for w in ['bieber', 'dua lipa', 'taylor swift', 'ariana', 'bruno mars', 'the weeknd', 'rihanna', 'katy perry', 'sabrina carpenter', 'billie eilish', 'chappell roan', 'charli xcx', 'tate mcrae', 'olivia rodrigo', 'ed sheeran', 'adele', 'shawn mendes', 'maroon 5', 'coldplay', 'charlie puth', 'harry styles']):
            cls._CACHE[cache_key] = 'Pop'
            return 'Pop'

        # 9. Check Global EDM / Dance Producers
        if any(a in artist_norm for a in cls.EDM_DANCE_ARTISTS):
            if bpm >= 128:
                res = 'EDM / Big Room'
            elif bpm >= 118:
                res = 'House'
            else:
                res = 'Dance / Electronic'
            cls._CACHE[cache_key] = res
            return res

        # 10. Query Official iTunes Database (Fast public API)
        query = f"{artist_clean} {title_clean}".strip()
        if query:
            url = f"https://itunes.apple.com/search?term={urllib.parse.quote(query)}&entity=song&limit=1"
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
            try:
                with urllib.request.urlopen(req, timeout=2.5) as resp:
                    data = json.loads(resp.read().decode('utf-8'))
                    if data.get('resultCount', 0) > 0:
                        raw_genre = data['results'][0].get('primaryGenreName', '')
                        mapped = cls._map_itunes_genre(raw_genre, bpm, has_thai)
                        if mapped:
                            cls._CACHE[cache_key] = mapped
                            return mapped
            except Exception:
                pass

        # 11. Club / Remix / DJ Edits Keywords (only if not found in official catalogs)
        if any(w in title_norm for w in ['club mix', 'extended mix', 'vip edit', 'dub mix', 'rave edit']):
            if bpm >= 128:
                res = 'EDM / Club'
            else:
                res = 'House / Club'
            cls._CACHE[cache_key] = res
            return res
        elif any(w in title_norm for w in ['remix', 'mashup', 'bootleg', 'edit', 'flip']):
            if has_thai:
                res = 'Thai Dance / Remix'
            elif bpm >= 126:
                res = 'Club / EDM Remix'
            else:
                res = 'Pop / Remix'
            cls._CACHE[cache_key] = res
            return res

        # 12. Fallback: Intelligent musical heuristic based on Thai and Tempo
        if has_thai:
            res = 'Thai Pop / Indie'
        elif bpm >= 165:
            res = 'Drum & Bass'
        elif bpm >= 132:
            res = 'EDM / Club'
        elif bpm >= 122:
            res = 'House / Electronic'
        elif bpm >= 105:
            res = 'Pop'
        elif bpm >= 85:
            res = 'Pop / R&B'
        elif bpm >= 70:
            res = 'R&B / Hip-Hop'
        else:
            res = 'Hip-Hop / Chill'

        cls._CACHE[cache_key] = res
        return res

    @staticmethod
    def _map_itunes_genre(raw: str, bpm: float, has_thai: bool = False) -> str:
        r = raw.lower()
        if has_thai:
            if 'rock' in r or 'metal' in r:
                return 'Thai Rock'
            if 'hip-hop' in r or 'rap' in r:
                return 'Thai Hip-Hop / Rap'
            if 'r&b' in r or 'soul' in r:
                return 'Thai R&B / Soul'
            return 'Thai Pop / Indie'

        if 'hip-hop' in r or 'rap' in r:
            return 'Hip-Hop / Rap'
        elif 'house' in r:
            return 'House'
        elif 'techno' in r:
            return 'Techno'
        elif 'trance' in r:
            return 'Trance'
        elif 'dance' in r or 'electronic' in r:
            if bpm >= 128:
                return 'EDM / Big Room'
            elif bpm >= 120:
                return 'House / Dance'
            return 'Dance / Electronic'
        elif 'latin' in r or 'urbano' in r or 'reggaeton' in r:
            return 'Latin / Reggaeton'
        elif 'pop' in r:
            return 'Pop'
        elif 'r&b' in r or 'soul' in r:
            return 'R&B / Soul'
        elif 'rock' in r or 'metal' in r:
            return 'Rock / Alternative'
        elif 'alternative' in r or 'indie' in r:
            return 'Alternative / Indie'
        elif 'k-pop' in r:
            return 'K-Pop'
        elif 'reggae' in r:
            return 'Reggae / Dancehall'
        elif 'country' in r:
            return 'Country'
        elif 'jazz' in r:
            return 'Jazz'
        elif 'soundtrack' in r:
            return 'Soundtrack'
        elif 'acoustic' in r or 'singer' in r or 'folk' in r:
            return 'Acoustic / Folk'
        return raw.title()
