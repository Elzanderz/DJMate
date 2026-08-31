# -*- coding: utf-8 -*-
import os
import re
from typing import List, Dict, Tuple, Optional

class MashupService:
    """
    AI Mashup Matcher:
    Intelligently analyzes harmonic compatibility, tempo alignment, and
    vocal/groove characteristics to discover perfect live DJ mashup pairs.
    """

    CAMELOT_NEIGHBORS = {
        '1A': ['1A', '2A', '12A', '1B', '3A'],
        '2A': ['2A', '3A', '1A', '2B', '4A'],
        '3A': ['3A', '4A', '2A', '3B', '5A'],
        '4A': ['4A', '5A', '3A', '4B', '6A'],
        '5A': ['5A', '6A', '4A', '5B', '7A'],
        '6A': ['6A', '7A', '5A', '6B', '8A'],
        '7A': ['7A', '8A', '6A', '7B', '9A'],
        '8A': ['8A', '9A', '7A', '8B', '10A'],
        '9A': ['9A', '10A', '8A', '9B', '11A'],
        '10A': ['10A', '11A', '9A', '10B', '12A'],
        '11A': ['11A', '12A', '10A', '11B', '1A'],
        '12A': ['12A', '1A', '11A', '12B', '2A'],
        '1B': ['1B', '2B', '12B', '1A', '3B'],
        '2B': ['2B', '3B', '1B', '2A', '4B'],
        '3B': ['3B', '4B', '2B', '3A', '5B'],
        '4B': ['4B', '5B', '3B', '4A', '6B'],
        '5B': ['5B', '6B', '4B', '5A', '7B'],
        '6B': ['6B', '7B', '5B', '6A', '8B'],
        '7B': ['7B', '8B', '6B', '7A', '9B'],
        '8B': ['8B', '9B', '7B', '8A', '10B'],
        '9B': ['9B', '10B', '8B', '9A', '11B'],
        '10B': ['10B', '11B', '9B', '10A', '12B'],
        '11B': ['11B', '12B', '10B', '11A', '1B'],
        '12B': ['12B', '1B', '11B', '12A', '2B'],
    }

    @classmethod
    def is_vocal_heavy(cls, track: Dict) -> bool:
        """Determines if a track is vocal-dominant (good for Acapella layer)."""
        genre = (track.get('genre') or '').lower()
        title = (track.get('title') or '').lower()
        artist = (track.get('artist') or '').lower()
        playlist = (track.get('playlist_name') or '').lower()

        if any(w in genre for w in ['pop', 'hip-hop', 'r&b', 'rap', 'vocal', 'latin', 'dance pop']):
            return True
        if any(w in playlist for w in ['pop', 'top', 'hits', 'vocal', 'billboard']):
            return True
        if any(w in title for w in ['feat', 'ft.', 'vocal', 'radio', 'acapella', 'sing']):
            return True
        return False

    @classmethod
    def is_beat_heavy(cls, track: Dict) -> bool:
        """Determines if a track is groove/beat-dominant (good for Instrumental bed)."""
        genre = (track.get('genre') or '').lower()
        title = (track.get('title') or '').lower()
        bpm = float(track.get('bpm') or 124.0)

        if any(w in genre for w in ['house', 'tech house', 'techno', 'bass house', 'edm', 'minimal', 'afro house', 'groove']):
            return True
        if any(w in title for w in ['extended', 'dub', 'instrumental', 'club mix', 'original mix', 'vip']):
            return True
        return bpm >= 124.0

    @classmethod
    def calculate_mashup_synergy(cls, track_a: Dict, track_b: Dict) -> Optional[Dict]:
        """
        Calculates mashup synergy score (0-100%) and recommendations between two tracks.
        """
        if track_a.get('filepath') == track_b.get('filepath') or track_a.get('title') == track_b.get('title'):
            return None

        bpm_a = float(track_a.get('bpm') or 124.0)
        bpm_b = float(track_b.get('bpm') or 124.0)
        key_a = track_a.get('camelot') or '8A'
        key_b = track_b.get('camelot') or '8A'

        # 1. BPM Compatibility
        bpm_diff = abs(bpm_a - bpm_b)
        bpm_score = 0
        bpm_technique = ""

        if bpm_diff <= 1.0:
            bpm_score = 40
            bpm_technique = "Exact Tempo (No pitch bending needed)"
        elif bpm_diff <= 3.0:
            bpm_score = 35
            bpm_technique = f"Tight Tempo ({round(bpm_diff, 1)} BPM shift)"
        elif bpm_diff <= 6.0:
            bpm_score = 25
            bpm_technique = f"Moderate Tempo ({round(bpm_diff, 1)} BPM shift)"
        elif abs(bpm_a * 2 - bpm_b) <= 3.0 or abs(bpm_b * 2 - bpm_a) <= 3.0:
            bpm_score = 30
            bpm_technique = "Double-Time / Half-Time Sync (Special Blend)"
        else:
            # BPM difference too large for clean live mashup
            return None

        # 2. Key Compatibility
        key_score = 0
        harmonic_type = ""
        neighbors = cls.CAMELOT_NEIGHBORS.get(key_a, [key_a])

        if key_a == key_b:
            key_score = 40
            harmonic_type = f"🎯 Same Key ({key_a}) — 100% Harmonic Synergy"
        elif len(neighbors) > 3 and key_b == neighbors[3]: # Relative Major/Minor
            key_score = 38
            harmonic_type = f"✨ Relative Tone ({key_a} ↔ {key_b}) — Mood Shift"
        elif len(neighbors) > 1 and key_b in (neighbors[1], neighbors[2]): # ±1 Harmonic
            key_score = 35
            harmonic_type = f"🌊 Adjacent Key ({key_a} ↔ {key_b}) — Smooth Blend"
        elif len(neighbors) > 4 and key_b == neighbors[4]: # +2 Energy Boost
            key_score = 32
            harmonic_type = f"⚡ +2 Power Key ({key_a} ➔ {key_b}) — High Energy Lift"
        else:
            # Keys not compatible
            return None

        # 3. Role Assignment (Vocal vs Beat)
        vocal_a = cls.is_vocal_heavy(track_a)
        vocal_b = cls.is_vocal_heavy(track_b)
        beat_a = cls.is_beat_heavy(track_a)
        beat_b = cls.is_beat_heavy(track_b)

        role_score = 10
        mashup_recipe = ""

        if vocal_a and beat_b:
            role_score = 20
            vocal_track = track_a
            beat_track = track_b
            mashup_recipe = f"🎤 Lay vocals of '{track_a['title']}' over heavy drop of '{track_b['title']}'"
        elif vocal_b and beat_a:
            role_score = 20
            vocal_track = track_b
            beat_track = track_a
            mashup_recipe = f"🎤 Lay vocals of '{track_b['title']}' over heavy drop of '{track_a['title']}'"
        else:
            role_score = 12
            vocal_track = track_a
            beat_track = track_b
            mashup_recipe = f"🎛️ Hybrid Groove Layering: Blend Hook of '{track_a['title']}' with Bassline of '{track_b['title']}'"

        total_score = bpm_score + key_score + role_score
        if total_score < 75:
            return None

        return {
            'score': total_score,
            'vocal_track': vocal_track,
            'beat_track': beat_track,
            'track_a': track_a,
            'track_b': track_b,
            'bpm_technique': bpm_technique,
            'harmonic_type': harmonic_type,
            'recipe': mashup_recipe,
            'target_bpm': round((bpm_a + bpm_b) / 2, 1),
            'target_key': key_a
        }

    @classmethod
    def find_all_mashups(cls, tracks: List[Dict], min_score: int = 80, limit: int = 50) -> List[Dict]:
        """
        Finds the top mashup combinations in the given library.
        """
        pairs = []
        n = len(tracks)

        # Optimize sample to prevent N^2 explosion on huge libraries
        sample_pool = tracks[:120] if n > 120 else tracks

        for i in range(len(sample_pool)):
            for j in range(i + 1, len(sample_pool)):
                match = cls.calculate_mashup_synergy(sample_pool[i], sample_pool[j])
                if match and match['score'] >= min_score:
                    pairs.append(match)

        # Sort highest synergy first
        pairs.sort(key=lambda x: x['score'], reverse=True)
        return pairs[:limit]
