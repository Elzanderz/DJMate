# -*- coding: utf-8 -*-
import os
import re
import json
import shutil
from typing import List, Dict, Tuple
from src.services.rekordbox_service import RekordboxService

class DJCrateService:
    """
    AI DJ Gig & Crate Organizer:
    Intelligently sorts and structures audio libraries into professional Gig Profiles
    (Mood, Genre, Energy & Set Time) with automated folder storage & Rekordbox XML.
    """

    GIG_PROFILES_DEF = [
        {
            'id': 'sunset_lounge',
            'name': '🏖️ 01. Sunset & Chill Lounge',
            'folder': '01_Sunset_Chill_Lounge',
            'description': '100-122 BPM : Organic House, Deep House, Melodic Downtempo, Chillout, Ambient',
            'min_bpm': 100.0,
            'max_bpm': 122.0,
            'min_energy': 1,
            'max_energy': 5,
            'genres': ['Organic House', 'Deep House', 'Downtempo', 'Melodic', 'Lounge', 'Chill', 'Nu-Disco', 'Ambient', 'Indie Dance'],
            'color': '#14b8a6', # Teal
        },
        {
            'id': 'rooftop_warmup',
            'name': '🍸 02. Rooftop & Cocktail Warm-Up',
            'folder': '02_Rooftop_Cocktail_Warmup',
            'description': '118-125 BPM : Funky House, Nu-Disco, Jackin, Indie Dance, Soulful Groove',
            'min_bpm': 118.0,
            'max_bpm': 125.0,
            'min_energy': 3,
            'max_energy': 7,
            'genres': ['Funky House', 'Nu-Disco', 'House', 'Jackin House', 'Indie Dance', 'Soulful', 'Groove', 'Dance'],
            'color': '#f59e0b', # Amber
        },
        {
            'id': 'peak_time_club',
            'name': '🔥 03. Peak-Time Mainstage Bangers',
            'folder': '03_PeakTime_Mainstage_Bangers',
            'description': '125-132 BPM : Tech House, Big Room, EDM, Bass House, Future Rave',
            'min_bpm': 125.0,
            'max_bpm': 132.0,
            'min_energy': 7,
            'max_energy': 10,
            'genres': ['Tech House', 'Big Room', 'Bass House', 'Electro House', 'EDM', 'Mainstage', 'Club', 'Dance / Electro Pop', 'Future Rave'],
            'color': '#ef4444', # Red
        },
        {
            'id': 'underground_techno',
            'name': '🌌 04. Underground & Dark Techno',
            'folder': '04_Underground_Dark_Techno',
            'description': '126-145 BPM : Peak Time Driving Techno, Melodic Techno, Raw, Acid, Hard Techno',
            'min_bpm': 126.0,
            'max_bpm': 145.0,
            'min_energy': 6,
            'max_energy': 10,
            'genres': ['Techno', 'Peak Time / Driving Techno', 'Hard Techno', 'Melodic Techno', 'Raw / Deep / Hypnotic', 'Acid'],
            'color': '#8b5cf6', # Purple
        },
        {
            'id': 'commercial_party',
            'name': '🎤 05. Commercial Pop & Radio Hits',
            'folder': '05_Commercial_Pop_Radio_Hits',
            'description': '95-130 BPM : Sing-along vocal hits, radio pop remixes, fresh pop dance',
            'min_bpm': 95.0,
            'max_bpm': 130.0,
            'min_energy': 4,
            'max_energy': 9,
            'genres': ['Pop', 'Dance Pop', 'Fresh Pop', 'Dance', 'Open Format'],
            'color': '#ec4899', # Pink
        },
        {
            'id': 'thai_pub_hits',
            'name': '🇹🇭 06. Thai Pub & Sing-Along Hits',
            'folder': '06_Thai_Pub_SingAlong_Hits',
            'description': '75-135 BPM : Thai Pop, Thai Rock, T-Pop, Thai Indie, Pub Crowd Pleasers',
            'min_bpm': 75.0,
            'max_bpm': 135.0,
            'min_energy': 3,
            'max_energy': 9,
            'genres': ['Thai Pop', 'Thai Rock', 'Thai Indie', 'T-Pop', 'Thai Pub', 'T-Rap'],
            'color': '#3b82f6', # Blue
        },
        {
            'id': 'hiphop_trap_rnb',
            'name': '💎 07. Hip-Hop, Trap & R&B Club',
            'folder': '07_HipHop_Trap_RnB_Club',
            'description': '70-110 BPM : Hip-Hop, Trap, Drill, R&B, Jersey Club, Urban Bounce',
            'min_bpm': 70.0,
            'max_bpm': 110.0,
            'min_energy': 4,
            'max_energy': 9,
            'genres': ['Hip-Hop', 'Trap', 'R&B', 'Drill', 'Jersey Club', 'Urban', 'Rap'],
            'color': '#6366f1', # Indigo
        },
        {
            'id': 'afro_latin_groove',
            'name': '🌴 08. Afro & Latin Dance Groove',
            'folder': '08_Afro_Latin_Dance_Groove',
            'description': '116-127 BPM : Afro House, Amapiano, Latin House, Baile Funk, Reggaeton',
            'min_bpm': 116.0,
            'max_bpm': 127.0,
            'min_energy': 4,
            'max_energy': 8,
            'genres': ['Afro House', 'Amapiano', 'Latin House', 'Tribal', 'Baile Funk', 'Dancehall', 'Reggaeton', 'Moombahton'],
            'color': '#10b981', # Emerald
        },
        {
            'id': 'afterhours_sunrise',
            'name': '⚡ 09. Afterhours & Minimal Sunrise',
            'folder': '09_Afterhours_Minimal_Sunrise',
            'description': '122-129 BPM : Hypnotic Minimal, Microhouse, Deep Tech, Progressive',
            'min_bpm': 122.0,
            'max_bpm': 129.0,
            'min_energy': 4,
            'max_energy': 7,
            'genres': ['Minimal / Deep Tech', 'Microhouse', 'Progressive House', 'Melodic House', 'Deep Tech'],
            'color': '#06b6d4', # Cyan
        },
        {
            'id': 'dj_tools_edits',
            'name': '🛠️ 10. DJ Weapons, Tools & Transitions',
            'folder': '10_DJ_Weapons_Tools_Transitions',
            'description': 'All BPMs : 100-128 Transitions, Mashups, Quick VIP Edits, Acapellas, Battle Tools',
            'min_bpm': 60.0,
            'max_bpm': 160.0,
            'min_energy': 5,
            'max_energy': 10,
            'genres': ['DJ Edit', 'Transition', 'Mashup', 'Bootleg', 'Acapella', 'VIP Edit', 'Tool'],
            'color': '#eab308', # Yellow
        }
    ]

    @classmethod
    def calculate_auto_energy_rating(cls, track: Dict) -> Dict:
        """
        Calculates intelligent 1-5 Star DJ Energy Rating and Rekordbox Rating (51-255).
        """
        bpm = float(track.get('bpm') or 124.0)
        genre = (track.get('genre') or '').lower()
        title = (track.get('title') or '').lower()
        
        # Base energy score (1-10)
        score = 6.0
        
        # BPM impact
        if bpm < 100:
            score -= 2.0
        elif bpm < 118:
            score -= 1.0
        elif 125 <= bpm <= 130:
            score += 1.5
        elif bpm > 130:
            score += 2.0
            
        # Genre impact
        if any(g in genre for g in ['chill', 'lounge', 'downtempo', 'ambient', 'organic']):
            score -= 2.5
        elif any(g in genre for g in ['tech house', 'big room', 'hard techno', 'future rave', 'bass house', 'edm', 'drum & bass']):
            score += 2.5
        elif any(g in genre for g in ['deep house', 'nu-disco', 'afro house', 'funk']):
            score += 0.5
            
        # Title keywords
        if any(w in title for w in ['remix', 'extended mix', 'club mix', 'vip', 'festival mix', 'edit', 'banger']):
            score += 1.0
        elif any(w in title for w in ['acoustic', 'slowed', 'reverb', 'unplugged', 'chill mix']):
            score -= 2.0
            
        if 'energy' in track and isinstance(track['energy'], (int, float)):
            e_val = float(track['energy'])
            if e_val <= 1.0:
                score = (score * 0.4) + (e_val * 10 * 0.6)
            elif e_val <= 10.0:
                score = (score * 0.4) + (e_val * 0.6)

        score = max(1.0, min(10.0, score))
        
        # Map score (1-10) to 1-5 Stars
        if score <= 2.5:
            stars = 1
            label = "★☆☆☆☆ Warm-Up / Chill"
        elif score <= 4.5:
            stars = 2
            label = "★★☆☆☆ Cocktail / Lounge"
        elif score <= 6.5:
            stars = 3
            label = "★★★☆☆ Sing-Along / Groove"
        elif score <= 8.5:
            stars = 4
            label = "★★★★☆ Peak-Time Driving"
        else:
            stars = 5
            label = "★★★★★ Floor-Killer Drop"

        rating_255 = stars * 51

        return {
            'stars': stars,
            'rating_255': rating_255,
            'energy_score': round(score, 1),
            'energy_label': label
        }

    @classmethod
    def generate_auto_hot_cues(cls, track: Dict) -> List[Dict]:
        """
        Generates full 8-slot Pioneer CDJ Hot Cues (A-H) + Memory Cues based on musical grid.
        """
        bpm = float(track.get('bpm') or 124.0)
        if bpm <= 0:
            bpm = 124.0
        sec_per_beat = 60.0 / bpm
        sec_per_bar = sec_per_beat * 4.0
        
        dur_sec = float(track.get('duration_ms', 180000)) / 1000.0 if track.get('duration_ms') else 180.0
        if dur_sec < 30:
            dur_sec = 180.0
            
        # Calculate standard 8-Bar (32-Beat) and 16-Bar (64-Beat) phrase boundaries
        cue_a_time = 0.0  # Cue A: First Beat / Mix-In
        cue_b_time = round(sec_per_bar * 4, 2)   # Cue B: 16 Bars (Vocals / Hook) -> ~15-30s
        cue_c_time = round(sec_per_bar * 8, 2)   # Cue C: 32 Bars (Build-Up)
        cue_d_time = round(sec_per_bar * 12, 2)  # Cue D: 48 Bars (Main Drop 1)
        cue_e_time = round(dur_sec * 0.50, 2)    # Cue E: Mid Breakdown / Verse 2
        cue_f_time = round(dur_sec * 0.65, 2)    # Cue F: Drop 2 / Second Climax
        cue_g_time = round(dur_sec * 0.80, 2)    # Cue G: Bridge / Final Vocal
        cue_h_time = round(max(cue_d_time + 10, dur_sec - (sec_per_bar * 8)), 2) # Cue H: Mix-Out 32-Beats Outro

        cues = [
            {'num': 0, 'letter': 'A', 'name': '[A] Mix-In (Beat 1)', 'start': cue_a_time, 'r': '0', 'g': '255', 'b': '128'},
            {'num': 1, 'letter': 'B', 'name': '[B] Vocals / Verse 1', 'start': min(cue_b_time, dur_sec * 0.25), 'r': '255', 'g': '165', 'b': '0'},
            {'num': 2, 'letter': 'C', 'name': '[C] Build-Up', 'start': min(cue_c_time, dur_sec * 0.40), 'r': '155', 'g': '89', 'b': '182'},
            {'num': 3, 'letter': 'D', 'name': '[D] MAIN DROP 1', 'start': min(cue_d_time, dur_sec * 0.55), 'r': '255', 'g': '40', 'b': '40'},
            {'num': 4, 'letter': 'E', 'name': '[E] Verse 2 / Break', 'start': min(cue_e_time, dur_sec * 0.70), 'r': '241', 'g': '196', 'b': '15'},
            {'num': 5, 'letter': 'F', 'name': '[F] DROP 2 / Peak', 'start': min(cue_f_time, dur_sec * 0.82), 'r': '233', 'g': '30', 'b': '99'},
            {'num': 6, 'letter': 'G', 'name': '[G] Outro Bridge', 'start': min(cue_g_time, dur_sec * 0.90), 'r': '0', 'g': '188', 'b': '212'},
            {'num': 7, 'letter': 'H', 'name': '[H] MIX-OUT (32-Beats)', 'start': cue_h_time, 'r': '33', 'g': '150', 'b': '243'},
        ]
        return cues

    @classmethod
    def generate_my_tags(cls, track: Dict) -> Dict:
        """
        Generates Pioneer Rekordbox compliant My Tag categories (Situation, Energy, Vibe, Type).
        """
        bpm = float(track.get('bpm') or 124.0)
        stars = int(track.get('stars') or 3)
        energy = int(track.get('energy') or 6)
        title = (track.get('title') or '').lower()
        artist = (track.get('artist') or '').lower()
        genre = (track.get('genre') or '').lower()
        playlist = (track.get('playlist_name') or '').lower()

        situations = []
        energy_tags = []
        vibes = []
        types = []

        # 1. Situation
        if bpm <= 118 or energy <= 4:
            situations.append('Warm-Up')
        elif 119 <= bpm <= 125:
            situations.append('Pre-Peak')
        elif bpm >= 126 and energy >= 7:
            situations.append('Peak-Time')
            if stars >= 5:
                situations.append('Floor-Killer')
        
        if 'closing' in title or 'last' in title or 'memory' in title:
            situations.append('Last-Call')

        # 2. Energy
        if energy <= 3:
            energy_tags.append('Low-Energy')
        elif 4 <= energy <= 6:
            energy_tags.append('Mid-Groove')
        elif 7 <= energy <= 8:
            energy_tags.append('High-Energy')
        else:
            energy_tags.append('Peak-Banger')

        # 3. Vibe & Character
        is_thai = any('\u0e00' <= c <= '\u0e7f' for c in title + artist + genre)
        if is_thai:
            vibes.append('Thai-Pub')
            vibes.append('Sing-Along')
        elif 'pop' in genre or 'sing' in title or 'vocal' in title:
            vibes.append('Sing-Along')
            vibes.append('Vocal')
        
        if 'drop' in title or 'club' in genre or 'techno' in genre or 'bass' in genre:
            vibes.append('Drop-Heavy')

        # 4. Type / DJ Tool
        if any(k in title for k in ['transition', '100-128', '100-120', '100-126', '100-130']):
            types.append('Transition-Tool')
        elif any(k in title for k in ['edit', 'remix', 'bootleg', 'flip', 'vip', 'mashup']):
            types.append('Club-Edit')
        elif 'acapella' in title:
            types.append('Acapella')
        else:
            types.append('Original')

        my_tag_string = ' '.join([f"#{s}" for s in situations + energy_tags + vibes + types])
        
        return {
            'situations': situations,
            'energy_tags': energy_tags,
            'vibes': vibes,
            'types': types,
            'my_tag_string': my_tag_string
        }

    @classmethod
    def classify_track_to_profile(cls, track: Dict) -> str:
        """
        AI heuristics to assign a track to the best matching DJ Gig Profile.
        """
        bpm = float(track.get('bpm') or 124.0)
        genre = (track.get('genre') or '').lower()
        title = (track.get('title') or '').lower()
        artist = (track.get('artist') or '').lower()
        stars = int(track.get('stars') or 3)
        playlist = (track.get('playlist_name') or '').lower()

        # Check Thai content first
        if any('\u0e00' <= c <= '\u0e7f' for c in title + artist + genre + playlist):
            return 'thai_pub_hits'

        # Check DJ Tools / Transitions
        if any(k in title for k in ['transition', '100-128', '100-120', '100-126', '100-130', 'short edit', 'quick edit', 'acapella in', 'acapella out']):
            return 'dj_tools_edits'

        # Check Hip-Hop / Trap / R&B
        if any(g in genre for g in ['hip-hop', 'trap', 'r&b', 'drill', 'jersey club', 'rap']) or (bpm < 112 and 'house' not in genre):
            return 'hiphop_trap_rnb'

        scores = {}
        for p in cls.GIG_PROFILES_DEF:
            score = 0
            pid = p['id']

            # 1. BPM matching (Core)
            if p['min_bpm'] <= bpm <= p['max_bpm']:
                score += 40
            elif abs(bpm - p['min_bpm']) <= 3 or abs(bpm - p['max_bpm']) <= 3:
                score += 20

            # 2. Genre matching
            for g in p['genres']:
                gl = g.lower()
                if gl in genre or gl in playlist:
                    score += 50
                if gl in title or gl in artist:
                    score += 15

            # 3. Energy / Rating heuristics
            if pid == 'peak_time_club' and stars >= 4 and bpm >= 126:
                score += 30
            if pid == 'sunset_lounge' and ('chill' in title or 'sunset' in title or 'acoustic' in title or bpm <= 118):
                score += 25
            if pid == 'underground_techno' and ('techno' in genre or 'dark' in title or 'acid' in title):
                score += 35
            if pid == 'commercial_party' and ('pop' in genre or 'fresh pop' in playlist):
                score += 35
            if pid == 'afro_latin_groove' and ('afro' in genre or 'amapiano' in genre or 'latin' in genre):
                score += 45

            scores[pid] = score

        best_profile = max(scores.items(), key=lambda x: x[1])
        if best_profile[1] <= 10:
            return 'commercial_party' if bpm <= 120 else 'peak_time_club'
        return best_profile[0]

    @classmethod
    def auto_classify_library(cls, tracks: List[Dict]) -> List[Dict]:
        """
        Groups all library tracks into Gig Profile Crates.
        """
        profile_map = {p['id']: dict(p) for p in cls.GIG_PROFILES_DEF}
        for p in profile_map.values():
            p['tracks'] = []

        for t in tracks:
            pid = cls.classify_track_to_profile(t)
            t_copy = dict(t)
            t_copy['gig_profile'] = pid
            profile_map[pid]['tracks'].append(t_copy)

        # Harmonic sort inside each crate for DJ readiness
        from src.services.dj_analyzer_service import DJAnalyzerService
        for p in profile_map.values():
            if p['tracks']:
                p['tracks'] = DJAnalyzerService.smart_harmonic_sort(p['tracks'])
                p['count'] = len(p['tracks'])
                p['bpm_range'] = f"{int(min(t.get('bpm', 120) for t in p['tracks']))} - {int(max(t.get('bpm', 120) for t in p['tracks']))} BPM"
            else:
                p['count'] = 0
                p['bpm_range'] = f"{int(p['min_bpm'])} - {int(p['max_bpm'])} BPM"

        return list(profile_map.values())

    @classmethod
    def build_dj_storage_profiles(cls, tracks: List[Dict], base_output_dir: str) -> Dict:
        """
        Automated Smart Storage Organization:
        Creates physical profile folders with audio files + per-gig rekordbox.xml
        plus a Master ALL_GIGS_rekordbox.xml ready for drag-and-drop into Pioneer Rekordbox!
        """
        storage_root = os.path.join(base_output_dir, 'DJ_Gig_Storage')
        os.makedirs(storage_root, exist_ok=True)

        classified_profiles = cls.auto_classify_library(tracks)
        master_collection = []
        profile_results = []

        for prof in classified_profiles:
            p_tracks = prof.get('tracks', [])
            if not p_tracks:
                continue

            folder_name = prof['folder']
            prof_dir = os.path.join(storage_root, folder_name)
            os.makedirs(prof_dir, exist_ok=True)

            prof_copied_tracks = []
            for idx, t in enumerate(p_tracks, start=1):
                src_fp = t.get('filepath', '')
                if not src_fp or not os.path.exists(src_fp):
                    continue

                fname = os.path.basename(src_fp)
                dest_fp = os.path.join(prof_dir, fname)

                try:
                    if not os.path.exists(dest_fp) or os.path.getsize(dest_fp) != os.path.getsize(src_fp):
                        shutil.copy2(src_fp, dest_fp)

                    t_entry = dict(t)
                    t_entry['filepath'] = dest_fp
                    t_entry['playlist_name'] = prof['name']
                    t_entry['track_number'] = idx
                    prof_copied_tracks.append(t_entry)
                    master_collection.append(t_entry)
                except Exception as e:
                    print(f"Error copying to profile storage: {e}")

            # Generate individual Rekordbox XML for this Gig Profile
            xml_file = os.path.join(prof_dir, 'rekordbox.xml')
            m3u8_file = os.path.join(prof_dir, f"{folder_name}.m3u8")
            RekordboxService.export_rekordbox_xml(prof_copied_tracks, xml_file, playlist_name=prof['name'])
            RekordboxService.export_m3u8(prof_copied_tracks, m3u8_file, playlist_name=prof['name'])

            profile_results.append({
                'id': prof['id'],
                'name': prof['name'],
                'folder': folder_name,
                'path': prof_dir,
                'count': len(prof_copied_tracks),
                'xml_path': xml_file,
                'm3u8_path': m3u8_file,
            })

        # Generate Master Tree Rekordbox XML
        master_xml_file = os.path.join(storage_root, 'MASTER_GIGS_rekordbox.xml')
        master_m3u8_file = os.path.join(storage_root, 'ALL_GIGS_COLLECTION.m3u8')
        RekordboxService.export_rekordbox_xml(master_collection, master_xml_file, playlist_name='All DJ Gig Crates')
        RekordboxService.export_m3u8(master_collection, master_m3u8_file, playlist_name='All DJ Gig Crates')

        # Generate DJ Rekordbox & CDJ Pro Storage Guide
        guide_file = os.path.join(storage_root, 'DJ_REKORDBOX_GUIDE.txt')
        guide_text = (
            "🎧 PIONEER REKORDBOX & CDJ PRO DJ STORAGE CASE GUIDE\n"
            "===================================================\n\n"
            "1. DRAG-AND-DROP TO REKORDBOX (วิธีลากวางสะดวกที่สุด):\n"
            "   - เปิดโปรแกรม Pioneer Rekordbox (v6 หรือ v7)\n"
            "   - เปิดโฟลเดอร์นี้ (DJ_Gig_Storage) ใน File Explorer\n"
            "   - ลากโฟลเดอร์แต่ละ Crate (เช่น 01_Sunset_Beach_Lounge, 03_PeakTime_Mainstage_Club)\n"
            "     ไปวางลงที่หัวข้อ 'Playlists' หรือ 'Collection' ในแถบซ้ายของ Rekordbox ได้ทันที\n\n"
            "2. IMPORT VIA MASTER REKORDBOX XML (วิธีนำเข้าโครงสร้าง Crate ทั้งหมดพร้อมกัน):\n"
            "   - ใน Rekordbox ไปที่ Preferences (Settings) -> Advanced -> Database\n"
            "   - ตรงช่อง 'rekordbox xml' ให้กด Browse แล้วเลือกไฟล์:\n"
            f"     {master_xml_file}\n"
            "   - ในหน้าต่างหลักของ Rekordbox แถบซ้ายจะปรากฏเมนู 'rekordbox xml'\n"
            "   - คลิกขวาที่ 'All DJ Gig Crates' แล้วเลือก 'Import to Collection' / 'Import Playlist'\n"
            "   - คุณจะได้ Crate ครบทุกระดับ Energy, BPM, Key, Cue Points และ Rating ทันที!\n\n"
            "3. EXPORT TO USB DRIVE (สำหรับ Pioneer CDJ-2000NXS2 / CDJ-3000 / XDJ-XZ / Opus-Quad):\n"
            "   - เสียบ USB (FAT32 หรือ exFAT)\n"
            "   - ใน Rekordbox เปิดแถบ Sync Manager เลือกลิสต์ Crates แล้วกด Sync เพื่อนำไปเสียบเล่นที่คลับได้ทันที!\n"
        )
        try:
            with open(guide_file, 'w', encoding='utf-8') as f:
                f.write(guide_text)
        except Exception:
            pass

        return {
            'success': True,
            'storage_root': storage_root,
            'total_tracks': len(master_collection),
            'profiles_count': len(profile_results),
            'profiles': profile_results,
            'master_xml': master_xml_file,
            'master_m3u8': master_m3u8_file,
            'guide_file': guide_file,
        }
