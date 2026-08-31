# -*- coding: utf-8 -*-
import os
import shutil
import subprocess
import tempfile
from typing import Dict, List, Optional

class AudioNormalizerService:
    """
    Industry-standard EBU R128 / ITU-R BS.1770-4 Audio Loudness Normalizer.
    Balances audio volume across all tracks to -14.0 LUFS (DJ / Rekordbox / Streaming standard)
    with True Peak limiting at -1.0 dBTP to eliminate distortion and volume spikes.
    """

    DEFAULT_TARGET_LUFS = -14.0
    DEFAULT_TRUE_PEAK = -1.0
    DEFAULT_LRA = 11.0

    @classmethod
    def normalize_audio_file(
        cls,
        filepath: str,
        target_lufs: float = DEFAULT_TARGET_LUFS,
        true_peak: float = DEFAULT_TRUE_PEAK,
        audio_quality: str = '320',
        preserve_metadata: bool = True
    ) -> str:
        """
        Normalizes the given audio file to the target LUFS.
        Replaces the file in-place safely via temporary file.
        Returns the path to the normalized file (or original if failed).
        """
        if not filepath or not os.path.exists(filepath):
            return filepath

        ext = os.path.splitext(filepath)[1].lower()
        if ext not in ('.mp3', '.m4a', '.wav', '.flac', '.aac', '.ogg'):
            return filepath

        temp_dir = tempfile.gettempdir()
        temp_out = os.path.join(temp_dir, f"norm_{os.path.basename(filepath)}")

        codec_args = []
        if ext == '.mp3':
            kbps = f"{audio_quality}k" if audio_quality and not str(audio_quality).endswith('k') else (audio_quality or '320k')
            codec_args = ['-c:a', 'libmp3lame', '-b:a', str(kbps)]
        elif ext in ('.wav', '.flac'):
            codec_args = ['-c:a', 'flac' if ext == '.flac' else 'pcm_s16le']
        elif ext in ('.m4a', '.aac'):
            codec_args = ['-c:a', 'aac', '-b:a', '256k']
        else:
            codec_args = ['-c:a', 'libmp3lame', '-b:a', '320k']

        filter_str = f"loudnorm=I={target_lufs}:TP={true_peak}:LRA={cls.DEFAULT_LRA}"

        cmd = [
            'ffmpeg', '-y',
            '-i', filepath,
            '-af', filter_str
        ] + codec_args

        if preserve_metadata:
            cmd += ['-map_metadata', '0']

        cmd.append(temp_out)

        try:
            startupinfo = None
            if os.name == 'nt':
                startupinfo = subprocess.STARTUPINFO()
                startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW

            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                encoding='utf-8',
                errors='ignore',
                startupinfo=startupinfo,
                timeout=90
            )

            if result.returncode == 0 and os.path.exists(temp_out) and os.path.getsize(temp_out) > 1000:
                shutil.move(temp_out, filepath)
                return filepath
        except Exception as e:
            print(f"[AudioNormalizerService] Warning: Failed to normalize {filepath}: {e}")
        finally:
            if os.path.exists(temp_out):
                try:
                    os.remove(temp_out)
                except Exception:
                    pass

        return filepath

    @classmethod
    def batch_normalize_files(
        cls,
        filepaths: List[str],
        target_lufs: float = DEFAULT_TARGET_LUFS
    ) -> Dict:
        """
        Batch normalizes a list of audio files concurrently.
        """
        from concurrent.futures import ThreadPoolExecutor

        valid_files = [f for f in filepaths if f and os.path.exists(f)]
        total = len(valid_files)
        if total == 0:
            return {'success': True, 'normalized_count': 0, 'total': 0}

        success_count = 0

        def process_one(f):
            nonlocal success_count
            res = cls.normalize_audio_file(f, target_lufs=target_lufs)
            if res == f:
                success_count += 1
            return res

        workers = min(os.cpu_count() or 4, 6)
        with ThreadPoolExecutor(max_workers=workers) as executor:
            list(executor.map(process_one, valid_files))

        return {
            'success': True,
            'normalized_count': success_count,
            'total': total,
            'target_lufs': target_lufs
        }
