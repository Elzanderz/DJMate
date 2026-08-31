# -*- coding: utf-8 -*-
import os
import subprocess
import tempfile
from typing import Optional

class DJExtendedService:
    @classmethod
    def create_extended_edit(
        cls,
        input_audio_path: str,
        intro_bars: int = 8,
        outro_bars: int = 8,
        bpm: float = 128.0,
        output_path: Optional[str] = None
    ) -> str:
        """
        Creates a DJ-Ready Extended Edit MP3 with seamless 16/32-beat Drum Intro
        and Outro extensions for effortless live stage mixing.
        """
        if not os.path.exists(input_audio_path):
            return input_audio_path

        if not output_path:
            base, ext = os.path.splitext(input_audio_path)
            output_path = f"{base} (DJ Extended Edit){ext}"

        # Calculate bar length in seconds (4 beats per bar)
        beat_sec = 60.0 / max(60.0, min(180.0, bpm))
        bar_sec = beat_sec * 4.0
        intro_len = round(bar_sec * (intro_bars / 2.0), 3) # e.g. 8-15 seconds
        outro_len = round(bar_sec * (outro_bars / 2.0), 3)

        with tempfile.TemporaryDirectory() as tmpdir:
            intro_clip = os.path.join(tmpdir, "intro_drum.wav")
            outro_clip = os.path.join(tmpdir, "outro_drum.wav")

            # 1. Extract first intro bar and apply fade-in
            cmd_intro = [
                'ffmpeg', '-y', '-ss', '0', '-t', str(intro_len),
                '-i', input_audio_path,
                '-af', f'afade=t=in:ss=0:d=1.5,lowpass=f=4000',
                intro_clip
            ]
            subprocess.run(cmd_intro, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

            # 2. Extract last outro bar and apply fade-out
            cmd_outro = [
                'ffmpeg', '-y', '-sseof', f'-{outro_len}', '-t', str(outro_len),
                '-i', input_audio_path,
                '-af', f'afade=t=out:st=1:d={max(1.0, outro_len - 1.0)},highpass=f=200',
                outro_clip
            ]
            subprocess.run(cmd_outro, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

            # 3. Concatenate: [Intro Loop] + [Original Track] + [Outro Loop]
            concat_list = os.path.join(tmpdir, "concat.txt")
            with open(concat_list, 'w', encoding='utf-8') as f:
                if os.path.exists(intro_clip):
                    f.write(f"file '{intro_clip}'\n")
                f.write(f"file '{os.path.abspath(input_audio_path)}'\n")
                if os.path.exists(outro_clip):
                    f.write(f"file '{outro_clip}'\n")

            cmd_concat = [
                'ffmpeg', '-y', '-f', 'concat', '-safe', '0', '-i', concat_list,
                '-c:a', 'libmp3lame', '-b:a', '320k',
                output_path
            ]
            subprocess.run(cmd_concat, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

        if os.path.exists(output_path):
            return output_path
        return input_audio_path
