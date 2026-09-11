# -*- coding: utf-8 -*-
import os
import re
import math
from typing import List, Dict, Any, Optional

CAMELOT_WHEEL = {
    '1A': {'num': 1, 'letter': 'A', 'musical': 'Ab Min', 'rel': '1B'},
    '2A': {'num': 2, 'letter': 'A', 'musical': 'Eb Min', 'rel': '2B'},
    '3A': {'num': 3, 'letter': 'A', 'musical': 'Bb Min', 'rel': '3B'},
    '4A': {'num': 4, 'letter': 'A', 'musical': 'F Min', 'rel': '4B'},
    '5A': {'num': 5, 'letter': 'A', 'musical': 'C Min', 'rel': '5B'},
    '6A': {'num': 6, 'letter': 'A', 'musical': 'G Min', 'rel': '6B'},
    '7A': {'num': 7, 'letter': 'A', 'musical': 'D Min', 'rel': '7B'},
    '8A': {'num': 8, 'letter': 'A', 'musical': 'A Min', 'rel': '8B'},
    '9A': {'num': 9, 'letter': 'A', 'musical': 'E Min', 'rel': '9B'},
    '10A': {'num': 10, 'letter': 'A', 'musical': 'B Min', 'rel': '10B'},
    '11A': {'num': 11, 'letter': 'A', 'musical': 'F# Min', 'rel': '11B'},
    '12A': {'num': 12, 'letter': 'A', 'musical': 'C# Min', 'rel': '12B'},
    '1B': {'num': 1, 'letter': 'B', 'musical': 'B Maj', 'rel': '1A'},
    '2B': {'num': 2, 'letter': 'B', 'musical': 'F# Maj', 'rel': '2A'},
    '3B': {'num': 3, 'letter': 'B', 'musical': 'Db Maj', 'rel': '3A'},
    '4B': {'num': 4, 'letter': 'B', 'musical': 'Ab Maj', 'rel': '4A'},
    '5B': {'num': 5, 'letter': 'B', 'musical': 'Eb Maj', 'rel': '5A'},
    '6B': {'num': 6, 'letter': 'B', 'musical': 'Bb Maj', 'rel': '6A'},
    '7B': {'num': 7, 'letter': 'B', 'musical': 'F Maj', 'rel': '7A'},
    '8B': {'num': 8, 'letter': 'B', 'musical': 'C Maj', 'rel': '8A'},
    '9B': {'num': 9, 'letter': 'B', 'musical': 'G Maj', 'rel': '9A'},
    '10B': {'num': 10, 'letter': 'B', 'musical': 'D Maj', 'rel': '10A'},
    '11B': {'num': 11, 'letter': 'B', 'musical': 'A Maj', 'rel': '11A'},
    '12B': {'num': 12, 'letter': 'B', 'musical': 'E Maj', 'rel': '12A'},
}

