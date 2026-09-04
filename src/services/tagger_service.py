import os
import requests
from typing import Dict, Optional

class TaggerService:
    @staticmethod
    def apply_tags(filepath: str, metadata: Dict):
        """
        Embeds title, artist, album, track number, year, and cover art into the audio file.
        Supports MP3, M4A, FLAC, and WAV.
        """
        if not os.path.exists(filepath):
            return

        ext = os.path.splitext(filepath)[1].lower()
        
        # Download cover art if available
        cover_data = None
        cover_url = metadata.get('cover_url')
        if not cover_url:
            try:
                from .history_service import HistoryService
                art = (metadata.get('artist') or '').strip()
                tit = (metadata.get('title') or '').strip()
                q = f"{art} {tit}".strip()
                if q:
                    cover_url = HistoryService._fetch_itunes_cover(q, expected_artist=art, expected_title=tit)
                    if cover_url:
                        metadata['cover_url'] = cover_url
            except Exception:
                pass

        if cover_url:
            try:
                headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'}
                res = requests.get(cover_url, headers=headers, timeout=10)
                if res.status_code == 200:
                    cover_data = res.content
            except Exception as e:
                print(f'Failed to download cover image: {e}')

        if ext == '.mp3':
            TaggerService._tag_mp3(filepath, metadata, cover_data)
        elif ext in ('.m4a', '.mp4', '.aac'):
            TaggerService._tag_m4a(filepath, metadata, cover_data)
        elif ext == '.flac':
            TaggerService._tag_flac(filepath, metadata, cover_data)
        elif ext == '.wav':
            TaggerService._tag_wav(filepath, metadata, cover_data)

    @staticmethod
    def _tag_mp3(filepath: str, metadata: Dict, cover_data: Optional[bytes]):
        from mutagen.mp3 import MP3
        from mutagen.id3 import ID3, TIT2, TPE1, TALB, TDRC, TRCK, TBPM, TKEY, TCON, USLT, COMM, APIC, error

        audio = MP3(filepath, ID3=ID3)
        try:
            audio.add_tags()
        except error:
            pass

        title = metadata.get('title', '')
        artist = metadata.get('artist', '')
        album = metadata.get('album', '')
        year = str(metadata.get('year', ''))
        track_num = str(metadata.get('track_number', 1))
        bpm = str(int(round(float(metadata['bpm'])))) if metadata.get('bpm') else ''
        key = metadata.get('camelot') or metadata.get('key_name', '')
        genre = metadata.get('genre', '')
        energy = str(metadata.get('energy', ''))
        lyrics = metadata.get('lyrics', '') or metadata.get('plain_lyrics', '')

        if title:
            audio.tags.add(TIT2(encoding=3, text=title))
        if artist:
            audio.tags.add(TPE1(encoding=3, text=artist))
        if album:
            audio.tags.add(TALB(encoding=3, text=album))
        if year:
            audio.tags.add(TDRC(encoding=3, text=year))
        if track_num:
            audio.tags.add(TRCK(encoding=3, text=track_num))
        if bpm:
            audio.tags.add(TBPM(encoding=3, text=bpm))
        if key:
            audio.tags.add(TKEY(encoding=3, text=key))
        if genre:
            audio.tags.add(TCON(encoding=3, text=genre))
        if energy:
            audio.tags.add(COMM(encoding=3, lang='eng', desc='EnergyLevel', text=f'Energy:{energy}/10'))
        if lyrics:
            audio.tags.add(USLT(encoding=3, lang='eng', desc='Lyrics', text=lyrics))

        if cover_data:
            audio.tags.add(APIC(
                encoding=3,
                mime='image/jpeg',
                type=3,  # Front cover
                desc='Cover',
                data=cover_data
            ))

        audio.save(v2_version=3)

    @staticmethod
    def _tag_m4a(filepath: str, metadata: Dict, cover_data: Optional[bytes]):
        from mutagen.mp4 import MP4, MP4Cover, MP4FreeForm

        audio = MP4(filepath)
        title = metadata.get('title', '')
        artist = metadata.get('artist', '')
        album = metadata.get('album', '')
        year = str(metadata.get('year', ''))
        track_num = metadata.get('track_number', 1)
        bpm = int(round(float(metadata['bpm']))) if metadata.get('bpm') else None
        key = metadata.get('camelot') or metadata.get('key_name', '')
        genre = metadata.get('genre', '')

        if title:
            audio['\xa9nam'] = title
        if artist:
            audio['\xa9ART'] = artist
        if album:
            audio['\xa9alb'] = album
        if year:
            audio['\xa9day'] = year
        if genre:
            audio['\xa9gen'] = genre
        if bpm:
            audio['tmpo'] = [bpm]
        if key:
            audio['----:com.apple.iTunes:initialkey'] = MP4FreeForm(key.encode('utf-8'))
        if track_num:
            try:
                audio['trkn'] = [(int(track_num), 0)]
            except Exception:
                pass

        if cover_data:
            audio['covr'] = [MP4Cover(cover_data, imageformat=MP4Cover.FORMAT_JPEG)]

        audio.save()

    @staticmethod
    def _tag_flac(filepath: str, metadata: Dict, cover_data: Optional[bytes]):
        from mutagen.flac import FLAC, Picture

        audio = FLAC(filepath)
        title = metadata.get('title', '')
        artist = metadata.get('artist', '')
        album = metadata.get('album', '')
        year = str(metadata.get('year', ''))
        track_num = str(metadata.get('track_number', 1))
        bpm = str(int(round(float(metadata['bpm'])))) if metadata.get('bpm') else ''
        key = metadata.get('camelot') or metadata.get('key_name', '')
        genre = metadata.get('genre', '')

        if title:
            audio['title'] = title
        if artist:
            audio['artist'] = artist
        if album:
            audio['album'] = album
        if year:
            audio['date'] = year
        if track_num:
            audio['tracknumber'] = track_num
        if bpm:
            audio['bpm'] = bpm
        if key:
            audio['initialkey'] = key
        if genre:
            audio['genre'] = genre

        if cover_data:
            picture = Picture()
            picture.type = 3
            picture.mime = 'image/jpeg'
            picture.desc = 'Cover'
            picture.data = cover_data
            audio.clear_pictures()
            audio.add_picture(picture)

        audio.save()

    @staticmethod
    def _tag_wav(filepath: str, metadata: Dict, cover_data: Optional[bytes]):
        try:
            from mutagen.wave import WAVE
            from mutagen.id3 import TIT2, TPE1, TALB, TDRC, TRCK, TBPM, TKEY, TCON, APIC
            audio = WAVE(filepath)
            if audio.tags is None:
                audio.add_tags()

            title = metadata.get('title', '')
            artist = metadata.get('artist', '')
            album = metadata.get('album', '')
            year = str(metadata.get('year', ''))
            track_num = str(metadata.get('track_number', 1))
            bpm = str(int(round(float(metadata['bpm'])))) if metadata.get('bpm') else ''
            key = metadata.get('camelot') or metadata.get('key_name', '')
            genre = metadata.get('genre', '')

            if title:
                audio.tags.add(TIT2(encoding=3, text=title))
            if artist:
                audio.tags.add(TPE1(encoding=3, text=artist))
            if album:
                audio.tags.add(TALB(encoding=3, text=album))
            if year:
                audio.tags.add(TDRC(encoding=3, text=year))
            if track_num:
                audio.tags.add(TRCK(encoding=3, text=track_num))
            if bpm:
                audio.tags.add(TBPM(encoding=3, text=bpm))
            if key:
                audio.tags.add(TKEY(encoding=3, text=key))
            if genre:
                audio.tags.add(TCON(encoding=3, text=genre))

            if cover_data:
                audio.tags.add(APIC(
                    encoding=3,
                    mime='image/jpeg',
                    type=3,
                    desc='Cover',
                    data=cover_data
                ))
            audio.save()
        except Exception as e:
            print(f'WAV tagging skipped: {e}')
