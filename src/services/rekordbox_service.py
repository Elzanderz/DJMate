# -*- coding: utf-8 -*-
import os
import xml.etree.ElementTree as ET
from xml.dom import minidom
from typing import List, Dict
import urllib.parse
from datetime import date

def sanitize_for_xml(text: str) -> str:
    if not text:
        return ''
    # Strip 4-byte astral characters (emojis) and control characters that break Rekordbox C++ XML parser
    return ''.join(c for c in str(text) if ord(c) <= 0xFFFF and (ord(c) >= 32 or c in '\t\n\r')).strip()

class RekordboxService:
    @staticmethod
    def export_rekordbox_xml(tracks: List[Dict], output_file: str, playlist_name: str = 'Spotify DJ Set') -> str:
        """
        Exports a Pioneer DJ rekordbox-compliant XML file with BPM, Key (Tonality), and Playlists.
        """
        root = ET.Element('DJ_PLAYLISTS', Version='1.0.0')
        ET.SubElement(root, 'PRODUCT', Name='rekordbox', Version='7.0.0', Company='AlphaTheta')

        collection = ET.SubElement(root, 'COLLECTION', Entries=str(len(tracks)))
        track_keys = []

        for idx, t in enumerate(tracks, start=1):
            filepath = t.get('filepath', '')
            if filepath:
                abs_path = os.path.abspath(filepath).replace('\\', '/')
                if not abs_path.startswith('/'):
                    abs_path = '/' + abs_path
                path_url = 'file://localhost' + urllib.parse.quote(abs_path, safe='/:')
            else:
                path_url = ''

            bpm_val = f"{float(t.get('bpm', 120.0)):.2f}"
            tonality = sanitize_for_xml(t.get('camelot') or t.get('key_name', ''))
            genre = sanitize_for_xml(t.get('genre', 'Dance / DJ'))
            duration_sec = str(int(t.get('duration_ms', 180000) / 1000))
            year = str(t.get('year', ''))
            
            # Auto DJ Energy Rating (1-5 stars mapped to 51-255 in rekordbox)
            from src.services.dj_crate_service import DJCrateService
            energy_info = DJCrateService.calculate_auto_energy_rating(t)
            stars = int(t.get('stars') or energy_info['stars'])
            rating_val = str(t.get('rating_255') or energy_info['rating_255'])

            # Rekordbox My Tag & Comments
            tag_data = DJCrateService.generate_my_tags(t)
            comments_val = sanitize_for_xml(t.get('comments') or tag_data.get('my_tag_string', ''))

            track_elem = ET.SubElement(
                collection,
                'TRACK',
                TrackID=str(idx),
                Name=sanitize_for_xml(t.get('title', f'Track {idx}')),
                Artist=sanitize_for_xml(t.get('artist', 'Unknown Artist')),
                Album=sanitize_for_xml(t.get('album', '')),
                Genre=genre,
                Kind='MP3 File',
                TotalTime=duration_sec,
                TrackNumber=str(t.get('track_number', idx)),
                Year=year,
                AverageBpm=bpm_val,
                DateAdded=str(date.today()),
                BitRate='320',
                SampleRate='44100',
                Location=path_url,
                Comments=comments_val,
                Tonality=tonality,
                Rating=rating_val
            )

            # Add TEMPO grid marker
            ET.SubElement(track_elem, 'TEMPO', Inizio='0.00', Bpm=bpm_val, Metro='4/4', Battito='1')

            # Pioneer CDJ Memory Cue at 0:00
            ET.SubElement(track_elem, 'POSITION_MARK', Name='[MEM] First Beat', Type='0', Start='0.00', Num='-1')

            # Pioneer CDJ Full 8 Colored Hot Cues (A, B, C, D, E, F, G, H)
            hot_cues = DJCrateService.generate_auto_hot_cues(t)
            for cue in hot_cues:
                ET.SubElement(
                    track_elem,
                    'POSITION_MARK',
                    Name=sanitize_for_xml(cue['name']),
                    Type='0',
                    Start=f"{cue['start']:.2f}",
                    Num=str(cue['num']),
                    Red=cue['r'],
                    Green=cue['g'],
                    Blue=cue['b']
                )

            track_keys.append((str(idx), sanitize_for_xml(t.get('playlist_name') or 'Default Playlist')))

        # Build PLAYLISTS hierarchy with Multi-Playlist Support
        playlists_elem = ET.SubElement(root, 'PLAYLISTS')
        root_node = ET.SubElement(playlists_elem, 'NODE', Type='0', Name='ROOT')

        # Master All Tracks Playlist
        clean_pl_name = sanitize_for_xml(playlist_name) or 'All DJ Tracks'
        all_playlist_node = ET.SubElement(root_node, 'NODE', Name=clean_pl_name, Type='1', KeyType='0', Entries=str(len(track_keys)))
        for key, _ in track_keys:
            ET.SubElement(all_playlist_node, 'TRACK', Key=key)

        # Categorized Sub-Playlists by Playlist Name
        playlists_dict = {}
        for key, p_name in track_keys:
            playlists_dict.setdefault(p_name, []).append(key)

        if len(playlists_dict) > 1:
            for p_name, keys in playlists_dict.items():
                p_node = ET.SubElement(root_node, 'NODE', Name=p_name, Type='1', KeyType='0', Entries=str(len(keys)))
                for k in keys:
                    ET.SubElement(p_node, 'TRACK', Key=k)

        # Pretty print XML
        raw_xml = ET.tostring(root, encoding='utf-8')
        parsed = minidom.parseString(raw_xml)
        pretty_xml = parsed.toprettyxml(indent='  ', encoding='utf-8')

        with open(output_file, 'wb') as f:
            f.write(pretty_xml)

        return output_file

    @staticmethod
    def export_m3u8(tracks: List[Dict], output_file: str, playlist_name: str = 'DJ Set') -> str:
        """
        Exports an extended M3U8 DJ Playlist file with cross-platform relative path support.
        """
        lines = ['#EXTM3U', f'#PLAYLIST:{playlist_name}']
        out_dir = os.path.dirname(os.path.abspath(output_file))

        for t in tracks:
            duration_sec = int(t.get('duration_ms', 0) / 1000)
            artist = t.get('artist', 'Unknown Artist')
            title = t.get('title', 'Unknown Title')
            bpm = t.get('bpm', '')
            key = t.get('camelot', '')
            filepath = t.get('filepath', '')

            extra = f'[{key} | {bpm} BPM] ' if (key or bpm) else ''
            lines.append(f'#EXTINF:{duration_sec},{extra}{artist} - {title}')
            if filepath:
                abs_fp = os.path.abspath(filepath)
                try:
                    # Try to use relative path with forward slashes for Mac & USB compatibility
                    rel_fp = os.path.relpath(abs_fp, out_dir).replace('\\', '/')
                    lines.append(rel_fp)
                except Exception:
                    lines.append(abs_fp.replace('\\', '/'))
            else:
                lines.append(f'{artist} - {title}.mp3')

        with open(output_file, 'w', encoding='utf-8-sig') as f:
            f.write('\n'.join(lines))

        return output_file

    @staticmethod
    def export_tracklist_txt(tracks: List[Dict], output_file: str, playlist_name: str = 'Tracklist', format_mode: str = 'youtube') -> str:
        """
        Exports a clean tracklist TXT file suitable for YouTube descriptions / chapters or DJ notes.
        format_mode: 'youtube' (00:00 Artist - Title), 'numbered' (1. Artist - Title), 'pro_dj' (01. Artist - Title [128 BPM | 8A]), 'plain' (Artist - Title)
        """
        lines = [f"🎵 {playlist_name}", "=" * max(10, len(f"🎵 {playlist_name}")), ""]
        cum_sec = 0
        for idx, t in enumerate(tracks, start=1):
            artist = (t.get('artist') or 'Unknown Artist').strip()
            title = (t.get('title') or 'Unknown Title').strip()
            dur_sec = int(t.get('duration_ms', 0) / 1000) or 180
            bpm = t.get('bpm', '')
            key = t.get('camelot', '')

            m = cum_sec // 60
            s = cum_sec % 60
            if m < 60:
                ts_str = f"{m:02d}:{s:02d}"
            else:
                h = m // 60
                rem_m = m % 60
                ts_str = f"{h:02d}:{rem_m:02d}:{s:02d}"

            if format_mode == 'youtube':
                lines.append(f"{ts_str} {artist} - {title}")
            elif format_mode == 'pro_dj':
                extra = f"[{bpm} BPM | {key}]" if (bpm or key) else ""
                lines.append(f"{idx:02d}. {artist} - {title} {extra}".strip())
            elif format_mode == 'plain':
                lines.append(f"{artist} - {title}")
            else:  # numbered
                lines.append(f"{idx}. {artist} - {title}")

            cum_sec += dur_sec

        with open(output_file, 'w', encoding='utf-8') as f:
            f.write('\n'.join(lines))

        return output_file

    @staticmethod
    def _write_rekordbox_guide(guide_file: str, xml_path: str):
        guide_text = (
            "🎧 PIONEER REKORDBOX & CDJ PRO DJ STORAGE CASE GUIDE (MACBOOK / WINDOWS)\n"
            "=========================================================================\n\n"
            "1. DRAG-AND-DROP TO REKORDBOX (วิธีลากโฟลเดอร์ลง MacBook - ง่ายที่สุด):\n"
            "   - เสียบ USB Drive นี้เข้ากับ MacBook\n"
            "   - เปิดโปรแกรม Pioneer Rekordbox (v6 หรือ v7)\n"
            "   - เปิดโฟลเดอร์นี้ใน Finder\n"
            "   - ลากโฟลเดอร์เพลง (เช่น Fresh Pop, Thai Pop & Indie Hits, 03_PeakTime) ไปวางลงที่หัวข้อ 'Playlists' ทางซ้ายของ Rekordbox\n"
            "   - Rekordbox จะสร้าง Playlist พร้อม Hot Cues, Memory Cues, Key และ BPM ครบถ้วนทันที!\n\n"
            "2. IMPORT VIA REKORDBOX XML (วิธีนำเข้าโครงสร้างทั้งคลังพร้อมกัน):\n"
            "   - ใน Rekordbox บน Mac ไปที่ Preferences (Settings) -> Advanced -> Database\n"
            "   - ตรงช่อง 'rekordbox xml' ให้กด Browse แล้วเลือกไฟล์:\n"
            f"     {xml_path}\n"
            "   - ในแถบซ้ายของ Rekordbox คลิกขวาที่ 'All DJ Playlists' แล้วกด 'Import to Collection'\n"
            "   - ทุก Playlist และ Crate จะถูกซิงก์เข้า Rekordbox ของ MacBook 100%!\n\n"
            "3. EXPORT TO USB DRIVE FOR PIONEER CDJ / XDJ:\n"
            "   - เสียบ USB (FAT32 หรือ exFAT)\n"
            "   - ใน Rekordbox เปิด Sync Manager เลือกลิสต์ Playlists แล้วกด Sync เพื่อนำไปเสียบเล่นที่ร้านได้ทันที!\n"
        )
        try:
            with open(guide_file, 'w', encoding='utf-8') as f:
                f.write(guide_text)
        except Exception:
            pass

    @classmethod
    def export_to_dj_drive(
        cls,
        tracks: List[Dict],
        target_drive_dir: str,
        structure_mode: str = 'by_playlist',
        playlist_name: str = 'USB DJ Collection'
    ) -> Dict:
        """
        Direct 1-Click USB / External MacBook Drive Sync:
        Supports subfolders, playlist organization, 10 Pro DJ Crates, and direct folder export.
        """
        import shutil
        import re
        from src.services.history_service import HistoryService

        target_root = os.path.abspath(target_drive_dir)
        os.makedirs(target_root, exist_ok=True)

        # Cache of local audio files in downloads/ for fallback resolution
        project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
        downloads_root = os.path.join(project_root, 'downloads')
        cached_disk_files = []
        if os.path.exists(downloads_root):
            for r, _, files in os.walk(downloads_root):
                if 'DJ_Gig_Storage' in r or 'DJ_USB_Export' in r:
                    continue
                for f in files:
                    if f.lower().endswith(('.mp3', '.m4a', '.flac', '.wav')) and not f.startswith('.'):
                        cached_disk_files.append(os.path.join(r, f))

        def find_source_file(t: Dict) -> str:
            fp = t.get('filepath', '')
            if fp and os.path.exists(fp):
                return fp
            norm_t = HistoryService.normalize_name(t.get('title', ''))
            norm_a = HistoryService.normalize_name(t.get('artist', ''))
            for disk_fp in cached_disk_files:
                base = os.path.splitext(os.path.basename(disk_fp))[0]
                norm_base = HistoryService.normalize_name(base)
                if norm_t and norm_t in norm_base:
                    if not norm_a or norm_a in norm_base or len(norm_t) > 6:
                        return disk_fp
            return ''

        if structure_mode == 'by_gig_crates':
            from src.services.dj_crate_service import DJCrateService
            return DJCrateService.build_dj_storage_profiles(tracks, target_root)

        elif structure_mode == 'direct':
            copied_tracks = []
            for idx, t in enumerate(tracks, start=1):
                src_fp = find_source_file(t)
                if not src_fp:
                    continue
                fname = os.path.basename(src_fp)
                dest_fp = os.path.join(target_root, fname)
                try:
                    if not os.path.exists(dest_fp) or os.path.getsize(dest_fp) != os.path.getsize(src_fp):
                        shutil.copy2(src_fp, dest_fp)
                    t_entry = dict(t)
                    t_entry['filepath'] = dest_fp
                    t_entry['track_number'] = idx
                    copied_tracks.append(t_entry)
                except Exception as e:
                    print(f"Error copying to target: {e}")

            clean_pname = re.sub(r'[\\/*?:"<>|]', '_', playlist_name)
            xml_p = os.path.join(target_root, 'rekordbox.xml')
            m3u8_p = os.path.join(target_root, f"{clean_pname}.m3u8")
            cls.export_rekordbox_xml(copied_tracks, xml_p, playlist_name=playlist_name)
            cls.export_m3u8(copied_tracks, m3u8_p, playlist_name=playlist_name)

            guide_file = os.path.join(target_root, 'DJ_REKORDBOX_GUIDE.txt')
            cls._write_rekordbox_guide(guide_file, xml_p)

            return {
                'success': True,
                'target_dir': target_root,
                'exported_count': len(copied_tracks),
                'total_tracks': len(copied_tracks),
                'xml_path': xml_p,
                'm3u8_path': m3u8_p,
                'guide_file': guide_file
            }

        else: # 'by_playlist' (default)
            groups = {}
            for t in tracks:
                pname = (t.get('playlist_name') or 'Singles').strip()
                groups.setdefault(pname, []).append(t)

            master_collection = []
            folders_res = []

            for pname, p_tracks in groups.items():
                clean_pname = re.sub(r'[\\/*?:\"<>|]', '_', pname).strip()
                p_dir = os.path.join(target_root, clean_pname)
                os.makedirs(p_dir, exist_ok=True)

                p_copied = []
                for idx, t in enumerate(p_tracks, start=1):
                    src_fp = find_source_file(t)
                    if not src_fp:
                        continue
                    fname = os.path.basename(src_fp)
                    dest_fp = os.path.join(p_dir, fname)
                    try:
                        if not os.path.exists(dest_fp) or os.path.getsize(dest_fp) != os.path.getsize(src_fp):
                            shutil.copy2(src_fp, dest_fp)
                        t_entry = dict(t)
                        t_entry['filepath'] = dest_fp
                        t_entry['playlist_name'] = pname
                        t_entry['track_number'] = idx
                        p_copied.append(t_entry)
                        master_collection.append(t_entry)
                    except Exception as e:
                        print(f"Error copying to playlist folder: {e}")

                if p_copied:
                    p_xml = os.path.join(p_dir, 'rekordbox.xml')
                    p_m3u8 = os.path.join(p_dir, f"{clean_pname}.m3u8")
                    cls.export_rekordbox_xml(p_copied, p_xml, playlist_name=pname)
                    cls.export_m3u8(p_copied, p_m3u8, playlist_name=pname)
                    folders_res.append({
                        'name': pname,
                        'folder': clean_pname,
                        'path': p_dir,
                        'count': len(p_copied),
                        'xml': p_xml,
                        'm3u8': p_m3u8
                    })

            master_xml = os.path.join(target_root, 'MASTER_REKORDBOX.xml')
            master_m3u8 = os.path.join(target_root, 'ALL_PLAYLISTS.m3u8')
            cls.export_rekordbox_xml(master_collection, master_xml, playlist_name='All DJ Playlists')
            cls.export_m3u8(master_collection, master_m3u8, playlist_name='All DJ Playlists')

            guide_file = os.path.join(target_root, 'DJ_REKORDBOX_GUIDE.txt')
            cls._write_rekordbox_guide(guide_file, master_xml)

            return {
                'success': True,
                'target_dir': target_root,
                'exported_count': len(master_collection),
                'total_tracks': len(master_collection),
                'folders': folders_res,
                'xml_path': master_xml,
                'm3u8_path': master_m3u8,
                'guide_file': guide_file
            }
    def export_smart_mixtape_package(cls, tracks: List[Dict], mixtape_title: str, output_base_dir: str) -> Dict:
        """
        Exports all mixtape tracks into a self-contained DJ folder with:
        1. Sequentially numbered audio files (01 - Artist - Title.mp3)
        2. rekordbox.xml containing Hot Cues (Intro, Drop, Outro), BPM, Camelot Key, and 1-5 Stars Rating
        3. mixtape_setlist.m3u8 playlist file
        """
        import shutil
        import re
        safe_title = re.sub(r'[\\/*?:"<>|]', '_', mixtape_title).strip() or 'Smart_Mixtape_Set'
        target_dir = os.path.join(output_base_dir, safe_title)
        os.makedirs(target_dir, exist_ok=True)

        copied_tracks = []
        for idx, t in enumerate(tracks, start=1):
            t_copy = dict(t)
            t_copy['track_number'] = idx
            orig_path = t.get('filepath', '')
            
            clean_title = re.sub(r'[\\/*?:"<>|]', '_', t.get('title', f'Track_{idx}')).strip()
            clean_artist = re.sub(r'[\\/*?:"<>|]', '_', t.get('artist', 'Artist')).strip()
            dest_filename = f"{idx:02d} - {clean_artist} - {clean_title}.mp3"
            dest_path = os.path.join(target_dir, dest_filename)

            if orig_path and os.path.exists(orig_path):
                try:
                    shutil.copy2(orig_path, dest_path)
                    t_copy['filepath'] = dest_path
                except Exception:
                    pass
            copied_tracks.append(t_copy)

        xml_path = os.path.join(target_dir, 'rekordbox.xml')
        m3u8_path = os.path.join(target_dir, f'{safe_title}.m3u8')

        cls.export_rekordbox_xml(copied_tracks, xml_path, playlist_name=mixtape_title)
        cls.export_m3u8(copied_tracks, m3u8_path, playlist_name=mixtape_title)

        return {
            'success': True,
            'target_dir': target_dir,
            'xml_path': xml_path,
            'm3u8_path': m3u8_path,
            'count': len(copied_tracks)
        }