class DJLiveCopilotService:
    """
    PulseDJ-style Real-time Next-Track Recommender & Live DJ Copilot.
    Analyzes currently playing deck track and generates optimal next track recommendations
    based on Camelot Harmonic Wheel, BPM pitch tolerances, and crowd energy flow.
    """

    @classmethod
    def get_harmonic_relation(cls, key1: str, key2: str) -> Dict[str, Any]:
        k1 = (key1 or '8A').strip().upper()
        k2 = (key2 or '8A').strip().upper()

        if k1 not in CAMELOT_WHEEL or k2 not in CAMELOT_WHEEL:
            return {
                'score': 60,
                'badge': 'Dynamic Shift',
                'type': 'other',
                'color': '#71717a',
                'description': 'Free transition / Drop mix'
            }

        info1 = CAMELOT_WHEEL[k1]
        info2 = CAMELOT_WHEEL[k2]

        num1, let1 = info1['num'], info1['letter']
        num2, let2 = info2['num'], info2['letter']

        diff_num = abs(num1 - num2)
        diff_wheel = min(diff_num, 12 - diff_num)
        same_letter = (let1 == let2)

        # 1. Exact Key
        if k1 == k2:
            return {
                'score': 100,
                'badge': '🟢 Exact Match',
                'type': 'exact',
                'color': '#10b981',
                'description': 'Perfect Harmonic Blend (100%)'
            }

        # 2. +1 / -1 Adjacent Key
        if same_letter and diff_wheel == 1:
            is_up = ((num2 - num1) == 1) or (num1 == 12 and num2 == 1)
            if is_up:
                return {
                    'score': 95,
                    'badge': '🔵 +1 Lift',
                    'type': 'lift',
                    'color': '#38bdf8',
                    'description': '+1 Energy Lift Transition (95%)'
                }
            else:
                return {
                    'score': 95,
                    'badge': '🔵 -1 Step',
                    'type': 'step_down',
                    'color': '#38bdf8',
                    'description': '-1 Harmonic Warm-down (95%)'
                }

        # 3. Relative Major / Minor (Same number, different letter)
        if (not same_letter) and diff_wheel == 0:
            return {
                'score': 90,
                'badge': '🟣 Relative Switch',
                'type': 'relative',
                'color': '#c084fc',
                'description': f'Relative {"Major" if let2 == "B" else "Minor"} Switch (90%)'
            }

        # 4. +2 Energy Boost Jump
        if same_letter and diff_wheel == 2:
            return {
                'score': 85,
                'badge': '⚡ +2 Boost',
                'type': 'boost',
                'color': '#f59e0b',
                'description': '+2 Power Energy Jump (85%)'
            }

        # 5. Diagonal Shift (+1 or -1 with letter switch)
        if (not same_letter) and diff_wheel == 1:
            return {
                'score': 80,
                'badge': '🌊 Mood Step',
                'type': 'diagonal',
                'color': '#ec4899',
                'description': 'Diagonal Mood & Key Shift (80%)'
            }

        return {
            'score': 65,
            'badge': '⚡ Key Step',
            'type': 'step',
            'color': '#a1a1aa',
            'description': 'Dynamic Key Step (65%)'
        }

    @classmethod
    def calculate_bpm_score(cls, bpm1: float, bpm2: float) -> Dict[str, Any]:
        if not bpm1 or not bpm2 or bpm1 <= 0 or bpm2 <= 0:
            return {'score': 70, 'diff': 0, 'label': 'N/A', 'half_double': False}

        b1 = float(bpm1)
        b2 = float(bpm2)

        # Standard diff
        diff_pct = abs(b2 - b1) / b1
        diff_val = round(b2 - b1, 1)

        # Check half/double tempo (e.g. 70 -> 140 or 140 -> 70)
        half_diff = abs((b2 * 2) - b1) / b1
        double_diff = abs((b2 * 0.5) - b1) / b1

        is_half_double = False
        if half_diff <= 0.05:
            diff_pct = half_diff
            is_half_double = True
        elif double_diff <= 0.05:
            diff_pct = double_diff
            is_half_double = True

        if diff_pct <= 0.015:
            score = 100
            quality = 'Direct Match'
        elif diff_pct <= 0.035:
            score = 95
            quality = 'Smooth Pitch Bend'
        elif diff_pct <= 0.06:
            score = 85
            quality = 'Manageable Pitch Adjust'
        elif diff_pct <= 0.09:
            score = 75
            quality = 'Wide Pitch'
        else:
            score = max(40, round(100 - (diff_pct * 400)))
            quality = 'Tempo Shift'

        diff_str = f"{'+' if diff_val > 0 else ''}{diff_val} BPM"
        if is_half_double:
            diff_str += " (Half/Double)"

        return {
            'score': score,
            'diff': diff_val,
            'diff_pct': round(diff_pct * 100, 1),
            'label': diff_str,
            'quality': quality,
            'half_double': is_half_double
        }

    @classmethod
    def recommend_next_tracks(
        cls,
        current_track: Dict[str, Any],
        library_tracks: List[Dict[str, Any]],
        filter_mode: str = 'all',
        max_results: int = 25
    ) -> List[Dict[str, Any]]:
        """
        Computes scored and ranked next-track suggestions for the given current_track.
        """
        if not current_track or not library_tracks:
            return []

        cur_title = (current_track.get('title') or '').strip().lower()
        cur_artist = (current_track.get('artist') or '').strip().lower()
        cur_key = current_track.get('camelot') or '8A'
        cur_bpm = float(current_track.get('bpm') or 128.0)
        cur_energy = float(current_track.get('energy') or 6.5)

        scored_candidates = []

        for trk in library_tracks:
            t_title = (trk.get('title') or '').strip().lower()
            t_artist = (trk.get('artist') or '').strip().lower()

            # Skip the exact same track
            if cur_title and t_title == cur_title and (not cur_artist or not t_artist or cur_artist == t_artist):
                continue
            if current_track.get('filepath') and trk.get('filepath') and current_track['filepath'] == trk['filepath']:
                continue

            t_key = trk.get('camelot') or '8A'
            t_bpm = float(trk.get('bpm') or 128.0)
            t_energy = float(trk.get('energy') or 6.5)

            # 1. Harmonic score
            harm_info = cls.get_harmonic_relation(cur_key, t_key)
            harm_score = harm_info['score']

            # Filter mode check
            if filter_mode == 'exact' and harm_info['type'] != 'exact':
                continue
            if filter_mode == 'lift' and harm_info['type'] not in ('lift', 'boost'):
                continue
            if filter_mode == 'relative' and harm_info['type'] != 'relative':
                continue

            # 2. BPM score
            bpm_info = cls.calculate_bpm_score(cur_bpm, t_bpm)
            bpm_score = bpm_info['score']

            if filter_mode == 'tight_bpm' and bpm_info['diff_pct'] > 3.0:
                continue

            # 3. Energy score
            energy_diff = t_energy - cur_energy
            if filter_mode == 'boost' and energy_diff < 0.5:
                energy_score = 60
            elif filter_mode == 'warm_down' and energy_diff > -0.5:
                energy_score = 60
            else:
                energy_score = max(50, 100 - int(abs(energy_diff) * 10))

            # Composite Final Score (Harmonic 55%, BPM 35%, Energy 10%)
            final_score = round(
                (harm_score * 0.55) +
                (bpm_score * 0.35) +
                (energy_score * 0.10)
            )

            # Mix suggestion text
            if harm_info['type'] == 'exact':
                mix_tip = 'Long 32-bar melodic blend or drop swap'
            elif harm_info['type'] == 'lift':
                mix_tip = 'Build tension into breakdown and cut on drop'
            elif harm_info['type'] == 'boost':
                mix_tip = 'High-impact power drop into new groove'
            elif harm_info['type'] == 'relative':
                mix_tip = 'Vocal / Emotional mood switch during outro'
            else:
                mix_tip = 'Quick phrase cut or echo freeze transition'

            candidate = dict(trk)
            candidate['copilot_score'] = final_score
            candidate['harmonic_info'] = harm_info
            candidate['bpm_info'] = bpm_info
            candidate['mix_tip'] = mix_tip

            scored_candidates.append(candidate)

        # Sort descending by composite score, then BPM precision
        scored_candidates.sort(
            key=lambda x: (x['copilot_score'], x['bpm_info']['score']),
            reverse=True
        )

        return scored_candidates[:max_results]
