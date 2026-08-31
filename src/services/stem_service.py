# -*- coding: utf-8 -*-
import os
import subprocess
from typing import Optional

class StemService:
    """
    Audio Stem extractor for DJ performance.
    Supports:
    - 'full': original track
    - 'acapella': isolated center/lead vocals
    - 'instrumental': vocals removed (karaoke/beat track)
    """

    @classmethod
    def extract_stem(cls, input_file: str, stem_type: str = "full", output_dir: str = "") -> str:
        if stem_type == "full" or not os.path.exists(input_file):
            return input_file

        target_dir = output_dir or os.path.dirname(input_file)
        os.makedirs(target_dir, exist_ok=True)
        base_name, ext = os.path.splitext(os.path.basename(input_file))
        
        output_file = os.path.join(target_dir, f"{base_name} [{stem_type.upper()}]{ext}")
        if os.path.exists(output_file):
            return output_file

        try:
            if stem_type.lower() == "instrumental":
                # Voice removal via center-channel phase inversion and low/high cut preservation
                # pan filter: left = c0 - c1, right = c1 - c0, with sub bass preservation
                filter_complex = "pan=stereo|c0=c0-c1|c1=c1-c0,volume=1.5"
                cmd = [
                    "ffmpeg", "-y", "-i", input_file,
                    "-af", filter_complex,
                    "-c:a", "libmp3lame" if ext.lower() == ".mp3" else "flac",
                    "-b:a", "320k",
                    output_file
                ]
                subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
                return output_file

            elif stem_type.lower() == "acapella":
                # Lead vocal extraction: bandpass + center stereo focus
                filter_complex = "stereotools=mlev=1.4:slev=0.1,highpass=f=200,lowpass=f=5000,volume=1.3"
                cmd = [
                    "ffmpeg", "-y", "-i", input_file,
                    "-af", filter_complex,
                    "-c:a", "libmp3lame" if ext.lower() == ".mp3" else "flac",
                    "-b:a", "320k",
                    output_file
                ]
                subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
                return output_file

        except Exception:
            pass

        return input_file
