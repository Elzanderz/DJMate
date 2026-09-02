# -*- coding: utf-8 -*-
import os
import re
import shutil
import xml.etree.ElementTree as ET
from xml.dom import minidom
from typing import List, Dict
from datetime import date
from .rekordbox_service import RekordboxService

class DJExportersService:
    @staticmethod
    def export_traktor_nml(tracks: List[Dict], output_file: str, playlist_name: str = 'Spotify DJ Set') -> str:
        """
        Exports Native Instruments Traktor Pro Collection NML file.
        """
        root = ET.Element('NML', VERSION='19')
        ET.SubElement(root, 'HEAD', COMPANY='Native Instruments', PROGRAM='Traktor')
        
        collection = ET.SubElement(root, 'COLLECTION', ENTRIES=str(len(tracks)))
        
        for idx, t in enumerate(tracks, start=1):
            filepath = t.get('filepath', '')
            filename = os.path.basename(filepath) if filepath else f"{t.get('title', 'Track')}.mp3"
            dir_path = os.path.dirname(os.path.abspath(filepath)) if filepath else ''
            
            entry = ET.SubElement(
                collection,
                'ENTRY',
                TITLE=t.get('title', ''),
                ARTIST=t.get('artist', ''),
                AUDIO_ID=str(idx)
            )
            
            # Location tag
            location = ET.SubElement(
                entry,
                'LOCATION',
                DIR=dir_path.replace('\\', '/') + '/',
                FILE=filename,
                VOLUME='C:'
            )
            
            # Tempo tag
            bpm_val = f"{float(t.get('bpm', 120.0)):.2f}"
            ET.SubElement(entry, 'TEMPO', BPM=bpm_val, BPM_QUALITY='100.000000')
            
            # Musical Key info
            ET.SubElement(entry, 'INFO', KEY=t.get('camelot', '8A'), GENRE=t.get('genre', 'Dance'))
            
            # Cues
            for cue in t.get('cues', []):
                ET.SubElement(
                    entry,
                    'CUE_V2',
                    NAME=cue.get('name', 'Hot Cue'),
                    START=str(cue.get('start', 0.0) * 1000.0),
                    TYPE='0'
                )

        # Playlists tree
        playlists = ET.SubElement(root, 'PLAYLISTS')
        root_node = ET.SubElement(playlists, 'NODE', TYPE='FOLDER', NAME='$ROOT')
        pl_node = ET.SubElement(root_node, 'NODE', TYPE='PLAYLIST', NAME=playlist_name)
        pl_elem = ET.SubElement(pl_node, 'PLAYLIST', ENTRIES=str(len(tracks)), TYPE='LIST')
        
        for t in tracks:
            fp = t.get('filepath', '')
            fn = os.path.basename(fp) if fp else f"{t.get('title', 'Track')}.mp3"
            dp = os.path.dirname(os.path.abspath(fp)) if fp else ''
            e = ET.SubElement(pl_elem, 'ENTRY')
            dp_clean = dp.replace('\\', '/')
            ET.SubElement(e, 'PRIMARYKEY', TYPE='TRACK', KEY=f"C:{dp_clean}/{fn}")

        raw_xml = ET.tostring(root, encoding='utf-8')
        pretty_xml = minidom.parseString(raw_xml).toprettyxml(indent='  ', encoding='utf-8')
        with open(output_file, 'wb') as f:
            f.write(pretty_xml)
        return output_file

    @staticmethod
    def export_virtualdj_xml(tracks: List[Dict], output_file: str) -> str:
        """
        Exports Virtual DJ .vdjplaylist file.
        """
        root = ET.Element('VirtualDJ_Database', Version='8.5')
        for t in tracks:
            fp = t.get('filepath', '')
            song = ET.SubElement(
                root,
                'Song',
                FilePath=os.path.abspath(fp) if fp else f"{t.get('title')}.mp3",
                Bpm=f"{float(t.get('bpm', 120.0)):.2f}",
                Key=t.get('camelot', '8A'),
                Title=t.get('title', ''),
                Author=t.get('artist', ''),
                Genre=t.get('genre', 'Dance')
            )
            for cue in t.get('cues', []):
                ET.SubElement(song, 'Poi', Type='cue', Pos=str(int(cue.get('start', 0.0) * 1000)), Name=cue.get('name', 'Cue'))

        raw_xml = ET.tostring(root, encoding='utf-8')
        pretty_xml = minidom.parseString(raw_xml).toprettyxml(indent='  ', encoding='utf-8')
        with open(output_file, 'wb') as f:
            f.write(pretty_xml)
        return output_file

    @classmethod
    def export_all_dj_formats(cls, tracks: List[Dict], mixtape_title: str, output_base_dir: str, copy_audio: bool = False) -> Dict:
        """
        Creates an All-in-One Pro DJ Folder with:
        1. Pioneer Rekordbox XML (8 Hot Cues A-H, Camelot Key, 1-5 Stars Energy Rating)
        2. Extended M3U8 Playlist (Serato / Denon Engine OS / CDJ)
        3. Native Instruments Traktor NML Collection
        4. Virtual DJ Playlist XML
        5. (Optional) Sequentially numbered audio files (01 - Artist - Title.mp3) when copy_audio=True
        """
        safe_title = re.sub(r'[\\/*?:"<>|]', '_', mixtape_title).strip() or 'Pro_DJ_Set'
        target_dir = os.path.join(output_base_dir, safe_title)
        os.makedirs(target_dir, exist_ok=True)

        processed_tracks = []
        for idx, t in enumerate(tracks, start=1):
            t_copy = dict(t)
            t_copy['track_number'] = idx
            orig_path = t.get('filepath', '')

            if copy_audio and orig_path and os.path.exists(orig_path):
                clean_title = re.sub(r'[\\/*?:"<>|]', '_', t.get('title', f'Track_{idx}')).strip()
                clean_artist = re.sub(r'[\\/*?:"<>|]', '_', t.get('artist', 'Artist')).strip()
                dest_filename = f"{idx:02d} - {clean_artist} - {clean_title}.mp3"
                dest_path = os.path.join(target_dir, dest_filename)
                try:
                    shutil.copy2(orig_path, dest_path)
                    t_copy['filepath'] = dest_path
                except Exception:
                    pass
            processed_tracks.append(t_copy)

        rekordbox_file = os.path.join(target_dir, 'rekordbox.xml')
        traktor_file = os.path.join(target_dir, f'{safe_title}_Traktor.nml')
        vdj_file = os.path.join(target_dir, f'{safe_title}_VirtualDJ.vdjplaylist')
        m3u8_file = os.path.join(target_dir, f'{safe_title}.m3u8')
        m3u_file = os.path.join(target_dir, f'{safe_title}.m3u')

        RekordboxService.export_rekordbox_xml(processed_tracks, rekordbox_file, playlist_name=mixtape_title)
        cls.export_traktor_nml(processed_tracks, traktor_file, playlist_name=mixtape_title)
        cls.export_virtualdj_xml(processed_tracks, vdj_file)
        RekordboxService.export_m3u8(processed_tracks, m3u8_file, playlist_name=mixtape_title)
        RekordboxService.export_m3u8(processed_tracks, m3u_file, playlist_name=mixtape_title)

        return {
            'success': True,
            'target_dir': target_dir,
            'rekordbox_file': rekordbox_file,
            'traktor_file': traktor_file,
            'vdj_file': vdj_file,
            'm3u8_file': m3u8_file,
            'copied_files': copy_audio,
            'count': len(processed_tracks)
        }
