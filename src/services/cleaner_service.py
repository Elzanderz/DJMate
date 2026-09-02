# -*- coding: utf-8 -*-
import os
import re
import json
from typing import List, Dict, Tuple
from mutagen.mp3 import MP3

class CleanerService:
    """
    Duplicate Cleaner & Audio Quality Upgrader:
    Finds exact and fuzzy duplicate songs, inspects audio bitrates,
    and upgrades low-quality audio to pristine 320kbps.
    """

    @staticmethod
    def _normalize_name(text: str) -> str:
        t = (text or '').lower()
        # Remove common remix/edit suffixes for clean matching
        t = re.sub(r'[\(\[\{].*?[\)\]\}]', '', t)
        t = re.sub(r'[^\w\s]', '', t)
        t = re.sub(r'\s+', ' ', t).strip()
        return t

    @classmethod
    def inspect_track_quality(cls, filepath: str) -> Dict:
        """
        Inspects audio file bitrate, sample rate, and size.
        """
        if not filepath or not os.path.exists(filepath):
            return {'bitrate_kbps': 0, 'is_low_quality': True, 'size_mb': 0.0, 'sample_rate': 0}

        size_mb = round(os.path.getsize(filepath) / (1024 * 1024), 2)
        bitrate_kbps = 320
        sample_rate = 44100

        try:
            if filepath.lower().endswith('.mp3'):
                audio = MP3(filepath)
                if audio.info:
                    bitrate_kbps = int((audio.info.bitrate or 320000) / 1000)
                    sample_rate = int(audio.info.sample_rate or 44100)
        except Exception:
            pass

        is_low_quality = bitrate_kbps < 256 or (size_mb < 3.0 and not filepath.lower().endswith(('.wav', '.flac')))
        return {
            'bitrate_kbps': bitrate_kbps,
            'is_low_quality': is_low_quality,
            'size_mb': size_mb,
            'sample_rate': sample_rate
        }

    @classmethod
    def scan_duplicates(cls, tracks: List[Dict]) -> Dict:
        """
        Scans library tracks and clusters them into duplicate groups.
        """
        groups: Dict[str, List[Dict]] = {}

        for t in tracks:
            norm_title = cls._normalize_name(t.get('title', ''))
            norm_artist = cls._normalize_name(t.get('artist', ''))

            if not norm_title:
                continue

            key = f"{norm_artist}___{norm_title}" if norm_artist else norm_title
            
            # Augment track with quality info
            fp = t.get('filepath', '')
            quality = cls.inspect_track_quality(fp)
            t_copy = dict(t)
            t_copy.update(quality)

            if key not in groups:
                groups[key] = []
            groups[key].append(t_copy)

        duplicate_clusters = []
        low_quality_tracks = []
        mv_suspect_tracks = []

        for key, cluster in groups.items():
            # Check if cluster has duplicates
            if len(cluster) > 1:
                # Sort cluster: highest bitrate first, then largest file size
                sorted_cluster = sorted(
                    cluster,
                    key=lambda x: (x.get('bitrate_kbps', 0), x.get('size_mb', 0.0)),
                    reverse=True
                )
                
                # Mark recommended action
                for idx, item in enumerate(sorted_cluster):
                    item['is_recommended_keep'] = (idx == 0)
                    item['is_duplicate'] = (idx > 0)

                duplicate_clusters.append({
                    'cluster_key': key,
                    'title': cluster[0].get('title', ''),
                    'artist': cluster[0].get('artist', ''),
                    'count': len(cluster),
                    'tracks': sorted_cluster
                })

            for item in cluster:
                if item.get('is_low_quality'):
                    low_quality_tracks.append(item)

                # Check if item is suspect MV audio with skits/dialogue
                title_low = (item.get('title') or '').lower()
                fp_low = (item.get('filepath') or '').lower()
                has_mv_keyword = any(k in title_low or k in fp_low for k in [
                    'official music video', 'official video', 'mv', '[mv]', '(mv)', 'm/v',
                    'music video', 'short film', 'drama ver', 'live at', 'live session'
                ])
                if has_mv_keyword:
                    item_copy = dict(item)
                    item_copy['mv_warning_reason'] = 'พบชื่อ/แท็กตรงกับ Music Video (อาจมีเสียงพูด/เสียงเอฟเฟกต์แทรก)'
                    mv_suspect_tracks.append(item_copy)

        return {
            'total_duplicates_found': sum(len(c['tracks']) - 1 for c in duplicate_clusters),
            'clusters_count': len(duplicate_clusters),
            'clusters': duplicate_clusters,
            'low_quality_count': len(low_quality_tracks),
            'low_quality_tracks': low_quality_tracks,
            'mv_suspect_count': len(mv_suspect_tracks),
            'mv_suspect_tracks': mv_suspect_tracks
        }

    @classmethod
    def clean_duplicates_batch(cls, filepaths_to_delete: List[str]) -> Dict:
        """
        Safely deletes duplicate files from disk and updates library history.
        """
        from src.services.history_service import HistoryService
        deleted_count = 0
        freed_bytes = 0

        for fp in filepaths_to_delete:
            if fp and os.path.exists(fp):
                try:
                    freed_bytes += os.path.getsize(fp)
                    os.remove(fp)
                    deleted_count += 1
                except Exception as e:
                    print(f"Error removing duplicate file {fp}: {e}")

        # Batch delete from library database
        HistoryService.batch_delete_tracks(filepaths_to_delete, delete_files=False)

        return {
            'success': True,
            'deleted_count': deleted_count,
            'freed_mb': round(freed_bytes / (1024 * 1024), 2)
        }

    @classmethod
    def redownload_studio_master(cls, filepath: str) -> Dict:
        """
        Re-downloads a clean studio master (Topic/Audio) for a track and replaces the old MV audio file.
        """
        from src.services.history_service import HistoryService
        from src.services.downloader_service import DownloaderService
        from src.services.settings_service import SettingsService

        tracks = HistoryService.get_all()
        target_track = next((t for t in tracks if t.get('filepath') == filepath), None)
        if not target_track:
            filename = os.path.basename(filepath)
            base = os.path.splitext(filename)[0]
            parts = base.split(' - ', 1)
            if len(parts) == 2:
                target_track = {'artist': parts[0].strip(), 'title': parts[1].strip(), 'filepath': filepath}
            else:
                target_track = {'title': base, 'artist': '', 'filepath': filepath}

        output_dir = os.path.dirname(filepath) if os.path.exists(filepath) else SettingsService.get_output_dir()

        # If old file exists, remove it first to force re-download of clean studio version
        if filepath and os.path.exists(filepath):
            try:
                os.remove(filepath)
            except Exception:
                pass

        new_path = DownloaderService.download_track(
            target_track,
            output_dir=output_dir,
            audio_format='mp3',
            audio_quality='320'
        )

        if new_path and os.path.exists(new_path):
            HistoryService.sync_downloads_folder(output_dir)
            return {'success': True, 'new_filepath': new_path}
        return {'success': False, 'error': 'Failed to download studio master'}
