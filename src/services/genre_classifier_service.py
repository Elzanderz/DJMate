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
        full_text = f"{artist_norm} {title_norm} {normalize_text(playlist)}"
        has_thai = any('\u0e00' <= char <= '\u0e7f' for char in f"{artist_clean} {title_clean} {playlist}") or 'thai' in normalize_text(playlist)

        # 1. Thai Classification
        if has_thai:
            if any(a in artist_norm for a in cls.THAI_ROCK_ARTISTS):
                cls._CACHE[cache_key] = 'Thai Rock & Pub'
                return 'Thai Rock & Pub'
            if any(a in artist_norm for a in cls.THAI_HIPHOP_ARTISTS):
                cls._CACHE[cache_key] = 'Thai Hip-Hop / Rap'
                return 'Thai Hip-Hop / Rap'
            if any(a in artist_norm for a in cls.THAI_POP_ARTISTS):
                cls._CACHE[cache_key] = 'Thai Pop / Indie'
                return 'Thai Pop / Indie'

        # 2. Check Global EDM / Dance Producers
        if any(a in artist_norm for a in cls.EDM_DANCE_ARTISTS):
            if bpm >= 128:
                res = 'EDM / Big Room'
            elif bpm >= 118:
                res = 'House / Dance'
            else:
                res = 'Dance / Club Remix'
            cls._CACHE[cache_key] = res
            return res

        # 3. Check K-Pop
        if any(kp in artist_norm for kp in cls.KPOP_ARTISTS):
            cls._CACHE[cache_key] = 'K-Pop'
            return 'K-Pop'

        # 4. Check Latin / Reggaeton
        if any(w in artist_norm for w in ['bad bunny', 'j balvin', 'don omar', 'daddy yankee', 'ozuna', 'maluma', 'rauw alejandro', 'karol g', 'feid', 'anuel']):
            cls._CACHE[cache_key] = 'Latin / Reggaeton'
            return 'Latin / Reggaeton'

        # 5. Check Global Hip-Hop Legends
        if any(w in artist_norm for w in ['drake', 'eminem', 'kanye', 'travis scott', 'future', 'kendrick', 'cardi', 'nicki minaj', 'flo rida', '50 cent', '21 savage', 'metro boomin', 'lil baby', 'lil durk', 'post malone', 'central cee']):
            cls._CACHE[cache_key] = 'Hip-Hop / Rap'
            return 'Hip-Hop / Rap'

        # 6. Check Global Pop Icons
        if any(w in artist_norm for w in ['bieber', 'dua lipa', 'taylor swift', 'ariana', 'bruno mars', 'the weeknd', 'rihanna', 'katy perry', 'sabrina carpenter', 'billie eilish', 'chappell roan', 'charli xcx', 'tate mcrae', 'olivia rodrigo', 'ed sheeran']):
            cls._CACHE[cache_key] = 'Pop / Dance-Pop'
            return 'Pop / Dance-Pop'

        # 7. Club / Remix / Sped Up Keywords
        if any(w in title_norm for w in ['remix', 'extended', 'club mix', 'vip', 'dub', 'drop', 'sped up', 'slowed', 'rave', 'fest']):
            if bpm >= 128:
                res = 'EDM / Big Room'
            elif bpm >= 118:
                res = 'House / Dance'
            else:
                res = 'Dance / Club Remix'
            cls._CACHE[cache_key] = res
            return res

        # 8. Query Official iTunes Database (Fast 0.1s timeout)
        query = f"{artist_clean} {title_clean}".strip()
        if query:
            url = f"https://itunes.apple.com/search?term={urllib.parse.quote(query)}&entity=song&limit=1"
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
            try:
                with urllib.request.urlopen(req, timeout=2.0) as resp:
                    data = json.loads(resp.read().decode('utf-8'))
                    if data.get('resultCount', 0) > 0:
                        raw_genre = data['results'][0].get('primaryGenreName', '')
                        mapped = cls._map_itunes_genre(raw_genre, bpm, has_thai)
                        if mapped:
                            cls._CACHE[cache_key] = mapped
                            return mapped
            except Exception:
                pass

        # 9. Fallback: Tempo based
        if has_thai:
            res = 'Thai Pop / Indie'
        elif bpm >= 165:
            res = 'Drum & Bass'
        elif bpm >= 128:
            res = 'EDM / Big Room'
        elif bpm >= 120:
            res = 'House / Dance'
        elif bpm >= 100:
            res = 'Pop / Nu-Disco'
        elif bpm >= 80:
            res = 'Pop / Dance-Pop'
        else:
            res = 'Trap / Jersey'

        cls._CACHE[cache_key] = res
        return res

    @staticmethod
    def _map_itunes_genre(raw: str, bpm: float, has_thai: bool = False) -> str:
        r = raw.lower()
        if has_thai:
            if 'rock' in r or 'metal' in r:
                return 'Thai Rock & Pub'
            if 'hip-hop' in r or 'rap' in r or 'r&b' in r:
                return 'Thai Hip-Hop / Rap'
            return 'Thai Pop / Indie'

        if 'hip-hop' in r or 'rap' in r:
            return 'Hip-Hop / Rap'
        elif 'dance' in r or 'electronic' in r or 'house' in r or 'techno' in r:
            if bpm >= 120 and bpm <= 130:
                return 'House / Dance'
            elif bpm > 130:
                return 'EDM / Big Room'
            return 'Dance / Electronic'
        elif 'latin' in r or 'urbano' in r or 'reggaeton' in r:
            return 'Latin / Reggaeton'
        elif 'pop' in r:
            return 'Pop / Dance-Pop'
        elif 'r&b' in r or 'soul' in r:
            return 'R&B / Soul'
        elif 'rock' in r or 'metal' in r:
            return 'Rock / Alternative'
        elif 'k-pop' in r:
            return 'K-Pop'
        elif 'reggae' in r:
            return 'Reggae / Dancehall'
        elif 'country' in r:
            return 'Country'
        return raw.title()
