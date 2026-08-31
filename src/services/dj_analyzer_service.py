# -*- coding: utf-8 -*-
import os
import math
from typing import Dict, List, Tuple, Optional

# Standard Camelot Mapping: (Pitch Class 0-11, Mode 1=Major / 0=Minor)
# Pitch Classes: 0:C, 1:C#, 2:D, 3:D#, 4:E, 5:F, 6:F#, 7:G, 8:G#, 9:A, 10:A#, 11:B
CAMELOT_MAP = {
    # Major (Mode = 1 -> B)
    (0, 1): ('8B', 'C Maj'),
    (1, 1): ('3B', 'Db Maj'),
    (2, 1): ('10B', 'D Maj'),
    (3, 1): ('5B', 'Eb Maj'),
    (4, 1): ('12B', 'E Maj'),
    (5, 1): ('7B', 'F Maj'),
    (6, 1): ('2B', 'F# Maj'),
    (7, 1): ('9B', 'G Maj'),
    (8, 1): ('4B', 'Ab Maj'),
    (9, 1): ('11B', 'A Maj'),
    (10, 1): ('6B', 'Bb Maj'),
    (11, 1): ('1B', 'B Maj'),

    # Minor (Mode = 0 -> A)
    (0, 0): ('5A', 'C Min'),
    (1, 0): ('12A', 'C# Min'),
    (2, 0): ('7A', 'D Min'),
    (3, 0): ('2A', 'Eb Min'),
    (4, 0): ('9A', 'E Min'),
    (5, 0): ('4A', 'F Min'),
    (6, 0): ('11A', 'F# Min'),
    (7, 0): ('6A', 'G Min'),
    (8, 0): ('1A', 'Ab Min'),
    (9, 0): ('8A', 'A Min'),
    (10, 0): ('3A', 'Bb Min'),
    (11, 0): ('10A', 'B Min'),
}

# Standard Mixed In Key / Camelot Color Palette
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

