import os
import re
import time
import yt_dlp
from typing import Dict, Callable, Optional, List
from .tagger_service import TaggerService

class DownloaderService:
    @staticmethod
    def sanitize_filename(name: str) -> str:
        """Sanitize filename to avoid invalid characters and illegal trailing dots on Windows."""
        cleaned = re.sub(r'[\\/*?:"<>|]', '_', str(name or ''))
        cleaned = re.sub(r'\s+', ' ', cleaned).strip()
        # Windows NTFS cannot have filenames ending in dots or spaces
        cleaned = cleaned.rstrip('. ')
        return cleaned or 'audio_track'

    @classmethod
    def generate_search_candidates(cls, track_info: Dict) -> List[str]:
        """
        Generate intelligent studio-grade search queries prioritizing Official Audio,
        Topic studio releases, and filtering out Music Video (MV) audio with skits/effects.
        """
        title = (track_info.get('title') or '').strip().rstrip('. ')
        artist = (track_info.get('artist') or '').strip().rstrip('. ')
        search_q = (track_info.get('search_query') or '').strip().rstrip('. ')

        # Clean 'Unknown Artist' or placeholder artist
        if artist.lower() in ('unknown artist', 'unknown', 'various artists', 'various', 'none', ''):
            artist = ''

        # Determine primary combined string
        if artist and title.lower().startswith(artist.lower()):
            base_query = title
        elif artist and title:
            base_query = f"{artist} - {title}"
        else:
            base_query = title

        candidates = []

        # 1. Clean artist and title without remix bracket junk for core search
        clean_core = re.sub(
            r'\s*\([^)]*(?:edit|bootleg|flip|vip|dub|clean|dirty|intro|outro|short|quick|extended|club|kastraget|dj\s*city|bpm\s*supreme)[^)]*\)',
            '',
            base_query,
            flags=re.I
        )
        clean_core = re.sub(r'\s*\[[^\]]*\]', '', clean_core)
        clean_core = ' '.join(clean_core.split()).strip().rstrip('. ')

        # Priority 1: Official Topic / Audio / Lyrics (Clean Studio Masters)
        if artist and title:
            candidates.append(f"{artist} {title} Topic")
            candidates.append(f"{artist} - {title} Official Audio")
            candidates.append(f"{artist} - {title} Audio")
            candidates.append(f"{artist} - {title} Lyrics")
            candidates.append(f"{artist} - {title} Lyric Video")
            candidates.append(f"{artist} - {title}")

            # Priority 1.5: If collaborating artists (e.g. "2Ectasy, jeffy, Kakagoesbackhome"), also add primary artist queries
            if (',' in artist or ' feat' in artist.lower() or ' ft.' in artist.lower() or ' x ' in artist.lower() or ' & ' in artist.lower()):
                primary_artist = re.split(r'[,&]|\bfeat\.?|\bft\.?|\bx\b', artist, flags=re.I)[0].strip()
                if primary_artist and len(primary_artist) > 1 and primary_artist.lower() != artist.lower():
                    candidates.append(f"{primary_artist} {title} Topic")
                    candidates.append(f"{primary_artist} - {title} Official Audio")
                    candidates.append(f"{primary_artist} - {title} Lyrics")
                    candidates.append(f"{primary_artist} - {title}")
        elif clean_core:
            candidates.append(f"{clean_core} Topic")
            candidates.append(f"{clean_core} Official Audio")
            candidates.append(f"{clean_core} Lyrics")
            candidates.append(clean_core)

        # Priority 2: Custom search query if provided
        if search_q:
            clean_sq = re.sub(r'^(?:unknown artist|unknown)\s*[-–—:]\s*', '', search_q, flags=re.I).strip().rstrip('. ')
            if clean_sq:
                candidates.append(f"{clean_sq} Topic")
                candidates.append(f"{clean_sq} Official Audio")
                candidates.append(clean_sq)

        # Priority 3: Clean core query
        if clean_core:
            candidates.append(clean_core)

        # Priority 4: Base combined query
        if base_query:
            candidates.append(base_query)

        # Priority 5: Simplified alphanumeric fallback
        simplified = re.sub(r'[\(\)\[\]\{\}\"\'\:\*\?\<\>\|\/\\_~`]', ' ', base_query)
        simplified = ' '.join(simplified.split()).strip().rstrip('. ')
        if simplified:
            candidates.append(simplified)

        # Deduplicate while preserving priority order
        seen = set()
        result = []
        for c in candidates:
            c_clean = ' '.join(c.split()).strip().rstrip('. ')
            if c_clean and c_clean.lower() not in seen:
                seen.add(c_clean.lower())
                result.append(c_clean)

        return result or [title or 'audio']

    @classmethod
    def score_studio_entry(cls, entry: Dict, artist: str = '', title: str = '', target_duration_sec: float = 0) -> int:
        """
        Ranks candidate YouTube videos ensuring strict title/artist relevance,
        prioritizing pure Studio Master / Topic audio and eliminating MV skits / sound effects.
        """
        if not entry:
            return -999

        score = 0
        t = (entry.get('title') or '').lower()
        uploader = (entry.get('uploader') or '').lower()
        desc = (entry.get('description') or '').lower()
        duration = entry.get('duration') or 0

        clean_title = re.sub(r'[^\w\s]', '', (title or '').lower()).strip()
        clean_artist = re.sub(r'[^\w\s]', '', (artist or '').lower()).strip()

        # 0. Strict Relevance Check: YouTube title or description MUST match the requested song!
        if clean_title:
            title_words = [w for w in clean_title.split() if len(w) > 1]
            if title_words:
                matched_words = sum(1 for w in title_words if w in t or w in desc)
                ratio = matched_words / len(title_words)
                if ratio >= 0.7:
                    score += 160
                elif ratio >= 0.4:
                    score += 60
                else:
                    # Title doesn't match -> heavily penalize so we never download a wrong song!
                    score -= 500
            elif clean_title in t:
                score += 160
            else:
                score -= 400

        if clean_artist:
            artist_words = [w for w in clean_artist.split() if len(w) > 1]
            if artist_words:
                matched_art = sum(1 for w in artist_words if w in t or w in uploader or w in desc)
                if (matched_art / len(artist_words)) >= 0.5:
                    score += 100
                elif clean_artist in uploader or clean_artist in t:
                    score += 80

        # Check if user explicitly asked for live / acoustic / concert / tribute / remix
        combined_meta = f"{title} {artist}".lower()
        user_wants_live = bool(re.search(r'\b(live|concert|tour|stage)\b', combined_meta, re.I))
        user_wants_acoustic = bool(re.search(r'\b(acoustic|unplugged)\b', combined_meta, re.I))
        user_wants_tribute = bool(re.search(r'\b(tribute|memorial)\b', combined_meta, re.I))
        user_wants_cover = bool(re.search(r'\b(cover|karaoke)\b', combined_meta, re.I))

        # Strict Live / Concert / Festival Penalty (-1500) unless explicitly requested
        is_live = False
        if not user_wants_live:
            if re.search(r'\b(live|concert|tomorrowland|edc|ultra\s*music\s*festival|umf|coachella|stage|world\s*tour|tour\s*live|live\s*session|live\s*stream|live\s*performance|live\s*recording|live\s*at|live\s*in|live\s*from|live\s*vocals|on\s*stage|show\s*dc|festival\s*live|live\s*in\s*a\s*day)\b', t, re.I):
                is_live = True
            elif re.search(r'\b(live|concert|show\s*dc|tour\s*live|it[’\']s\s*gonna\s*be|recorded\s*live)\b', desc, re.I):
                is_live = True

        # Strict Tribute / Memorial Penalty (-1500) unless explicitly requested
        is_tribute = False
        if not user_wants_tribute:
            if re.search(r'\b(tribute|memorial|in\s*memory\s*of)\b', f"{t} {uploader}", re.I):
                is_tribute = True

        # Strict Cover / Karaoke / Parody / Gimmick Penalty (-1500) unless explicitly requested
        is_cover_or_karaoke = False
        if not user_wants_cover:
            if re.search(r'\b(cover|covers|karaoke|instrumental\s*cover|remake|parody|backing\s*track|minus\s*one|guitar\s*cover|piano\s*cover|drum\s*cover|bass\s*cover|vocal\s*cover)\b', f"{t} {uploader}", re.I):
                is_cover_or_karaoke = True
            elif re.search(r'\b(slowed|reverb|sped\s*up|speed\s*up|nightcore|daycore|8d\s*audio|3d\s*audio|bass\s*boosted|bassboosted|pitch\s*shifted|chipmunk|1\s*hour|10\s*hours|loop|extended\s*loop|reaction|review|tutorial|behind\s*the\s*scenes|making\s*of)\b', t, re.I):
                is_cover_or_karaoke = True

        if is_live:
            score -= 1500
        if is_tribute:
            score -= 1500
        if is_cover_or_karaoke:
            score -= 1500

        # 1. Studio Topic Channel (+250) - Only for genuine studio album tracks (NEVER for live concert / tribute albums)
        if ('topic' in uploader or 'provided to youtube by' in desc or 'auto-generated by youtube' in desc) and score > 0 and not is_live and not is_tribute and not is_cover_or_karaoke:
            score += 250

        # 1.5 Official Record Label Bonus (+220) - Recognized major & indie labels globally & regionally
        official_labels = [
            'genelab', 'gmm grammy', 'gmm music', 'whattheduck', 'spicydisc', 'smallroom',
            'high cloud entertainment', 'muzik move', 'boxx music', 'loveis', 'ch7hd',
            'one31', 'me records', 'kicks records', 'yup!', 'warnermusic', 'universalmusic',
            'sonymusic', 'spinnin', 'armada', 'ultra records', 'def jam', 'monstercat',
            'owsla', 'anjunabeats', 'barong family', 'revealed recordings', 'atlantic records',
            'columbia records', 'republic records', 'interscope', 'rca records', 'epic records',
            'capitol records', 'island records', 'virgin records', 'astralwerks', 'musical freedom',
            'stmpd', 'future house music', 'selected.', 'lit entertainment', 'xoxo entertainment',
            'bighit', 'hybe', 'jyp', 'sm entertainment', 'yg entertainment', 'starship', 'cube', 'avex'
        ]
        is_official_label = any(lbl in uploader for lbl in official_labels)
        if is_official_label and score > 0 and not is_live and not is_tribute and not is_cover_or_karaoke:
            score += 220

        # 2. Official Studio Audio / Lyric Track (+200)
        if 'official audio' in t or 'studio audio' in t or 'album version' in t:
            score += 200
        elif 'audio' in t and ('official' in t or 'lyrics' in t or 'visualizer' in t):
            score += 130
        elif 'lyric video' in t or 'lyrics' in t:
            score += 90

        # 3. Exact Duration Matching with Master (+220 / -1500 for massive disparity)
        if target_duration_sec > 0 and duration > 0:
            delta = abs(duration - target_duration_sec)
            if delta <= 2.5:
                score += 220  # Exact studio master length match!
            elif delta <= 5.0:
                score += 120
            elif delta <= 8.0:
                score += 50
            elif delta > 15.0:
                score -= 250
            elif delta > 35.0:
                score -= 600
            elif delta > 60.0:
                score -= 1500  # Extreme disparity: likely full album, 1-hour loop or documentary cut

        # 4. Music Video Adjustment:
        # If from official record label, MV is often the primary master (e.g. GeneLab, GMM)
        if any(mv_word in t for mv_word in [
            'official music video', 'official video', 'mv', '[mv]', '(mv)', 'm/v',
            'music video', 'short film', 'drama ver', 'acting'
        ]):
            if is_official_label:
                score -= 30  # Very mild penalty: official label MVs are master tracks
            else:
                score -= 150

        # 5. General reasonable duration preference (1.5 - 7 mins)
        if 90 <= duration <= 480:
            score += 20

        return score

    @classmethod
    def get_ffmpeg_path(cls) -> Optional[str]:
        import shutil
        import sys

        # 1. System PATH
        found = shutil.which('ffmpeg')
        if found and os.path.exists(found):
            return found

        # 2. Check imageio_ffmpeg Python package
        try:
            import imageio_ffmpeg
            p = imageio_ffmpeg.get_ffmpeg_exe()
            if p and os.path.exists(p):
                return p
        except Exception:
            pass

        # 3. Common macOS Homebrew / MacPorts locations
        mac_paths = [
            '/opt/homebrew/bin/ffmpeg',
            '/usr/local/bin/ffmpeg',
            '/opt/local/bin/ffmpeg',
            '/usr/bin/ffmpeg',
            os.path.expanduser('~/bin/ffmpeg'),
            os.path.expanduser('~/.local/bin/ffmpeg')
        ]
        for p in mac_paths:
            if os.path.exists(p) and os.access(p, os.X_OK):
                return p

        # 4. Common Windows locations
        project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
        win_paths = [
            os.path.join(project_root, 'ffmpeg.exe'),
            os.path.join(project_root, 'bin', 'ffmpeg.exe'),
            os.path.join(os.path.expanduser('~'), 'ffmpeg', 'bin', 'ffmpeg.exe'),
            r'C:\ffmpeg\bin\ffmpeg.exe',
            r'C:\ProgramData\chocolatey\bin\ffmpeg.exe'
        ]
        for p in win_paths:
            if os.path.exists(p):
                return p

        return None

    @classmethod
    def download_track(
        cls,
        track_info: Dict,
        output_dir: str,
        audio_format: str = 'mp3',
        audio_quality: str = '320',
        progress_callback: Optional[Callable[[float, str], None]] = None
    ) -> str:
        """
        Search, download and convert track to specified audio format with multi-query fallback.
        Calls progress_callback(percentage, status_text).
        Returns the final downloaded file path.
        """
        os.makedirs(output_dir, exist_ok=True)
        start_time = time.time() - 2.0

        title = track_info.get('title', 'Unknown')
        artist = track_info.get('artist', '')
        if artist.lower() in ('unknown artist', 'unknown', 'none'):
            artist = ''

        playlist_name = track_info.get('playlist_name', '').strip()
        folder_mode = track_info.get('folder_mode', 'playlist')

        # Smart Folder Organization:
        # If the track belongs to a playlist/album folder, ALWAYS route it into downloads/<playlist_name>/
        save_dir = output_dir
        if playlist_name and playlist_name.lower() not in ('library', 'downloads', '', 'singles', 'all'):
            clean_playlist = cls.sanitize_filename(playlist_name)
            save_dir = os.path.join(output_dir, clean_playlist)
        elif folder_mode == 'artist_album' and artist:
            clean_artist = cls.sanitize_filename(artist)
            save_dir = os.path.join(output_dir, clean_artist)
        elif folder_mode == 'camelot_key' and track_info.get('camelot'):
            save_dir = os.path.join(output_dir, cls.sanitize_filename(track_info['camelot']))
        else:
            save_dir = output_dir

        os.makedirs(save_dir, exist_ok=True)
        track_num = track_info.get('track_number') or track_info.get('index')
        num_prefix = ""
        if track_info.get('prefix_track_number', False) and track_num:
            try:
                num_val = int(track_num)
                num_prefix = f"{num_val:02d}. "
            except Exception:
                num_prefix = f"{track_num}. "

        raw_title = title
        # Strip duplicate leading numbers from title if already present
        raw_title = re.sub(r'^\d+\s*[\.\-]\s*', '', raw_title).strip()
        
        if artist and not raw_title.lower().startswith(artist.lower()):
            base_name = f"{num_prefix}{artist} - {raw_title}"
        else:
            base_name = f"{num_prefix}{raw_title}"

        clean_base = cls.sanitize_filename(base_name)
        target_file = os.path.join(save_dir, f'{clean_base}.{audio_format}')

        # 0. Smart Duplicate Check: Reuse already existing local file if available (unless force_redownload is True)
        force_redownload = track_info.get('force_redownload', False)
        existing_local_file = None
        if not force_redownload:
            if os.path.exists(target_file) and os.path.getsize(target_file) > 100000:
                existing_local_file = target_file
            else:
                for ext in ['.mp3', '.m4a', '.flac', '.wav']:
                    cand = os.path.join(save_dir, f'{clean_base}{ext}')
                    if os.path.exists(cand) and os.path.getsize(cand) > 100000:
                        existing_local_file = cand
                        break

            if not existing_local_file:
                from .history_service import HistoryService
                matched = HistoryService.find_existing_track(title, artist)
                if matched and matched.get('filepath') and os.path.exists(matched.get('filepath')):
                    src_p = matched.get('filepath')
                    if os.path.getsize(src_p) > 100000:
                        import shutil
                        try:
                            ext = os.path.splitext(src_p)[1]
                            dest_p = os.path.join(save_dir, f'{clean_base}{ext}')
                            if os.path.abspath(src_p) != os.path.abspath(dest_p):
                                shutil.copy2(src_p, dest_p)
                            existing_local_file = dest_p
                        except Exception:
                            existing_local_file = src_p

        actual_file = existing_local_file

        if actual_file and os.path.exists(actual_file):
            if progress_callback:
                progress_callback(90.0, 'Track already exists, reusing local file...')
        else:
            if progress_callback:
                progress_callback(5.0, 'Searching audio stream...')

            def yt_hook(d):
                if d['status'] == 'downloading':
                    total = d.get('total_bytes') or d.get('total_bytes_estimate') or 1
                    downloaded = d.get('downloaded_bytes', 0)
                    pct = min(90.0, (downloaded / total) * 85.0 + 5.0)
                    speed = d.get('_speed_str', '')
                    if progress_callback:
                        progress_callback(pct, f'Downloading {pct:.1f}% {speed}')
                elif d['status'] == 'finished':
                    if progress_callback:
                        progress_callback(92.0, 'Converting audio format...')

            out_template = os.path.join(save_dir, f'{clean_base}.%(ext)s')

            codec_map = {
                'mp3': 'mp3',
                'm4a': 'm4a',
                'flac': 'flac',
                'wav': 'wav'
            }
            codec = codec_map.get(audio_format.lower(), 'mp3')

            postprocessor = {
                'key': 'FFmpegExtractAudio',
                'preferredcodec': codec,
            }
            if codec == 'mp3':
                postprocessor['preferredquality'] = audio_quality or '320'

            class QuietLogger:
                def debug(self, msg): pass
                def info(self, msg): pass
                def warning(self, msg): pass
                def error(self, msg): pass

            ydl_opts = {
                'format': 'bestaudio[ext=webm]/bestaudio[ext=m4a]/bestaudio/best',
                'outtmpl': out_template,
                'logger': QuietLogger(),
                'postprocessors': [postprocessor],
                'postprocessor_args': {
                    'FFmpegExtractAudio': ['-q:a', '0', '-ar', '44100']
                },
                'progress_hooks': [yt_hook],
                'quiet': True,
                'no_warnings': True,
                'default_search': 'ytsearch1:',
                'noplaylist': True,
                'socket_timeout': 25,
                'retries': 4,
                'fragment_retries': 4,
                'extractor_args': {
                    'youtube': {
                        'player_client': ['android', 'web', 'tv'],
                    }
                },
                'http_headers': {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                    'Accept-Language': 'en-US,en;q=0.9',
                },
                'nocheckcertificate': True,
            }

            ffmpeg_exe = cls.get_ffmpeg_path()
            if ffmpeg_exe:
                ydl_opts['ffmpeg_location'] = ffmpeg_exe
                ffmpeg_dir = os.path.dirname(ffmpeg_exe)
                if ffmpeg_dir and ffmpeg_dir not in os.environ.get('PATH', ''):
                    os.environ['PATH'] = f"{ffmpeg_dir}{os.pathsep}{os.environ.get('PATH', '')}"

            # 1. Direct Stream Download (e.g. YouTube video / playlist / soundcloud)
            direct_url = track_info.get('direct_url') or track_info.get('url')
            if not direct_url:
                t_id = str(track_info.get('id') or '')
                if t_id.startswith('yt_'):
                    raw_vid = t_id.replace('yt_', '')
                    if len(raw_vid) == 11 and not raw_vid.startswith(('ch_', 'desc_', 'comm_', 'music_', 'p_')):
                        direct_url = f"https://www.youtube.com/watch?v={raw_vid}"

            download_success = False
            last_error = None

            if direct_url:
                try:
                    if progress_callback:
                        progress_callback(10.0, 'Downloading audio directly from YouTube...')
                    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                        info = ydl.extract_info(direct_url, download=True)
                        if info:
                            download_success = True
                except Exception as direct_err:
                    print(f"[DownloaderService] Direct stream download fallback: {direct_err}")
                    last_error = direct_err

            # 2. Multi-Level Global Query Search Pool with Strict Studio Master Ranking
            if not download_success:
                search_candidates = cls.generate_search_candidates(track_info)
                target_dur_sec = 0.0
                if track_info.get('duration_ms'):
                    try: target_dur_sec = float(track_info['duration_ms']) / 1000.0
                    except Exception: pass
                elif track_info.get('duration'):
                    try: target_dur_sec = float(track_info['duration'])
                    except Exception: pass

                all_collected_entries = []
                seen_vids = set()

                flat_opts = {
                    'quiet': True,
                    'no_warnings': True,
                    'extract_flat': True,
                }

                if progress_callback:
                    progress_callback(10.0, 'Searching for DJ Studio Master (filtering out MVs)...')

                # Step A: Collect candidates across top search queries
                with yt_dlp.YoutubeDL(flat_opts) as ydl_flat:
                    for query_idx, query_str in enumerate(search_candidates[:5]):
                        try:
                            search_res = ydl_flat.extract_info(f'ytsearch5:{query_str}', download=False)
                            if search_res:
                                for entry in search_res.get('entries', []):
                                    vid = entry.get('id')
                                    if vid and vid not in seen_vids:
                                        seen_vids.add(vid)
                                        entry['studio_score'] = cls.score_studio_entry(
                                            entry,
                                            artist=artist,
                                            title=title,
                                            target_duration_sec=target_dur_sec
                                        )
                                        all_collected_entries.append(entry)
                        except Exception as q_err:
                            print(f"[DownloaderService] Search notice for '{query_str}': {q_err}")

                # Step B: Sort all entries globally by studio score (Clean Audio / Topic / Exact duration > 0 first)
                all_collected_entries.sort(key=lambda e: e.get('studio_score', -999), reverse=True)

                # Step C: Try downloading top entries in ranked order
                for entry_idx, best_entry in enumerate(all_collected_entries):
                    if not best_entry.get('id'):
                        continue
                    vid_url = f"https://www.youtube.com/watch?v={best_entry['id']}"
                    try:
                        if progress_callback:
                            progress_callback(15.0, f'Downloading Clean Studio Stream [{best_entry.get("duration", 0)}s | Score: {best_entry.get("studio_score", 0)}]...')
                        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                            info = ydl.extract_info(vid_url, download=True)
                            if info:
                                download_success = True
                                break
                    except Exception as dl_err:
                        print(f"[DownloaderService] Candidate download fallback: {dl_err}")
                        last_error = dl_err
                        continue

                # Final fallback if flat search returned nothing
                if not download_success:
                    fallback_q = search_candidates[0] if search_candidates else f"{artist} {title}"
                    try:
                        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                            info = ydl.extract_info(f'ytsearch1:{fallback_q}', download=True)
                            if info:
                                download_success = True
                    except Exception as fb_err:
                        last_error = fb_err

            # Locate actual converted file
            actual_file = target_file
            candidate_exts = ['.mp3', '.m4a', '.flac', '.wav', '.mp4', '.webm', '.opus', '.mkv']
            if not os.path.exists(actual_file):
                for ext in candidate_exts:
                    candidate = os.path.join(save_dir, f'{clean_base}{ext}')
                    if os.path.exists(candidate):
                        actual_file = candidate
                        break

            if not os.path.exists(actual_file):
                for ext in candidate_exts:
                    candidate = os.path.join(output_dir, f'{clean_base}{ext}')
                    if os.path.exists(candidate):
                        actual_file = candidate
                        break

            # If not found directly by name, check newly created audio files in save_dir or output_dir
            if not os.path.exists(actual_file):
                try:
                    for search_fld in [save_dir, output_dir]:
                        if os.path.exists(search_fld):
                            for f in os.listdir(search_fld):
                                if f.lower().endswith(('.mp3', '.m4a', '.flac', '.wav', '.mp4', '.webm', '.opus', '.mkv')):
                                    full_p = os.path.join(search_fld, f)
                                    if os.path.getmtime(full_p) >= start_time:
                                        actual_file = full_p
                                        break
                        if actual_file and os.path.exists(actual_file):
                            break
                except Exception:
                    pass

        if not actual_file or not os.path.exists(actual_file):
            raise Exception(f'Could not download audio stream. (Last error: {last_error})')

        # Transcode MP4 / WebM / Opus to MP3 / requested codec if needed
        desired_ext = f".{codec}"
        curr_ext = os.path.splitext(actual_file)[1].lower()
        if curr_ext in ('.mp4', '.webm', '.opus', '.mkv') or (curr_ext != desired_ext and audio_format.lower() == 'mp3'):
            ffmpeg_exe = cls.get_ffmpeg_path()
            if ffmpeg_exe:
                converted_target = os.path.splitext(actual_file)[0] + desired_ext
                if converted_target != actual_file:
                    import subprocess
                    try:
                        cmd = [
                            ffmpeg_exe, '-y',
                            '-i', actual_file,
                            '-vn',
                            '-c:a', 'libmp3lame',
                            '-b:a', f"{audio_quality or '320'}k",
                            '-q:a', '0',
                            '-ar', '44100',
                            converted_target
                        ]
                        subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
                        if os.path.exists(converted_target) and os.path.getsize(converted_target) > 1000:
                            try:
                                os.remove(actual_file)
                            except Exception:
                                pass
                            actual_file = converted_target
                    except Exception as conv_err:
                        print(f"[DownloaderService] Transcode fallback error: {conv_err}")

        try:
            if progress_callback:
                progress_callback(94.0, 'Fetching Lyrics & Stems...')

            # Ensure track has individual cover art if missing
            if not track_info.get('cover_url') and track_info.get('id'):
                from .spotify_service import SpotifyService
                cover_url = SpotifyService().get_track_cover(track_info['id'])
                if cover_url:
                    track_info['cover_url'] = cover_url

            # 1. Stem Extraction if requested
            stem_type = track_info.get('stem_type', 'full')
            if stem_type in ('acapella', 'instrumental'):
                from .stem_service import StemService
                actual_file = StemService.extract_stem(actual_file, stem_type=stem_type, output_dir=output_dir)
            elif stem_type == 'dj_extended':
                from .dj_extended_service import DJExtendedService
                actual_file = DJExtendedService.create_extended_edit(actual_file, bpm=float(track_info.get('bpm', 128.0)))

            # 2. Lyrics fetch (Embedded directly into ID3 tags, no extra .lrc files)
            from .lyrics_service import LyricsService
            lyrics_data = LyricsService.fetch_lyrics(title, artist, track_info.get('album', ''))
            if lyrics_data:
                track_info['plain_lyrics'] = lyrics_data.get('plain', '')
                track_info['synced_lyrics'] = lyrics_data.get('synced', '')
                track_info['lyrics'] = lyrics_data.get('plain') or lyrics_data.get('synced', '')

            if progress_callback:
                progress_callback(97.0, 'Analyzing BPM, Camelot Key, Energy & Hot Cues...')

            # 3. Run DJ Analysis with metadata
            from .dj_analyzer_service import DJAnalyzerService
            dj_data = DJAnalyzerService.analyze_file(actual_file, track_info=track_info)
            track_info['bpm'] = dj_data.get('bpm', 120.0)
            track_info['camelot'] = dj_data.get('camelot', '8A')
            track_info['key_name'] = dj_data.get('key_name', 'A Min')
            track_info['genre'] = dj_data.get('genre', 'Dance / DJ')
            track_info['color'] = dj_data.get('color', '#fb923c')
            track_info['energy'] = dj_data.get('energy', 6)
            track_info['stars'] = dj_data.get('stars', 3)
            track_info['rating_255'] = dj_data.get('rating_255', 153)
            track_info['cues'] = dj_data.get('cues', [])

            # 4. Folder Organization if configured
            folder_mode = track_info.get('folder_mode', 'single')
            if folder_mode == 'artist_album' and artist:
                album_name = track_info.get('album') or 'Singles'
                dest_folder = os.path.join(output_dir, cls.sanitize_filename(artist), cls.sanitize_filename(album_name))
                os.makedirs(dest_folder, exist_ok=True)
                new_path = os.path.join(dest_folder, os.path.basename(actual_file))
                if actual_file != new_path:
                    import shutil
                    shutil.move(actual_file, new_path)
                    actual_file = new_path
            elif folder_mode == 'camelot_key' and track_info.get('camelot'):
                dest_folder = os.path.join(output_dir, track_info['camelot'])
                os.makedirs(dest_folder, exist_ok=True)
                new_path = os.path.join(dest_folder, os.path.basename(actual_file))
                if actual_file != new_path:
                    import shutil
                    shutil.move(actual_file, new_path)
                    actual_file = new_path

            track_info['filepath'] = actual_file

            # 4.5 Auto-Gain Volume Normalization (EBU R128 -14.0 LUFS standard)
            if track_info.get('normalize_audio', True):
                if progress_callback:
                    progress_callback(98.0, 'Balancing audio loudness (-14 LUFS Auto-Gain)...')
                try:
                    from .audio_normalizer_service import AudioNormalizerService
                    target_lufs = float(track_info.get('target_lufs', -14.0))
                    actual_file = AudioNormalizerService.normalize_audio_file(
                        actual_file,
                        target_lufs=target_lufs,
                        audio_quality=audio_quality
                    )
                    track_info['filepath'] = actual_file
                except Exception as norm_err:
                    print(f"[DownloaderService] Audio normalization warning: {norm_err}")

            if progress_callback:
                progress_callback(99.0, 'Embedding DJ Tags & Rekordbox data...')

            TaggerService.apply_tags(actual_file, track_info)

            # 5. Save to local History Database & Activity Log
            try:
                from .history_service import HistoryService
                HistoryService.save_track(track_info)
            except Exception:
                pass

            try:
                from .activity_service import ActivityService
                ActivityService.log_activity(
                    category='download',
                    title=f"{artist} - {title}" if artist else title,
                    description=f"ดาวน์โหลดสำเร็จ • {audio_format.upper()} {audio_quality}kbps • {track_info.get('camelot', '')} {track_info.get('bpm', '')} BPM",
                    details={
                        'filepath': actual_file,
                        'artist': artist,
                        'title': title,
                        'camelot': track_info.get('camelot', ''),
                        'bpm': track_info.get('bpm', ''),
                        'format': audio_format
                    }
                )
            except Exception:
                pass

            # 6. Auto-generate / update Rekordbox XML and M3U8 inside playlist folder
            if playlist_name and save_dir != output_dir:
                try:
                    from .rekordbox_service import RekordboxService
                    from .history_service import HistoryService
                    all_library = HistoryService.get_all()
                    # Filter tracks in this playlist folder
                    folder_tracks = [t for t in all_library if t.get('filepath') and os.path.dirname(os.path.abspath(t['filepath'])) == os.path.abspath(save_dir)]
                    if not folder_tracks and track_info.get('filepath'):
                        folder_tracks = [track_info]
                    
                    xml_p = os.path.join(save_dir, 'rekordbox.xml')
                    m3u8_p = os.path.join(save_dir, f"{cls.sanitize_filename(playlist_name)}.m3u8")
                    txt_p = os.path.join(save_dir, f"{cls.sanitize_filename(playlist_name)}_tracklist.txt")
                    RekordboxService.export_rekordbox_xml(folder_tracks, xml_p, playlist_name=playlist_name)
                    RekordboxService.export_m3u8(folder_tracks, m3u8_p, playlist_name=playlist_name)
                    RekordboxService.export_tracklist_txt(folder_tracks, txt_p, playlist_name=playlist_name, format_mode='youtube')
                except Exception as ex:
                    print(f"[DownloaderService] Warning updating playlist rekordbox files: {ex}")

            if progress_callback:
                progress_callback(100.0, f"Done [{track_info['camelot']} | {track_info['bpm']} BPM | {track_info.get('stars', 3)}/5 stars]")
            return actual_file

        except Exception as e:
            if progress_callback:
                progress_callback(0.0, f'Error: {str(e)}')
            raise e
