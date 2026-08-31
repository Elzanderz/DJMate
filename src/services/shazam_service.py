# -*- coding: utf-8 -*-
import os
import asyncio
import tempfile
import subprocess
import yt_dlp
from typing import List, Dict, Optional
from shazamio import Shazam
from .spotify_service import SpotifyService
from .genre_classifier_service import GenreClassifierService

class ShazamService:
    @classmethod
    async def recognize_audio_bytes(cls, audio_bytes: bytes) -> Optional[Dict]:
        try:
            shazam = Shazam()
            out = await shazam.recognize(audio_bytes)
            track = out.get('track')
            if track:
                title = track.get('title', '')
                artist = track.get('subtitle', '')
                cover = track.get('images', {}).get('coverart', '')
                return {
                    'title': title,
                    'artist': artist,
                    'cover_url': cover
                }
        except Exception:
            pass
        return None

    @classmethod
    def scan_youtube_audio(cls, yt_url: str, interval_sec: int = 180) -> List[Dict]:
        """
        Extracts 12-second audio segments from a YouTube video/mix at regular intervals
        and recognizes tracks using Shazam AI fingerprinting.
        """
        tracks = []
        seen_titles = set()

        with tempfile.TemporaryDirectory() as tmpdir:
            # 1. Download lowest-quality audio for fast scanning
            audio_path = os.path.join(tmpdir, "scan_audio.mp3")
            ydl_opts = {
                'format': 'worstaudio/worst',
                'outtmpl': audio_path,
                'quiet': True,
                'no_warnings': True,
            }
            try:
                with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                    info = ydl.extract_info(yt_url, download=True)
                    duration = int(info.get('duration') or 1800)
            except Exception as e:
                return []

            # 2. Slice 12-second samples at intervals
            timestamps = list(range(10, duration - 15, max(60, interval_sec)))
            samples = []

            for ts in timestamps:
                sample_file = os.path.join(tmpdir, f"sample_{ts}.mp3")
                cmd = [
                    'ffmpeg', '-y', '-ss', str(ts), '-t', '12',
                    '-i', audio_path, '-ac', '1', '-ar', '44100',
                    sample_file
                ]
                subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                if os.path.exists(sample_file):
                    with open(sample_file, 'rb') as sf:
                        samples.append((ts, sf.read()))

            # 3. Recognize in parallel
            async def scan_all():
                tasks = [cls.recognize_audio_bytes(data) for _, data in samples]
                return await asyncio.gather(*tasks)

            results = asyncio.run(scan_all())

            for i, res in enumerate(results):
                if res and res.get('title'):
                    key = f"{res['title'].lower()}:{res['artist'].lower()}"
                    if key not in seen_titles:
                        seen_titles.add(key)
                        ts = timestamps[i]
                        m = ts // 60
                        s = ts % 60
                        time_str = f"{m:02d}:{s:02d}"

                        # Enrich with Spotify & Genre
                        match = SpotifyService.search_track(f"{res['artist']} {res['title']}")
                        if match:
                            match['timestamp'] = time_str
                            tracks.append(match)
                        else:
                            genre = GenreClassifierService.classify(res['artist'], res['title'])
                            tracks.append({
                                'id': f'shazam_{len(tracks)+1}',
                                'title': res['title'],
                                'artist': res['artist'],
                                'album': 'Identified by Shazam',
                                'duration_ms': 180000,
                                'cover_url': res.get('cover_url', ''),
                                'year': '',
                                'genre': genre,
                                'timestamp': time_str,
                                'track_number': len(tracks) + 1,
                                'search_query': f"{res['artist']} - {res['title']}"
                            })

        return tracks