class DJAnalyzerService:
    @staticmethod
    def get_camelot_key(pitch_class: Optional[int], mode: Optional[int]) -> Tuple[str, str, str]:
        if pitch_class is None or mode is None:
            return ('--', 'Unknown', '#666666')
        
        try:
            pitch = int(pitch_class) % 12
            m = 1 if int(mode) >= 1 else 0
            camelot, musical = CAMELOT_MAP.get((pitch, m), ('--', 'Unknown'))
            color = CAMELOT_COLORS.get(camelot, '#666666')
            return (camelot, musical, color)
        except Exception:
            return ('--', 'Unknown', '#666666')

    @staticmethod
    def calculate_harmonic_distance(key1: str, key2: str) -> float:
        """
        Calculates exact Mixed In Key harmonic distance and penalties:
        - Distance 0: Same Key (e.g. 8A -> 8A) = 0.0 (Perfect Blend)
        - Distance 0.5: Relative Major/Minor (e.g. 8A <-> 8B) = 0.3 (Smooth Blend)
        - Distance 1: +1 or -1 Step around Camelot Wheel (e.g. 8A -> 9A or 8A -> 7A) = 0.6 (Harmonic Flow)
        - Distance 2: +2 Steps / Energy Lift (e.g. 8A -> 10A) = 1.8 (Energy Boost)
        - Distance 3+: Key Clash! Penalized heavily to guarantee Ultra Smooth sets.
        """
        if not key1 or not key2 or key1.startswith('-') or key2.startswith('-'):
            return 8.0
        
        try:
            num1 = int(key1[:-1])
            letter1 = key1[-1].upper()
            num2 = int(key2[:-1])
            letter2 = key2[-1].upper()
        except Exception:
            return 8.0

        num_diff = abs(num1 - num2)
        if num_diff > 6:
            num_diff = 12 - num_diff

        # 1. Perfect Same Key (8A -> 8A or 9B -> 9B)
        if num_diff == 0 and letter1 == letter2:
            return 0.0

        # 2. Relative Major/Minor (8A <-> 8B or 9B <-> 9A)
        if num_diff == 0 and letter1 != letter2:
            return 0.3

        # 3. +1 or -1 Step around Camelot Wheel (8A -> 9A, 8A -> 7A)
        if num_diff == 1 and letter1 == letter2:
            return 0.6

        # 4. Diagonal Step (8A -> 9B or 8A -> 7B)
        if num_diff == 1 and letter1 != letter2:
            return 1.2

        # 5. Energy Boost (+2 Steps e.g. 8A -> 10A)
        if num_diff == 2 and letter1 == letter2:
            return 1.8

        # 6. Semi-Tone Modulation (+7 Steps or -5 Steps on Wheel)
        if num_diff == 7 and letter1 == letter2:
            return 2.5

        # 7. Disjoint Keys (3, 4, 5, 6 steps) -> Major Clash penalty
        return 15.0 + (num_diff * 5.0)

    @staticmethod
    def estimate_genre_from_bpm(bpm: float) -> str:
        if bpm >= 165 and bpm <= 180:
            return 'Drum & Bass'
        elif bpm >= 138 and bpm <= 150:
            return 'Trance / Hardstyle'
        elif bpm >= 128 and bpm <= 138:
            return 'Techno / Big Room'
        elif bpm >= 120 and bpm < 128:
            return 'House / Dance'
        elif bpm >= 100 and bpm < 120:
            return 'Pop / Nu-Disco'
        elif bpm >= 80 and bpm < 100:
            return 'Hip-Hop / R&B'
        elif bpm >= 65 and bpm < 80:
            return 'Trap / Chill'
        return 'Electronic / Dance'

    @classmethod
    def analyze_file(cls, filepath: str, track_info: Optional[Dict] = None) -> Dict:
        """
        Analyzes audio file using FFmpeg and aubio for BPM, Key, Camelot, Genre, Energy (1-10), and Hot Cues.
        """
        if not os.path.exists(filepath):
            return {
                'bpm': 120.0, 'camelot': '8A', 'key_name': 'A Min', 'genre': 'Dance',
                'energy': 5, 'color': '#fb923c', 'cues': [{'name': 'Intro', 'start': 0.0, 'num': 0}]
            }

        try:
            import subprocess
            import numpy as np
            import aubio

            # Fast decode 30 seconds of mono audio via ffmpeg
            cmd = [
                'ffmpeg', '-y', '-ss', '15', '-t', '30', '-i', filepath,
                '-f', 'f32le', '-acodec', 'pcm_f32le', '-ac', '1', '-ar', '44100', '-'
            ]
            proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
            raw_audio, _ = proc.communicate()
            if not raw_audio:
                return {
                    'bpm': 120.0, 'camelot': '8A', 'key_name': 'A Min', 'genre': 'Dance',
                    'energy': 5, 'stars': 3, 'rating_255': 153, 'color': '#fb923c',
                    'cues': [{'name': 'Intro', 'start': 0.0, 'num': 0}]
                }

            samples = np.frombuffer(raw_audio, dtype=np.float32)
            samplerate = 44100
            win_s = 2048
            hop_s = 1024

            o = aubio.tempo('default', win_s, hop_s, samplerate)
            p = aubio.pitch('yin', win_s, hop_s, samplerate)
            p.set_unit('midi')
            p.set_tolerance(0.8)

            beats = []
            pitches = []
            chunk_rms = []

            for i in range(0, len(samples) - hop_s, hop_s):
                chunk = samples[i:i+hop_s]
                if len(chunk) < hop_s:
                    break
                if o(chunk):
                    beats.append(o.get_last_s())
                pitch = p(chunk)[0]
                if 24 <= pitch <= 96:
                    pitches.append(pitch)
                
                # Compute RMS energy per frame
                rms = float(np.sqrt(np.mean(chunk**2)))
                chunk_rms.append(rms)

            if len(beats) > 1:
                bpms = 60.0 / np.diff(beats)
                valid = bpms[(bpms >= 60) & (bpms <= 200)]
                bpm = float(np.median(valid)) if len(valid) > 0 else 120.0
            else:
                bpm = 120.0

            # Correct half-time tempo detection for standard 4/4 Dance/Club tracks (60-74 BPM -> 120-148 BPM)
            if 60.0 <= bpm <= 74.0:
                bpm = bpm * 2.0

            # Pitch class analysis
            if pitches:
                pitch_classes = [int(round(pt)) % 12 for pt in pitches]
                counts = np.bincount(pitch_classes, minlength=12)
                dominant_pitch = int(np.argmax(counts))
                mode = 0 if dominant_pitch in (9, 2, 4, 11, 1, 6) else 1
            else:
                dominant_pitch = 0
                mode = 1

            camelot, key_name, color = cls.get_camelot_key(dominant_pitch, mode)
            from .genre_classifier_service import GenreClassifierService
            artist_name = track_info.get('artist', '') if track_info else ''
            title_name = track_info.get('title', '') if track_info else ''
            genre = GenreClassifierService.classify(artist_name, title_name, bpm)

            # Prioritize official studio metadata if available (e.g. from Beatport)
            if track_info:
                if track_info.get('camelot') and track_info.get('camelot') != '--':
                    camelot = track_info['camelot']
                    key_name = track_info.get('key_name', key_name)
                    color = CAMELOT_COLORS.get(camelot, color)
                if track_info.get('bpm') and float(track_info.get('bpm', 0)) > 0:
                    bpm = float(track_info['bpm'])
                if track_info.get('genre') and track_info.get('genre') not in ('Unknown', 'Custom / DJ', 'Electronic'):
                    genre = track_info['genre']

            # Realistic 1-5 Stars Energy Rating (Rekordbox / Mixed In Key standard)
            avg_rms = float(np.mean(chunk_rms)) if chunk_rms else 0.1
            dbfs = float(20.0 * np.log10(max(avg_rms, 1e-5)))

            # Base Loudness Score: -24 dBFS (1★) to -7 dBFS (5★)
            loudness_score = float(np.interp(dbfs, [-24.0, -18.0, -13.0, -9.0, -6.5], [1.0, 2.0, 3.0, 4.0, 5.0]))

            # BPM Energy modifier
            bpm_factor = 0.0
            if bpm < 90:
                bpm_factor = -0.5
            elif bpm <= 115:
                bpm_factor = 0.0
            elif bpm <= 130:
                bpm_factor = +0.3
            else:
                bpm_factor = +0.7

            final_energy_score = float(np.clip(loudness_score + bpm_factor, 1.0, 5.0))
            energy_stars = int(round(final_energy_score))
            energy_10 = int(round(final_energy_score * 2.0))
            rating_255 = int(round(energy_stars * 51))

            # Auto Hot Cue & Drop Detection
            max_rms_pos = 32.0
            if chunk_rms:
                window_size = int(1.5 * samplerate / hop_s)
                if len(chunk_rms) > window_size:
                    smoothed = np.convolve(chunk_rms, np.ones(window_size)/window_size, mode='valid')
                    peak_idx = int(np.argmax(smoothed))
                    max_rms_pos = round(15.0 + (peak_idx * hop_s / samplerate), 2)

            cues = [
                {'name': 'Intro', 'start': 0.0, 'num': 0},
                {'name': 'Drop', 'start': round(max_rms_pos, 2), 'num': 1},
                {'name': 'Outro', 'start': round(max(0.0, 30.0 - 5.0), 2), 'num': 2}
            ]

            return {
                'bpm': round(bpm, 1),
                'pitch_class': dominant_pitch,
                'mode': mode,
                'camelot': camelot,
                'key_name': key_name,
                'color': color,
                'genre': genre,
                'energy': energy_10,
                'stars': energy_stars,
                'rating_255': rating_255,
                'cues': cues
            }
        except Exception:
            return {
                'bpm': 120.0, 'camelot': '8A', 'key_name': 'A Min', 'genre': 'Dance',
                'energy': 5, 'stars': 3, 'rating_255': 153, 'color': '#fb923c',
                'cues': [{'name': 'Intro', 'start': 0.0, 'num': 0}]
            }

    @classmethod
    def smart_harmonic_sort(cls, tracks: List[Dict]) -> List[Dict]:
        """Backwards compatible alias for build_smart_mixtape('harmonic_flow')"""
        return cls.build_smart_mixtape(tracks, mode='harmonic_flow')

    @staticmethod
    def _matches_genre_filter(t: Dict, genre_filter: str) -> bool:
        if not genre_filter or genre_filter == 'ALL':
            return True
        gf = genre_filter.lower().strip()
        t_genre = str(t.get('genre', '')).lower()
        t_artist = str(t.get('artist', '')).lower()
        t_title = str(t.get('title', '')).lower()
        t_playlist = str(t.get('playlist_name', '')).lower()
        full_text = f"{t_genre} {t_artist} {t_title} {t_playlist}"
        has_thai = any('\u0e00' <= char <= '\u0e7f' for char in full_text) or 'thai' in t_playlist

        thai_rock_artists = {
            'potato', 'klear', "yes'sir days", 'bodyslam', 'loso', 'lomosonic',
            'big ass', 'labanoon', 'clash', 'silly fools', 'paradox', 'retrospect',
            'sweet mullet', 'freehand', 'goodmood', 'bedroom audio', 'spf', 'pause',
            'cocktail', 'slot machine', 'flure', 'moderndog', 'blackhead', 'zeal'
        }
        thai_hiphop_artists = {
            'saran', 'maiyarap', 'z9', 'uno', 'หลาวทอง', 'f.hero', 'fhero', 'youngohm',
            'urboytj', '1mill', 'illslick', 'pun', 'blvckheart', 'tangbadvoice', 'sprite',
            'diamond', 'fiixd', 'twopee', 'og-anic', 'lazyloxy', 'rachyo', 'alie blackcobra',
            'jh4y', 'ten', 'southside', 'daboyway', 'thaitanium', 'pee clock', 'milli',
            '8botsboyz', 'already deadd', 'bigslp', 'stage-n', 'ben bizzy', 'zentyarb',
            'chink99', 'nicecnx', 'k.aglet', 'ozeeoos', 'meyou', 'gavin:d', 'd gerrard',
            'ironboy', 'repaeze', 'cyanide', '19tc', 'vkl', 'jonin'
        }

        # 1. Thai All Genres
        if gf in ('thai all', 'thai', 'thai music', 'เพลงไทย'):
            return has_thai

        # 2. Thai Hip-Hop / Rap / R&B
        if gf in ('thai hip-hop', 'thai hiphop', 'thai rap', 'thai r&b'):
            if not has_thai:
                return False
            is_rock = any(a in t_artist for a in thai_rock_artists)
            if is_rock:
                return False
            is_hip = any(a in t_artist for a in thai_hiphop_artists) or any(k in t_genre for k in ('hip-hop', 'rap', 'r&b', 'trap'))
            return is_hip

        # 3. Thai Pop & Indie
        if gf in ('thai pop', 'thai indie', 'thai pop & indie'):
            if not has_thai:
                return False
            is_rock = any(a in t_artist for a in thai_rock_artists) or ('rock' in t_genre and not any(a in t_artist for a in thai_hiphop_artists))
            is_hip = any(a in t_artist for a in thai_hiphop_artists) or any(k in t_genre for k in ('hip-hop', 'rap', 'r&b', 'trap'))
            return not is_rock and not is_hip

        # 4. Thai Rock & Pub
        if gf in ('thai rock', 'thai rock & pub', 'thai pub'):
            if not has_thai:
                return False
            is_rock = any(a in t_artist for a in thai_rock_artists) or ('rock' in t_genre and not any(a in t_artist for a in thai_hiphop_artists))
            return is_rock

        # 5. Global Hip-Hop / Rap
        if gf in ('hip-hop', 'hip-hop / rap', 'rap'):
            if any(d in t_genre for d in ('dance', 'edm', 'house', 'electro', 'techno', 'trance', 'club remix')):
                return False
            return any(k in t_genre for k in ('hip-hop', 'rap')) or any(k in full_text for k in ('hip-hop', 'hiphop', 'boombap')) or any(a in t_artist for a in ('50 cent', 'drake', 'cardi b', 'travis scott', 'kendrick', 'megan thee', 'm.o.p.', 'flo rida', 'youngohm', 'urboytj', 'fiixd', 'diamond mqt', 'thaitanium', 'milli', 'maiyarap', 'central cee', '21 savage', 'metro boomin', 'eminem', 'kanye'))

        # 6. Dance / Electronic
        if gf in ('dance', 'dance / electronic', 'electronic', 'house', 'edm'):
            return any(k in t_genre for k in ('dance', 'house', 'edm', 'electronic', 'techno', 'trance', 'electro', 'big room', 'tech house'))

        # 7. Latin / Reggaeton
        if gf in ('latin', 'latin / reggaeton', 'reggaeton'):
            return any(k in t_genre for k in ('latin', 'reggaeton', 'caribbean')) or any(k in full_text for k in ('latin', 'reggaeton', 'dembow', 'balvin', 'daddy yankee', 'don omar', 'bad bunny'))

        # 8. Pop / Dance-Pop
        if gf in ('pop', 'pop / dance-pop', 'pop / nu-disco'):
            return any(k in t_genre for k in ('pop', 'nu-disco', 'funk')) and 'hip-hop' not in t_genre

        # 9. Trap
        if gf in ('trap', 'trap / bass', 'trap / jersey'):
            return any(k in t_genre for k in ('trap', 'jersey', 'bass')) or 'trap' in full_text

        # 10. R&B
        if gf in ('r&b', 'r&b / soul', 'soul'):
            return any(k in t_genre for k in ('r&b', 'soul'))

        # 11. K-Pop
        if gf in ('k-pop', 'kpop'):
            return ('k-pop' in full_text) or ('kpop' in full_text) or any(a in t_artist for a in ('bts', 'blackpink', 'newjeans', 'twice', 'aespa', 'ive', 'stray kids', 'seventeen', 'le sserafim', 'exo', 'itzy'))

        # 12. Drum & Bass
        if gf in ('drum & bass', 'dnb', 'drum and bass'):
            return any(k in t_genre for k in ('drum & bass', 'dnb', 'jungle'))

        # 13. Rock / Alternative
        if gf in ('rock', 'rock / alternative', 'alternative', 'metal'):
            return any(k in t_genre for k in ('rock', 'metal', 'alternative'))

        return gf in t_genre or gf in full_text

    @classmethod
    def build_smart_mixtape(
        cls,
        tracks: List[Dict],
        mode: str = 'peak_climb',
        genre_filter: str = 'ALL',
        min_bpm: Optional[float] = None,
        max_bpm: Optional[float] = None,
        min_stars: Optional[int] = None,
        max_stars: Optional[int] = None,
        target_count: Optional[int] = None,
        randomize: bool = True
    ) -> List[Dict]:
        """
        Builds an optimized smart mixtape setlist based on chosen style and filters:
        - Filters: genre, BPM range, Star rating range
        - Target Count: limits the number of songs to desired count (e.g. 10, 15, 20)
        - Modes:
          * 'peak_climb': Warm-up (1-2★) -> Build-up (3★) -> Peak-Time (4-5★) with harmonic matching
          * 'harmonic_flow': Best harmonic transitions on Camelot Wheel
          * 'bpm_ramp': Ascending BPM tempo curve with harmonic matching
          * 'sunset_lounge': Chill to moderate vibe (1-3★)
        """
        if not tracks:
            return []

        # 1. Apply Filters
        filtered = []
        for t in tracks:
            t_genre = str(t.get('genre', 'Electronic / Dance')).lower()
            t_bpm = float(t.get('bpm', 120.0))
            t_stars = int(t.get('stars', 3))

            if genre_filter and genre_filter != 'ALL':
                if not cls._matches_genre_filter(t, genre_filter):
                    continue

            if min_bpm is not None and t_bpm < min_bpm:
                continue
            if max_bpm is not None and t_bpm > max_bpm:
                continue

            if min_stars is not None and t_stars < min_stars:
                continue
            if max_stars is not None and t_stars > max_stars:
                continue

            filtered.append(t)

        if not filtered:
            return []

        if len(filtered) <= 1:
            return filtered[:target_count] if (target_count and target_count > 0) else filtered

        known = [t for t in filtered if t.get('bpm', 0) > 0 or t.get('camelot') not in (None, '', '--')]
        unknown = [t for t in filtered if t not in known]

        if not known:
            result = filtered
        else:
            def compute_transition_cost(current_t: Dict, next_t: Dict, mixtape_mode: str) -> Tuple[float, str, float]:
                curr_key = current_t.get('camelot', '8A')
                cand_key = next_t.get('camelot', '8A')
                curr_bpm = float(current_t.get('bpm', 120.0))
                cand_bpm = float(next_t.get('bpm', 120.0))
                curr_stars = int(current_t.get('stars', 3))
                cand_stars = int(next_t.get('stars', 3))

                key_dist = cls.calculate_harmonic_distance(curr_key, cand_key)

                direct_diff = abs(curr_bpm - cand_bpm)
                half_diff = abs(curr_bpm * 2.0 - cand_bpm)
                double_diff = abs(curr_bpm - cand_bpm * 2.0)
                bpm_diff = min(direct_diff, half_diff, double_diff)

                # Strict BPM Penalty to prevent tempo jumps in live mixing
                bpm_cost = (bpm_diff * 4.0)
                if bpm_diff > 4.0:
                    bpm_cost += 30.0
                if bpm_diff > 8.0:
                    bpm_cost += 100.0

                # Harmonic Transition Labeling
                if key_dist == 0.0:
                    match_label = "🎯 Same Key Blend"
                elif key_dist <= 0.35:
                    match_label = "✨ Relative Key (A↔B)"
                elif key_dist <= 0.8:
                    match_label = "🌊 Camelot Wheel (Smooth Flow)"
                elif key_dist <= 1.4:
                    match_label = "🎵 Diagonal Harmonic Step"
                elif key_dist <= 2.0:
                    match_label = "⚡ +2 Energy Lift"
                else:
                    match_label = "🎛️ Tempo Match"

                # Vibe & Acoustic Texture Coherence Check (Prevent sonic clashes like Rock in Chill Soul)
                def get_vibe_family(g_name: str) -> str:
                    g = g_name.lower()
                    if any(k in g for k in ['rock', 'metal', 'punk', 'alternative rock', 'grunge']):
                        return 'rock'
                    if any(k in g for k in ['soul', 'r&b', 'neo-soul', 'lo-fi', 'lofi', 'jazz', 'bedroom pop', 'acoustic', 'chill', 'lounge', 'dream pop', 'city pop']):
                        return 'chill_soul'
                    if any(k in g for k in ['t-pop', 'k-pop', 'j-pop', 'c-pop', 'dance pop', 'teen pop', 'pop', 'indie pop']):
                        return 'pop'
                    if any(k in g for k in ['house', 'tech house', 'techno', 'edm', 'disco', 'nu-disco', 'garage', 'uk garage', 'trance', 'electronic', 'dance']):
                        return 'electronic'
                    if any(k in g for k in ['hip-hop', 'hip hop', 'rap', 'trap', 'drill', 'boom bap', 'thai hip-hop', 'r&b hiphop']):
                        return 'hiphop'
                    if any(k in g for k in ['3cha', 'party', 'thai party', 'sai yo']):
                        return '3cha'
                    return 'general'

                curr_genre = str(current_t.get('genre', 'Electronic / Dance')).lower()
                cand_genre = str(next_t.get('genre', 'Electronic / Dance')).lower()
                curr_vibe = get_vibe_family(curr_genre)
                cand_vibe = get_vibe_family(cand_genre)

                vibe_cost = 0.0
                if curr_vibe == cand_vibe:
                    vibe_cost = -8.0  # Strong reward for matching musical groove & sonic texture
                elif (curr_vibe == 'chill_soul' and cand_vibe == 'rock') or (curr_vibe == 'rock' and cand_vibe == 'chill_soul'):
                    vibe_cost = 180.0 # Extreme penalty for jarring Rock <-> Chill Soul transitions
                elif (curr_vibe == 'chill_soul' and cand_vibe == '3cha') or (curr_vibe == '3cha' and cand_vibe == 'chill_soul'):
                    vibe_cost = 220.0 # Extreme penalty for 3Cha <-> Chill transitions
                elif (curr_vibe in ('chill_soul', 'pop') and cand_vibe in ('chill_soul', 'pop')):
                    vibe_cost = 4.0   # Smooth pop <-> soul transition
                elif (curr_vibe in ('electronic', 'pop') and cand_vibe in ('electronic', 'pop')):
                    vibe_cost = 4.0   # Smooth electronic <-> pop transition
                else:
                    vibe_cost = 35.0  # Moderate penalty for cross-genre jumping

                if mixtape_mode == 'peak_climb':
                    star_diff = cand_stars - curr_stars
                    star_cost = -star_diff * 1.5 if star_diff >= 0 else abs(star_diff) * 4.0
                    cost = (key_dist * 4.0) + bpm_cost + star_cost + vibe_cost
                elif mixtape_mode == 'bpm_ramp':
                    ramp_diff = cand_bpm - curr_bpm
                    ramp_cost = -ramp_diff * 0.5 if ramp_diff >= 0 else 40.0 + abs(ramp_diff) * 2.0
                    cost = (key_dist * 3.5) + ramp_cost + bpm_cost + vibe_cost
                elif mixtape_mode == 'sunset_lounge':
                    star_diff = abs(cand_stars - 2)
                    cost = (key_dist * 4.5) + (bpm_diff * 3.0) + (star_diff * 3.0) + vibe_cost
                else: # harmonic_flow
                    cost = (key_dist * 8.0) + (bpm_cost * 1.5) + (abs(cand_stars - curr_stars) * 1.0) + vibe_cost

                return cost, match_label, round(bpm_diff, 1)

            # Global Multi-Start Path Search: Test multiple starting tracks to find the global smoothest path
            best_chain = []
            best_chain_cost = float('inf')

            start_candidates = known if len(known) <= 15 else known[:15]
            if mode == 'peak_climb':
                warmup_starts = [t for t in known if t.get('stars', 3) <= 3]
                start_candidates = warmup_starts if warmup_starts else known
            elif mode == 'bpm_ramp':
                start_candidates = sorted(known, key=lambda x: x.get('bpm', 120))[:max(1, len(known)//3)]

            for start_track in start_candidates:
                current_chain = [start_track]
                remaining = [t for t in known if t != start_track]
                chain_total_cost = 0.0

                while remaining:
                    curr = current_chain[-1]
                    best_next_idx = 0
                    best_step_cost = float('inf')

                    for idx, cand in enumerate(remaining):
                        cost, _, _ = compute_transition_cost(curr, cand, mode)
                        if cost < best_step_cost:
                            best_step_cost = cost
                            best_next_idx = idx

                    chain_total_cost += best_step_cost
                    current_chain.append(remaining.pop(best_next_idx))

                if chain_total_cost < best_chain_cost:
                    best_chain_cost = chain_total_cost
                    best_chain = current_chain

            # Annotate each track with its next-track transition badge
            result = []
            for i in range(len(best_chain)):
                tr = dict(best_chain[i])
                if i < len(best_chain) - 1:
                    _, label, delta_bpm = compute_transition_cost(best_chain[i], best_chain[i+1], mode)
                    tr['next_transition'] = {
                        'label': label,
                        'delta_bpm': delta_bpm,
                        'to_key': best_chain[i+1].get('camelot', '--'),
                        'to_bpm': best_chain[i+1].get('bpm', 120.0)
                    }
                else:
                    tr['next_transition'] = None
                result.append(tr)

            result.extend(unknown)

        # Apply target count limit if specified
        if target_count and target_count > 0:
            result = result[:target_count]

        return result

