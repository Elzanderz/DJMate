# -*- coding: utf-8 -*-
import os
import re
import json
import math
import requests
from typing import List, Dict, Optional

class AICuratorService:
    """
    Intelligent AI DJ Music Director & Venue Playlist Curator.
    Transforms natural language venue/mood prompts (e.g. Thai, English, vibe, tempo, crowd)
    into highly-curated DJ tracklists using Gemini / OpenAI API or Built-in Vibe Engine.
    """

    @classmethod
    def _detect_vibe_intent(cls, prompt: str) -> str:
        """Detect the core mood/vibe intent from the prompt."""
        p = (prompt or '').lower()
        # 1. 3Cha / Morlam / Street Party
        if any(w in p for w in ['3ช่า', 'สามช่า', 'โจ๊ะ', 'รีมิกซ์', 'สายตื๊ด', 'รถแห่', 'สงกรานต์']):
            return '3cha'
        # 2. Peak Club / EDM / Dance / Heavy Party
        if any(w in p for w in ['club', 'ผับ', 'ตื๊ด', 'เต้น', 'dance', 'edm', 'tech house', 'techno', '128', 'มันส์ๆ', 'เมาๆ', 'ปาร์ตี้มันส์', 'บีทหนัก', 'หนักๆ']):
            return 'club_peak'
        # 3. Explicit Chill / Relax / Acoustic / Slow / Coffee / Cafe / Indie
        if any(w in p for w in [
            'ชิล', 'ชิว', 'ชิลล์', 'chill', 'relax', 'สบาย', 'ฟังสบาย', 'ผ่อนคลาย', 'เบาๆ', 'นุ่มๆ', 'ละมุน',
            'คาเฟ่', 'cafe', 'กาแฟ', 'coffee', 'acoustic', 'อะคูสติก', 'lofi', 'lo-fi', 'neo soul', 'neo-soul',
            'bedroom pop', 'indie', 'อินดี้', 'นั่งชิล', 'ร้านเหล้านั่งชิล', 'จิบเบียร์', 'ริมหาด', 'sunset',
            'ก่อนนอน', 'เหงา', 'อกหัก', 'รักหวาน', 'อ่านหนังสือ', 'ทำงาน', 'easy listening', 'slow', 'เพราะๆ'
        ]):
            return 'chill'
        # 4. Beach / Tropical
        if any(w in p for w in ['beach', 'ทะเล', 'หาด', 'tropical', 'sunset']):
            return 'beach'
        # 5. Rooftop / Lounge
        if any(w in p for w in ['rooftop', 'หรู', 'cocktail', 'lounge', 'ค็อกเทล', 'deep house', 'วิว']):
            return 'rooftop'
        return 'general'

    @classmethod
    def generate_playlist(
        cls,
        prompt: str,
        count: int = 15,
        api_key: Optional[str] = None,
        provider: str = 'gemini',
        languages: Optional[List[str]] = None,
        mixtape_mode: str = 'peak_climb'
    ) -> Dict:
        prompt = (prompt or '').strip()
        count = max(5, min(count, 50))
        languages = languages or ['thai', 'english']
        vibe_intent = cls._detect_vibe_intent(prompt)

        # If user wants a chill/relaxing vibe, override aggressive peak climbing to smooth lounge
        if vibe_intent in ('chill', 'cafe') and mixtape_mode == 'peak_climb':
            mixtape_mode = 'sunset_lounge'

        raw_tracks = []
        setlist_title = "AI Curated DJ Set"
        vibe_summary = prompt

        # 1. Check API Key
        gemini_key = api_key if (api_key and provider == 'gemini') else os.environ.get('GEMINI_API_KEY', '')
        openai_key = api_key if (api_key and provider == 'openai') else os.environ.get('OPENAI_API_KEY', '')

        if gemini_key and provider == 'gemini':
            try:
                res = cls._call_gemini(prompt, count, gemini_key, languages=languages, mixtape_mode=mixtape_mode, vibe_intent=vibe_intent)
                if res and res.get('tracks'):
                    raw_tracks = res['tracks']
                    setlist_title = res.get('setlist_title', setlist_title)
                    vibe_summary = res.get('vibe_summary', vibe_summary)
            except Exception as ge:
                print(f"[AICuratorService] Gemini API warning: {ge}")

        elif openai_key and provider == 'openai':
            try:
                res = cls._call_openai(prompt, count, openai_key, languages=languages, mixtape_mode=mixtape_mode, vibe_intent=vibe_intent)
                if res and res.get('tracks'):
                    raw_tracks = res['tracks']
                    setlist_title = res.get('setlist_title', setlist_title)
                    vibe_summary = res.get('vibe_summary', vibe_summary)
            except Exception as oe:
                print(f"[AICuratorService] OpenAI API warning: {oe}")

        # 2. Smart Built-in Fallback Knowledgebase
        if not raw_tracks:
            res = cls._builtin_curator(prompt, count, languages=languages, vibe_intent=vibe_intent)
            raw_tracks = res.get('tracks', [])
            setlist_title = res.get('setlist_title', setlist_title)
            vibe_summary = res.get('vibe_summary', vibe_summary)

        # 3. Parallel Metadata Enrichment (Cover Art, Official Duration, Album, Year, DJ Tags)
        from concurrent.futures import ThreadPoolExecutor
        from .spotify_service import SpotifyService
        from .dj_analyzer_service import DJAnalyzerService, CAMELOT_COLORS

        def enrich_track(item):
            idx, t = item
            artist = t.get('artist', '').strip()
            title = t.get('title', '').strip()
            q = f"{artist} - {title}".strip(' -')
            match = SpotifyService.search_track(q) or {}
            
            # Determine or estimate realistic DJ metadata for Smart Mixtape flow
            fallback_genre = 'Indie / Acoustic Chill' if vibe_intent in ('chill', 'cafe') else 'Pop / Hits'
            genre = match.get('genre') or t.get('genre') or fallback_genre
            genre_lower = genre.lower()

            bpm = match.get('bpm') or t.get('bpm')
            if not bpm or float(bpm) <= 0:
                if vibe_intent in ('chill', 'cafe') or 'chill' in genre_lower or 'acoustic' in genre_lower or 'indie' in genre_lower or 'lo-fi' in genre_lower:
                    bpm = 78.0 + ((idx * 2) % 18)  # 78 - 95 BPM relaxed tempo
                elif 'tech house' in genre_lower or 'techno' in genre_lower or 'edm' in genre_lower:
                    bpm = 126.0 + ((idx * 2) % 6)
                elif 'house' in genre_lower or 'disco' in genre_lower:
                    bpm = 120.0 + ((idx * 2) % 6)
                elif '3cha' in genre_lower:
                    bpm = 135.0 + (idx % 5)
                elif 'hip-hop' in genre_lower or 'rap' in genre_lower:
                    bpm = 90.0 + (idx % 12)
                elif 'k-pop' in genre_lower or 't-pop' in genre_lower or 'pop' in genre_lower:
                    bpm = 100.0 + ((idx * 2) % 15)
                else:
                    bpm = 95.0 + (idx % 15)

            camelot = match.get('camelot') or t.get('camelot')
            if not camelot or camelot in ('--', ''):
                camelot_keys = ['8A', '9A', '10A', '11A', '12A', '1A', '2A', '3A', '4A', '5A', '6A', '7A',
                                '8B', '9B', '10B', '11B', '12B', '1B', '2B', '3B', '4B', '5B', '6B', '7B']
                camelot = camelot_keys[abs(hash(f"{artist}_{title}")) % len(camelot_keys)]

            color = CAMELOT_COLORS.get(camelot, '#8b5cf6')
            
            # Energy stars (1-5★) for Smart Mixtape progression
            stars = match.get('stars') or t.get('stars')
            if not stars:
                if vibe_intent in ('chill', 'cafe'):
                    stars = 1 + ((idx % 3))  # Keep chill energy at 1-3★, never explosive 5★
                else:
                    progress = (idx + 1) / max(len(raw_tracks), 1)
                    stars = max(1, min(5, int(math.ceil(progress * 5))))

            return {
                'id': match.get('id') or f"ai_{idx+1}_{abs(hash(q)) % 100000}",
                'title': match.get('title') or title or q,
                'artist': match.get('artist') or artist,
                'album': match.get('album') or setlist_title or 'AI Smart Mixtape',
                'playlist_name': setlist_title,
                'folder_mode': 'playlist',
                'source': 'AI Smart Mixtape',
                'duration_ms': int(match.get('duration_ms') or t.get('duration_s', 210) * 1000),
                'cover_url': match.get('cover_url') or '',
                'year': match.get('year') or '',
                'track_number': idx + 1,
                'search_query': q,
                'vibe_note': t.get('vibe_note', ''),
                'bpm': round(float(bpm), 1),
                'camelot': camelot,
                'color': color,
                'genre': genre,
                'stars': stars,
                'energy': stars * 2,
                'rating_255': stars * 51
            }

        with ThreadPoolExecutor(max_workers=12) as executor:
            enriched = list(executor.map(enrich_track, enumerate(raw_tracks)))

        # 4. Apply Smart Mixtape Harmonic & Energy Flow Algorithm
        target_mode = mixtape_mode or ('sunset_lounge' if vibe_intent in ('chill', 'cafe') else 'peak_climb')
        sorted_mixtape = DJAnalyzerService.build_smart_mixtape(
            enriched,
            mode=target_mode,
            randomize=False
        )

        # Re-index track numbers according to the Smart Mixtape sequence
        for num, tr in enumerate(sorted_mixtape):
            tr['track_number'] = num + 1

        from .history_service import HistoryService
        sorted_mixtape = HistoryService.mark_existing_tracks(sorted_mixtape)

        return {
            'setlist_title': setlist_title,
            'vibe_summary': vibe_summary,
            'mixtape_mode': target_mode,
            'total_tracks': len(sorted_mixtape),
            'tracks': sorted_mixtape
        }

    @classmethod
    def _call_gemini(cls, prompt: str, count: int, api_key: str, languages: Optional[List[str]] = None, mixtape_mode: str = 'peak_climb', vibe_intent: str = 'general') -> Dict:
        lang_map = {
            'thai': 'เพลงไทย (Thai Songs - T-Pop / Indie / Rock / Hip-Hop / 3Cha in Thai script)',
            'english': 'เพลงสากล / อังกฤษ (English / Global Hits / Pop / EDM / Hip-Hop)',
            'korean': 'เพลงเกาหลี (K-Pop / Korean - NewJeans, BLACKPINK, IVE, aespa, BTS, etc.)',
            'japanese': 'เพลงญี่ปุ่น (J-Pop / Japanese / City Pop / Anime - YOASOBI, Fujii Kaze, Ado, etc.)',
            'chinese': 'เพลงจีน (C-Pop / Mandopop - Jay Chou, Eric Chou, G.E.M., etc.)'
        }
        selected_langs = [lang_map.get(l, l) for l in (languages or ['thai', 'english'])]
        lang_instruction = f"MANDATORY LANGUAGE FILTER: You MUST select songs ONLY from these languages: {', '.join(selected_langs)}. If multiple languages are chosen, provide a balanced, alternating mix."

        chill_rule = ""
        if vibe_intent in ('chill', 'cafe') or any(w in prompt.lower() for w in ['ชิล', 'ชิว', 'chill', 'relax', 'สบาย', 'acoustic', 'lofi']):
            chill_rule = (
                "ABSOLUTE CHILL & MOOD PURITY ENFORCEMENT (CRITICAL):\n"
                "- The user explicitly requested a CHILL / RELAXING / EASY LISTENING vibe ('เพลงชิลๆ' / คาเฟ่ / ฟังสบาย).\n"
                "- STRICT PROHIBITION: You are STRICTLY FORBIDDEN from including Dance, EDM, Tech House, Club, High-Energy Pop, Heavy Rock, 3Cha, or Fast BPM tracks (>110 BPM).\n"
                "- Every song MUST be mellow, relaxing, acoustic, bedroom pop, indie chill, or smooth neo-soul/lo-fi (e.g. HYBS, Dept, Anatomy Rabbit, Scrubb, Whal & Dolph, Bowkylion, NONT TANONT, Fellow Fellow, Serious Bacon, PURPEECH, Landokmai, Laufey, Keshi, Bruno Major, Phum Viphurit, Honne).\n"
                "- DO NOT ramp energy into high-energy club anthems. Keep the entire playlist relaxing and coherent from start to finish.\n"
            )

        system_instruction = (
            "You are a World-Class Professional Music Director and DJ Playlist Curator. "
            f"{lang_instruction}\n"
            f"{chill_rule}"
            "DJ MIXTAPE PLAYABILITY & VIBE COHERENCE RULES (CRITICAL):\n"
            "1. STRICT VIBE & GENRE COHERENCE: All recommended songs MUST strictly belong to the same musical mood, groove, and acoustic texture. NEVER mix incompatible genres together!\n"
            "   - If vibe is 'Chill / Neo-Soul / Lo-Fi / Cafe / Afternoon / Acoustic / Indie', choose Thai Neo-Soul, Lo-Fi, Bedroom Pop, or Indie Acoustic. NEVER include EDM, Dance, Heavy Rock, or 3Cha.\n"
            "   - If vibe is 'Party / Club / Peak', choose cohesive Dance/EDM/House/T-Pop/Hip-Hop.\n"
            "2. Cohesive BPM & Groove: Select songs that share a compatible DJ tempo range without abrupt tempo clashes.\n"
            "3. Seamless Playable Sequence: Arrange the tracks sequentially from Track 1 to Track N so a DJ can play them consecutively in this exact order without mood whiplash.\n"
            f"4. Flow Progression ({mixtape_mode}): Align track transitions smoothly matching the target vibe.\n"
            "Respond ONLY with a valid JSON object matching this schema:\n"
            "{\n"
            '  "setlist_title": "Creative Playlist Title in Thai",\n'
            '  "vibe_summary": "1-2 sentence description in Thai explaining why these songs fit the crowd, venue, and languages",\n'
            '  "tracks": [\n'
            '    {"artist": "Artist Name", "title": "Song Title", "genre": "Genre", "vibe_note": "Short reason in Thai why this song fits"}\n'
            '  ]\n'
            "}"
        )

        user_content = f"Please curate exactly {count} distinct real songs for this request:\n{prompt}\nLanguages: {', '.join(languages or ['thai', 'english'])}\nMixtape Mode: {mixtape_mode}"
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={api_key}"
        body = {
            "contents": [{"parts": [{"text": system_instruction + "\n\n" + user_content}]}],
            "generationConfig": {"response_mime_type": "application/json", "temperature": 0.6}
        }
        r = requests.post(url, json=body, timeout=20)
        if r.status_code == 200:
            data = r.json()
            text = data.get('candidates', [{}])[0].get('content', {}).get('parts', [{}])[0].get('text', '')
            clean = re.sub(r'^```(?:json)?\s*', '', text.strip(), flags=re.I)
            clean = re.sub(r'\s*```$', '', clean)
            return json.loads(clean)
        else:
            raise Exception(f"Gemini HTTP {r.status_code}: {r.text[:150]}")

    @classmethod
    def _call_openai(cls, prompt: str, count: int, api_key: str, languages: Optional[List[str]] = None, mixtape_mode: str = 'peak_climb', vibe_intent: str = 'general') -> Dict:
        lang_map = {
            'thai': 'เพลงไทย (Thai Songs - T-Pop / Indie / Rock / Hip-Hop / 3Cha in Thai script)',
            'english': 'เพลงสากล / อังกฤษ (English / Global Hits / Pop / EDM / Hip-Hop)',
            'korean': 'เพลงเกาหลี (K-Pop / Korean - NewJeans, BLACKPINK, IVE, aespa, BTS, etc.)',
            'japanese': 'เพลงญี่ปุ่น (J-Pop / Japanese / City Pop / Anime - YOASOBI, Fujii Kaze, Ado, etc.)',
            'chinese': 'เพลงจีน (C-Pop / Mandopop - Jay Chou, Eric Chou, G.E.M., etc.)'
        }
        selected_langs = [lang_map.get(l, l) for l in (languages or ['thai', 'english'])]
        lang_instruction = f"MANDATORY LANGUAGE FILTER: You MUST select songs ONLY from these languages: {', '.join(selected_langs)}. If multiple languages are chosen, provide a balanced, alternating mix."

        chill_rule = ""
        if vibe_intent in ('chill', 'cafe') or any(w in prompt.lower() for w in ['ชิล', 'ชิว', 'chill', 'relax', 'สบาย', 'acoustic', 'lofi']):
            chill_rule = (
                "ABSOLUTE CHILL & MOOD PURITY ENFORCEMENT (CRITICAL):\n"
                "- The user explicitly requested a CHILL / RELAXING vibe ('เพลงชิลๆ').\n"
                "- STRICT PROHIBITION: You are STRICTLY FORBIDDEN from including Dance, EDM, Tech House, Club, High-Energy Pop, Heavy Rock, 3Cha, or Fast BPM tracks (>110 BPM).\n"
                "- Every song MUST be mellow, relaxing, acoustic, bedroom pop, indie chill, or smooth neo-soul/lo-fi.\n"
                "- Keep the entire playlist relaxing and coherent from start to finish without breaking the mood.\n"
            )

        system_prompt = (
            "You are a World-Class Professional Music Director and DJ Playlist Curator. "
            f"{lang_instruction}\n"
            f"{chill_rule}"
            "DJ MIXTAPE PLAYABILITY & VIBE COHERENCE RULES (CRITICAL):\n"
            "1. STRICT VIBE & GENRE COHERENCE: All recommended songs MUST strictly belong to the same musical mood, groove, and acoustic texture. NEVER mix incompatible genres together!\n"
            "   - If vibe is 'Chill / Neo-Soul / Lo-Fi / Cafe / Afternoon / Acoustic / Indie', choose Thai Neo-Soul, Lo-Fi, Bedroom Pop, or Indie Acoustic. NEVER include EDM, Dance, Heavy Rock, or 3Cha.\n"
            "   - If vibe is 'Party / Club / Peak', choose cohesive Dance/EDM/House/T-Pop/Hip-Hop.\n"
            "2. Cohesive BPM & Groove: Select songs that share a compatible DJ tempo range without abrupt tempo clashes.\n"
            "3. Seamless Playable Sequence: Arrange the tracks sequentially from Track 1 to Track N so a DJ can play them consecutively in this exact order without mood whiplash.\n"
            f"4. Flow Progression ({mixtape_mode}): Align transitions smoothly.\n"
            "Respond ONLY with a JSON object containing keys: setlist_title, vibe_summary, tracks (array of {artist, title, genre, vibe_note})."
        )
        url = "https://api.openai.com/v1/chat/completions"
        headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
        body = {
            "model": "gpt-4o-mini",
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"Recommend {count} tracks for: {prompt}. Languages: {', '.join(languages or ['thai', 'english'])}\nMixtape Mode: {mixtape_mode}"}
            ],
            "response_format": {"type": "json_object"},
            "temperature": 0.6
        }
        r = requests.post(url, headers=headers, json=body, timeout=20)
        if r.status_code == 200:
            data = r.json()
            content = data['choices'][0]['message']['content']
            return json.loads(content)
        else:
            raise Exception(f"OpenAI HTTP {r.status_code}: {r.text[:150]}")

    @classmethod
    def _search_live_online(cls, query: str, count: int = 15, vibe_intent: str = 'general') -> List[Dict]:
        """Live online song discovery matching custom prompts without requiring paid API keys."""
        tracks = []
        clean_q = re.sub(r'(?:อยากได้|ขอ|เพลง|ร้าน|บรรยากาศ|แนว|สไตล์|คนฟัง|ลูกค้า|เปิด|เซ็ต|ช่วยหา|หน่อย)', ' ', query, flags=re.I)
        clean_q = ' '.join(clean_q.split()).strip()
        search_terms = []
        if vibe_intent in ('chill', 'cafe'):
            if clean_q:
                search_terms = [f"{clean_q} Acoustic Chill", f"{clean_q} Indie Pop", clean_q]
            else:
                search_terms = ["Thai Indie Chill", "Acoustic Pop Chill", "Cafe Lo-Fi"]
        else:
            search_terms = [clean_q, query] if clean_q and len(clean_q) > 2 else [query]

        for st in search_terms:
            if not st or len(tracks) >= count:
                break
            # 1. Deezer API Live Search
            try:
                r = requests.get(f"https://api.deezer.com/search?q={st}&limit={count}", timeout=6)
                if r.status_code == 200:
                    for d in r.json().get('data', []):
                        art = d.get('artist', {}).get('name', '')
                        tit = d.get('title', '')
                        if art and tit and not any(t['artist'].lower() == art.lower() and t['title'].lower() == tit.lower() for t in tracks):
                            tracks.append({
                                'artist': art,
                                'title': tit,
                                'genre': 'Acoustic / Indie Chill' if vibe_intent in ('chill', 'cafe') else 'Popular Hit',
                                'vibe_note': f"เพลงฮิตตรงกับ '{st}'"
                            })
            except Exception:
                pass

            # 2. iTunes API Live Search
            if len(tracks) < count:
                try:
                    r2 = requests.get(f"https://itunes.apple.com/search?term={st}&entity=song&limit={count}", timeout=6)
                    if r2.status_code == 200:
                        for item in r2.json().get('results', []):
                            art = item.get('artistName', '')
                            tit = item.get('trackName', '')
                            if art and tit and not any(t['artist'].lower() == art.lower() and t['title'].lower() == tit.lower() for t in tracks):
                                tracks.append({
                                    'artist': art,
                                    'title': tit,
                                    'genre': 'Acoustic / Indie Chill' if vibe_intent in ('chill', 'cafe') else item.get('primaryGenreName', 'Pop'),
                                    'vibe_note': f"แนะนำสำหรับ '{st}'"
                                })
                except Exception:
                    pass

        return tracks[:count]

    @classmethod
    def _fill_tracks_to_count(cls, tracks: List[Dict], count: int, target_name: str, vibe_presets: Dict, languages: List[str], vibe_intent: str, prompt: str) -> List[Dict]:
        """Ensure tracklist reaches the requested count by pooling compatible songs or querying live discovery."""
        deduped = []
        seen = set()
        for t in tracks:
            key = (t.get('artist', '').strip().lower(), t.get('title', '').strip().lower())
            if key not in seen and key[0] and key[1]:
                seen.add(key)
                deduped.append(t)

        if len(deduped) >= count:
            return deduped[:count]

        # 1. Fill from compatible sister presets
        sister_pools = []
        is_thai = ('thai' in languages)
        is_english = ('english' in languages)

        if vibe_intent in ('chill', 'cafe'):
            if is_english:
                sister_pools.append(vibe_presets['cafe']['tracks'])
                sister_pools.append(vibe_presets['beach']['tracks'])
            if is_thai:
                sister_pools.append(vibe_presets['thai_chill']['tracks'])
                sister_pools.append(vibe_presets['thai_genz_mala']['tracks'])
        elif vibe_intent in ('club_peak', '3cha'):
            if is_thai:
                sister_pools.append(vibe_presets['thai_party_3cha']['tracks'])
            sister_pools.append(vibe_presets['club_peak']['tracks'])
            sister_pools.append(vibe_presets['rooftop']['tracks'])
        else:
            for p_key, p_val in vibe_presets.items():
                if p_key != target_name:
                    sister_pools.append(p_val['tracks'])

        for pool in sister_pools:
            for t in pool:
                if len(deduped) >= count:
                    break
                key = (t.get('artist', '').strip().lower(), t.get('title', '').strip().lower())
                if key not in seen:
                    seen.add(key)
                    deduped.append(t)
            if len(deduped) >= count:
                break

        # 2. If still less than count, use live online search (Deezer / iTunes free API)
        if len(deduped) < count:
            needed = count - len(deduped)
            online_tracks = cls._search_live_online(prompt or target_name, count=needed + 10, vibe_intent=vibe_intent)
            for t in online_tracks:
                if len(deduped) >= count:
                    break
                key = (t.get('artist', '').strip().lower(), t.get('title', '').strip().lower())
                if key not in seen:
                    seen.add(key)
                    deduped.append(t)

        return deduped[:count]

    @classmethod
    def _builtin_curator(cls, prompt: str, count: int, languages: Optional[List[str]] = None, vibe_intent: str = 'general') -> Dict:
        p = prompt.lower()
        languages = languages or ['thai', 'english']
        if vibe_intent == 'general':
            vibe_intent = cls._detect_vibe_intent(prompt)

        vibe_presets = {
            'thai_chill': {
                'title': '🍻 ร้านนั่งชิลล์ / บาร์อินดี้ไทย & อคูสติกป๊อป',
                'summary': 'เพลงไทยฟังสบาย ร้องตามได้ จิบเบียร์เพลินๆ แนว Indy Pop, R&B, Bedroom Pop & Acoustic',
                'tracks': [
                    {"artist": "Three Man Down", "title": "ข้างกัน (City)", "genre": "Thai Indie", "vibe_note": "เพลงฮิตติดหู ร้องตามได้ทั้งร้าน"},
                    {"artist": "Tilly Birds", "title": "คิด(แต่ไม่)ถึง", "genre": "Thai Pop", "vibe_note": "อารมณ์เพลงลงตัวกับบรรยากาศร้านเหล้า"},
                    {"artist": "Polycat", "title": "เวลาเธอยิ้ม", "genre": "Synth Pop", "vibe_note": "เสียงซินธ์ยุค 80s สบายใจ"},
                    {"artist": "Dept", "title": "17 (Let's Go)", "genre": "Indie Pop", "vibe_note": "กรูฟน่ารัก โยกตามเบาๆ"},
                    {"artist": "Anatomy Rabbit", "title": "ขอให้โลกนี้ใจดีกับเธอ", "genre": "Indie Dream", "vibe_note": "บรรยากาศอบอุ่น ผ่อนคลาย"},
                    {"artist": "Safeplanet", "title": "คำตอบ", "genre": "Indie Rock", "vibe_note": "กีตาร์พริ้วๆ เอกลักษณ์ Safeplanet"},
                    {"artist": "Bowkylion", "title": "บานปลาย", "genre": "Thai Pop", "vibe_note": "เมโลดี้น่ารัก ฟังสบาย"},
                    {"artist": "Bowkylion", "title": "วาดไว้", "genre": "Thai Pop", "vibe_note": "เพลงร้องตามพลังอารมณ์"},
                    {"artist": "NONT TANONT", "title": "โต๊ะริม (melt)", "genre": "Thai Pop", "vibe_note": "น่ารัก ฟังสบาย เหมาะกับคนมาเดท"},
                    {"artist": "PURPEECH", "title": "หากจะเพียงขอ (Sincare)", "genre": "Thai Indie", "vibe_note": "อินดี้เชียงใหม่ ฟีลกู้ด ละมุนหัวใจ"},
                    {"artist": "Landokmai", "title": "เพลงรักเพลงแรก (Bloom)", "genre": "Dream Pop", "vibe_note": "เสียงร้องหวานละมุน อบอุ่น"},
                    {"artist": "Whal & Dolph", "title": "ใจเดียว", "genre": "Indie Pop", "vibe_note": "ดนตรีฟังสบาย ยิ้มตาม"},
                    {"artist": "Serious Bacon", "title": "พี่ๆ ตัดแว่นให้หน่อย", "genre": "Acoustic Pop", "vibe_note": "อะคูสติกสดใส สบายอารมณ์"},
                    {"artist": "Fellow Fellow", "title": "ดาวหางฮัลเลย์", "genre": "Thai Pop", "vibe_note": "เพลงฮิตไวรัล ความหมายดี"},
                    {"artist": "Television off", "title": "ให้เธอหายไป", "genre": "Indie Rock", "vibe_note": "กรูฟอินดี้เท่ๆ ฟังสบาย"},
                    {"artist": "HYBS", "title": "Tip Toe", "genre": "Indie R&B", "vibe_note": "กรูฟนุ่มนวล สากลสัญชาติไทย"},
                    {"artist": "Phum Viphurit", "title": "Lover Boy", "genre": "Neo Soul", "vibe_note": "ฟีลกู้ด ผ่อนคลาย"},
                    {"artist": "Scrubb", "title": "ใกล้", "genre": "Britpop / Thai", "vibe_note": "เพลงฟังสบายตลอดกาล"},
                    {"artist": "Mirrr", "title": "นิโคติน (Nicotine)", "genre": "Indie Pop", "vibe_note": "เมโลดี้ชวนเคลิ้ม"},
                    {"artist": "LOSERPOP", "title": "เคยคิดว่าเลิกชอบได้แล้ว", "genre": "Indie Pop", "vibe_note": "ซาวด์น่ารัก นั่งฟังชิลๆ"},
                    {"artist": "moving and cut", "title": "อย่าเลยเถิด", "genre": "Indie Pop", "vibe_note": "อารมณ์เหงาๆ ละมุนใจ"},
                    {"artist": "Blackbeans", "title": "Wish", "genre": "Bedroom Pop", "vibe_note": "เพลงรักชวนฝัน ฟังสบาย"},
                    {"artist": "YENTED", "title": "อย่าทำให้คิดถึง (feat. คอปเตอร์)", "genre": "Neo Soul / Thai", "vibe_note": "กรูฟ R&B สุดละมุน"},
                    {"artist": "สิงโต นำโชค", "title": "อยู่ต่อเลยได้ไหม", "genre": "Acoustic Pop", "vibe_note": "เสียงอูคูเลเล่อบอุ่นเป็นกันเอง"},
                    {"artist": "Musketeers", "title": "Dancing", "genre": "Indie Pop", "vibe_note": "กรูฟโยกเบาๆ อารมณ์ดี"},
                    {"artist": "Ink Waruntorn", "title": "สายตาหลอกกันไม่ได้", "genre": "Synth Pop", "vibe_note": "ซินธ์ป๊อปสดใส เสียงร้องละมุน"},
                    {"artist": "No One Else", "title": "ต่อจากนี้เพลงรักทุกเพลงจะเป็นของเธอเท่านั้น", "genre": "Soul Pop", "vibe_note": "เพลงรักอบอุ่น โรแมนติก"},
                    {"artist": "The TOYS", "title": "ก่อนฤดูฝน", "genre": "R&B / Pop", "vibe_note": "เมโลดี้เอกลักษณ์ กรูฟฟังสบาย"},
                    {"artist": "Violette Wautier", "title": "Smoke", "genre": "Indie Pop", "vibe_note": "เสียงร้องมีเสน่ห์ ชวนหลงใหล"},
                    {"artist": "Lipta", "title": "ทักครับ", "genre": "Pop / R&B", "vibe_note": "จังหวะน่ารัก ยิ้มตามง่ายๆ"},
                    {"artist": "Plastic Plastic", "title": "อยากรู้", "genre": "Indie Pop", "vibe_note": "ดนตรีโปร่งสดชื่น เหมาะกับร้านชิลล์"},
                    {"artist": "Morvasu", "title": "Melbourne (feat. TangBadVoice)", "genre": "Indie Pop", "vibe_note": "กรูฟสตรีทอินดี้สุดชิลล์"},
                    {"artist": "Chilling Sunday", "title": "คนเก่าเขาทำไว้ดี", "genre": "Acoustic Pop", "vibe_note": "อะคูสติกฟังสบาย สไตล์ Chilling Sunday"},
                    {"artist": "Zom Marie", "title": "รางวัลปลอบใจ (feat. LAZYLOXY)", "genre": "Thai Pop", "vibe_note": "เพลงเพราะติดหู บรรยากาศสบายใจ"},
                    {"artist": "Scrubb", "title": "รอยยิ้ม", "genre": "Britpop / Thai", "vibe_note": "อบอุ่นคลาสสิก"}
                ]
            },
            'cafe': {
                'title': '☕ Cozy Cafe & Coffee Chillout',
                'summary': 'เพลงคาเฟ่ฟังสบาย แนว Lo-Fi Beats, Acoustic, Neo-Soul & Chill Jazz',
                'tracks': [
                    {"artist": "Bruno Major", "title": "Nothing", "genre": "R&B / Soul", "vibe_note": "เสียงกีตาร์อบอุ่น เหมาะกับจิบกาแฟ"},
                    {"artist": "Laufey", "title": "From the Start", "genre": "Jazz Pop", "vibe_note": "แจ๊สป๊อปสดใส มีเสน่ห์"},
                    {"artist": "Keshi", "title": "beside you", "genre": "Lo-Fi R&B", "vibe_note": "เสียงร้องนุ่ม ละมุนใจ"},
                    {"artist": "HYBS", "title": "Ride", "genre": "Indie Pop", "vibe_note": "เพลงสากลสัญชาติไทยสุดคูล"},
                    {"artist": "Prep", "title": "Cheapest Flight", "genre": "City Pop", "vibe_note": "กรูฟสนุก ฟังสบายไม่น่าเบื่อ"},
                    {"artist": "Phum Viphurit", "title": "Lover Boy", "genre": "Neo Soul", "vibe_note": "ฟีลกู้ด สดใส"},
                    {"artist": "Honne", "title": "Day 1 ◑", "genre": "Electro Soul", "vibe_note": "เพลงยอดนิยมประจำคาเฟ่"},
                    {"artist": "Daniel Caesar, H.E.R.", "title": "Best Part", "genre": "R&B", "vibe_note": "เพลงรักละมุน ฟังสบาย"},
                    {"artist": "UMI", "title": "Love Affair", "genre": "Neo Soul", "vibe_note": "ไวบ์ผ่อนคลาย สไตล์ Bedroom Pop"},
                    {"artist": "NIKI", "title": "Every Summertime", "genre": "Pop / R&B", "vibe_note": "เพลงชิลล์สบายๆ"},
                    {"artist": "Jeremy Zucker", "title": "comethru", "genre": "Acoustic Pop", "vibe_note": "กีตาร์โปร่งฟังสบาย"},
                    {"artist": "Mac Ayres", "title": "Easy", "genre": "R&B / Soul", "vibe_note": "กรูฟโซลนุ่มละมุน"},
                    {"artist": "Leon Bridges", "title": "Texas Sun", "genre": "Indie Soul", "vibe_note": "อารมณ์สบายๆ ยามบ่าย"},
                    {"artist": "Gracie Abrams", "title": "I miss you, I'm sorry", "genre": "Acoustic Pop", "vibe_note": "เพลงนุ่มนวล ผ่อนคลาย"},
                    {"artist": "Tom Misch", "title": "Movie", "genre": "Neo-Soul / Jazz", "vibe_note": "ซาวด์กีตาร์โซลอบอุ่น"},
                    {"artist": "John Mayer", "title": "New Light", "genre": "Pop / Indie", "vibe_note": "กรูฟโยกเบาๆ สดใส"},
                    {"artist": "Rex Orange County", "title": "Sunflower", "genre": "Indie Pop", "vibe_note": "ฟีลกู้ดยามเช้า"},
                    {"artist": "Clairo", "title": "Sofia", "genre": "Bedroom Pop", "vibe_note": "เสียงร้องน่ารัก ติดหู"},
                    {"artist": "Boy Pablo", "title": "Everytime", "genre": "Indie Pop", "vibe_note": "ดนตรีฟังสบาย ผ่อนคลาย"},
                    {"artist": "Men I Trust", "title": "Show Me How", "genre": "Dream Pop", "vibe_note": "มิติเสียงนุ่ม ละมุนใจ"},
                    {"artist": "Cuco", "title": "Lover Is a Day", "genre": "Lo-Fi / Indie", "vibe_note": "บรรยากาศอบอุ่นช่วงบ่าย"},
                    {"artist": "Stephen Sanchez", "title": "Until I Found You", "genre": "Retro Pop", "vibe_note": "ย้อนยุคหวานซึ้ง"},
                    {"artist": "Billie Eilish", "title": "Ocean Eyes", "genre": "Ambient Pop", "vibe_note": "เสียงกระซิบละมุนหู"},
                    {"artist": "Norah Jones", "title": "Don't Know Why", "genre": "Jazz / Acoustic", "vibe_note": "คลาสสิกประจำร้านกาแฟ"},
                    {"artist": "Corinne Bailey Rae", "title": "Put Your Records On", "genre": "Soul / Pop", "vibe_note": "ฟีลกู้ด เติมพลังบวก"},
                    {"artist": "Jack Johnson", "title": "Banana Pancakes", "genre": "Acoustic", "vibe_note": "กีตาร์โปร่งสบายๆ ยามเช้า"},
                    {"artist": "Jason Mraz", "title": "I'm Yours", "genre": "Acoustic Pop", "vibe_note": "สดใส ยิ้มตามง่ายๆ"},
                    {"artist": "Ed Sheeran", "title": "Thinking Out Loud", "genre": "Pop / Soul", "vibe_note": "เพลงรักความหมายดี"},
                    {"artist": "Pink Sweat$", "title": "At My Worst", "genre": "R&B / Soul", "vibe_note": "น่ารัก ละมุนใจ"},
                    {"artist": "Frank Ocean", "title": "Thinkin Bout You", "genre": "R&B", "vibe_note": "คลาสสิกฟังสบาย"},
                    {"artist": "SZA", "title": "Snooze", "genre": "R&B", "vibe_note": "กรูฟ R&B ฮิตทั่วโลก"},
                    {"artist": "Giveon", "title": "Heartbreak Anniversary", "genre": "R&B / Soul", "vibe_note": "เสียงร้องทุ้มอบอุ่น"},
                    {"artist": "Ruel", "title": "Painkiller", "genre": "Pop / Soul", "vibe_note": "จังหวะน่ารัก ฟังสบาย"},
                    {"artist": "Alec Benjamin", "title": "Let Me Down Slowly", "genre": "Acoustic Pop", "vibe_note": "เมโลดี้ซึ้งติดหู"},
                    {"artist": "Conan Gray", "title": "Heather", "genre": "Indie Pop", "vibe_note": "อารมณ์สบายๆ เคล้ากาแฟ"}
                ]
            },
            'thai_genz_mala': {
                'title': '🍲 ร้านอาหาร / หมาล่า / ชาบู / วัยรุ่นไทย & Gen Z',
                'summary': 'เพลงฮิต T-Pop, Thai Indie และเพลงป๊อปฟังสบายยอดนิยมสำหรับคนไทยและวัยรุ่น Gen Z',
                'tracks': [
                    {"artist": "NONT TANONT", "title": "โต๊ะริม (melt)", "genre": "Thai Pop", "vibe_note": "เพลงฮิตประจำร้านอาหารและคาเฟ่"},
                    {"artist": "Bowkylion", "title": "วาดไว้", "genre": "Thai Pop", "vibe_note": "ท่อนฮุคทรงพลัง ทุกคนร้องตามได้"},
                    {"artist": "Fellow Fellow", "title": "ดาวหางฮัลเลย์", "genre": "Thai Pop", "vibe_note": "เพลงรักความหมายดี บรรยากาศอบอุ่น"},
                    {"artist": "4EVE", "title": "วัดปะหล่ะ? (TEST ME)", "genre": "T-Pop", "vibe_note": "เพลงฮิตไวรัล ร้องตามได้ทั่วไทย"},
                    {"artist": "PiXXiE", "title": "มูเตลู (MUTELU)", "genre": "T-Pop", "vibe_note": "กรูฟสดใส ถูกใจวัยรุ่นและนักศึกษา"},
                    {"artist": "BUS (Because of You I Shine)", "title": "Because of You, I Shine", "genre": "T-Pop", "vibe_note": "เพลงฮิตติดชาร์ตของ Gen Z"},
                    {"artist": "PROXIE", "title": "คนไม่คุย (Silent Mode)", "genre": "T-Pop", "vibe_note": "จังหวะน่ารัก ฟังสบายระหว่างทานอาหาร"},
                    {"artist": "Three Man Down", "title": "ข้างกัน (City)", "genre": "Thai Indie", "vibe_note": "ฟีลลิ่งวัยรุ่น ร้องตามได้ทั้งโต๊ะ"},
                    {"artist": "Tilly Birds", "title": "ถ้าเราเจอกันอีก (Until Then)", "genre": "Thai Pop", "vibe_note": "เพลงฮิตติดหู อารมณ์ซึ้ง"},
                    {"artist": "Only Monday", "title": "ได้แต่นึกถึง", "genre": "Thai Pop", "vibe_note": "เพลงฮิตติดชาร์ตอันดับหนึ่ง"},
                    {"artist": "Jeff Satur", "title": "ลืมไปแล้วว่าลืมยังไง (Fade)", "genre": "Thai Pop", "vibe_note": "เสียงร้องละมุน โดนใจคนรุ่นใหม่"},
                    {"artist": "ATLAS", "title": "เธอมีความหมาย (My Treasure)", "genre": "T-Pop", "vibe_note": "บอยแบนด์ T-Pop สดใส"},
                    {"artist": "Bell Warisara", "title": "เอาปากกามาวง", "genre": "Thai Pop", "vibe_note": "เพลงน่ารัก ไวรัลยอดนิยม"},
                    {"artist": "Serious Bacon", "title": "พี่ๆ ตัดแว่นให้หน่อย", "genre": "Acoustic Pop", "vibe_note": "อารมณ์สบายๆ ทานอาหารเพลิน"},
                    {"artist": "Tattoo Colour", "title": "SuperCarCare", "genre": "Thai Pop", "vibe_note": "กรูฟสนุกสนาน อารมณ์ดี"},
                    {"artist": "Scrubb", "title": "ทุกอย่าง", "genre": "Britpop / Thai", "vibe_note": "คลาสสิกฟังสบาย สไตล์ Scrubb"},
                    {"artist": "Ink Waruntorn", "title": "ดีใจด้วยนะ", "genre": "Synth Pop", "vibe_note": "เพลงร้องตามได้ทั้งร้าน"},
                    {"artist": "Lipta", "title": "แฟนผมน่ารัก", "genre": "Pop", "vibe_note": "เพลงน่ารัก ฟีลกู้ด"},
                    {"artist": "PURPEECH", "title": "ตอนนั้นในวันนี้", "genre": "Thai Indie", "vibe_note": "เพลงฮิตวัยรุ่น Gen Z"},
                    {"artist": "Bowkylion", "title": "บานปลาย", "genre": "Thai Pop", "vibe_note": "ฮิตติดเทรนด์ TikTok"},
                    {"artist": "NONT TANONT", "title": "พิง", "genre": "Thai Pop", "vibe_note": "เสียงร้องอบอุ่น ทรงพลัง"},
                    {"artist": "4EVE", "title": "หยดน้ำตา (Tears)", "genre": "T-Pop", "vibe_note": "เพลงช้าซึ้งๆ ยอดนิยม"},
                    {"artist": "PiXXiE", "title": "ไม่ได้ก็ไม่เอา", "genre": "T-Pop", "vibe_note": "เพลงน่ารักติดหู"},
                    {"artist": "Three Man Down", "title": "ฝนตกไหม", "genre": "Thai Pop", "vibe_note": "เพลงฮิตตลอดกาล"}
                ]
            },
            'kpop_hits': {
                'title': '🇰🇷 K-Pop Trending & Global Idols',
                'summary': 'เพลงเกาหลียอดนิยม NewJeans, BLACKPINK, IVE, aespa, BTS, LE SSERAFIM',
                'tracks': [
                    {"artist": "NewJeans", "title": "Ditto", "genre": "K-Pop / Melodic", "vibe_note": "เมโลดี้ฟีลกู้ด นุ่มนวล ติดหู"},
                    {"artist": "NewJeans", "title": "Super Shy", "genre": "K-Pop", "vibe_note": "บีท Jersey Club สดใส ไวรัลทั่วโลก"},
                    {"artist": "IVE", "title": "I AM", "genre": "K-Pop", "vibe_note": "พลังเสียงและจังหวะสนุกสนาน"},
                    {"artist": "LE SSERAFIM", "title": "Perfect Night", "genre": "K-Pop / Dance", "vibe_note": "เพลงฟังเพลิน ชวนโยกตาม"},
                    {"artist": "Jung Kook, Latto", "title": "Seven", "genre": "UK Garage / Pop", "vibe_note": "กรูฟสนุก ฟังสบาย ร้องตามง่าย"},
                    {"artist": "FIFTY FIFTY", "title": "Cupid (Twin Ver.)", "genre": "K-Pop / Disco", "vibe_note": "ไวรัลฟังสบาย ละมุนหู"},
                    {"artist": "TWICE", "title": "The Feels", "genre": "K-Pop / Nu-Disco", "vibe_note": "แจกความสดใส พลังบวกเต็มเปี่ยม"},
                    {"artist": "BTS", "title": "Dynamite", "genre": "Disco Pop", "vibe_note": "ฮิตระดับโลก เต้นตามได้ทุกวัย"},
                    {"artist": "RIIZE", "title": "Get A Guitar", "genre": "Funk Pop", "vibe_note": "กรูฟกีตาร์ฟังกี้สุดเท่"},
                    {"artist": "BLACKPINK", "title": "Pink Venom", "genre": "K-Pop / Hip-Hop", "vibe_note": "จังหวะเร้าใจ ไฮป์บรรยากาศ"},
                    {"artist": "NewJeans", "title": "Hype Boy", "genre": "K-Pop", "vibe_note": "ฮิตไวรัลเต้นตามได้ทั่วโลก"},
                    {"artist": "IVE", "title": "After LIKE", "genre": "K-Pop / Disco", "vibe_note": "จังหวะดิสโก้สนุกสนาน"},
                    {"artist": "aespa", "title": "Drama", "genre": "K-Pop", "vibe_note": "เบสแน่น ซาวด์ล้ำสมัย"},
                    {"artist": "LE SSERAFIM", "title": "ANTIFRAGILE", "genre": "K-Pop / Reggaeton", "vibe_note": "บีทคึกคัก เต้นสนุก"},
                    {"artist": "BTS", "title": "Butter", "genre": "Dance Pop", "vibe_note": "กรูฟสดใส พลังงานบวก"}
                ]
            },
            'jpop_citypop': {
                'title': '🇯🇵 J-Pop, City Pop & Anime Hits',
                'summary': 'เพลงญี่ปุ่นยอดนิยม YOASOBI, Fujii Kaze, Ado, Aimyon และ City Pop ยุค 80s',
                'tracks': [
                    {"artist": "Fujii Kaze", "title": "Shinunoga E-Wa", "genre": "J-Pop / R&B", "vibe_note": "เพลงไวรัลระดับโลก ซาวด์มีเสน่ห์"},
                    {"artist": "Miki Matsubara", "title": "Stay With Me", "genre": "City Pop", "vibe_note": "ตำนาน City Pop ยุค 80s สไตล์ญี่ปุ่น"},
                    {"artist": "Mariya Takeuchi", "title": "Plastic Love", "genre": "City Pop", "vibe_note": "กรูฟกรูมมี่คลาสสิก"},
                    {"artist": "Aimyon", "title": "Marigold", "genre": "J-Rock / Pop", "vibe_note": "ดนตรีฟังสบาย กีตาร์โปร่งอบอุ่น"},
                    {"artist": "Official HIGE DANdism", "title": "Pretender", "genre": "J-Pop", "vibe_note": "เพลงรักซึ้งๆ ร้องตามได้"},
                    {"artist": "YOASOBI", "title": "Idol (アイドル)", "genre": "J-Pop", "vibe_note": "เพลงฮิตอันดับ 1 เมโลดี้จัดจ้าน"},
                    {"artist": "Imase", "title": "NIGHT DANCER", "genre": "J-Pop / Funk", "vibe_note": "เพลงเต้นไวรัล TikTok"},
                    {"artist": "Kenshi Yonezu", "title": "Lemon", "genre": "J-Pop", "vibe_note": "บทเพลงระดับตำนานของญี่ปุ่น"},
                    {"artist": "Fujii Kaze", "title": "Matsuri", "genre": "J-Pop", "vibe_note": "จังหวะงานวัดญี่ปุ่นสุดเท่"},
                    {"artist": "YOASOBI", "title": "Yoru ni Kakeru", "genre": "J-Pop", "vibe_note": "เพลงแจ้งเกิด เมโลดี้เปียโนเร็ว"},
                    {"artist": "Anri", "title": "Remember Summer Days", "genre": "City Pop", "vibe_note": "City Pop สดใสริมทะเล"},
                    {"artist": "Tatsuro Yamashita", "title": "Sparkle", "genre": "City Pop", "vibe_note": "ริฟฟ์กีตาร์ระดับตำนาน"}
                ]
            },
            'cpop_mando': {
                'title': '🇨🇳 C-Pop & Mandopop Melodic Hits',
                'summary': 'เพลงจีนฮิต Jay Chou, Eric Chou, G.E.M., JJ Lin สไตล์ Mandopop & R&B',
                'tracks': [
                    {"artist": "Jay Chou", "title": "Mojito", "genre": "C-Pop / Latin", "vibe_note": "จังหวะละตินป็อป สดใสมีเสน่ห์"},
                    {"artist": "Eric Chou", "title": "How Have You Been?", "genre": "Mandopop", "vibe_note": "เพลงรักซึ้งๆ ยอดนิยม"},
                    {"artist": "G.E.M.", "title": "Light Years Away (光年之外)", "genre": "C-Pop", "vibe_note": "เสียงร้องทรงพลังและดนตรีอลังการ"},
                    {"artist": "JJ Lin", "title": "Twilight (不為誰而作的歌)", "genre": "Mandopop", "vibe_note": "เปียโนและพลังเสียงสะกดอารมณ์"},
                    {"artist": "Lexie Liu", "title": "Manta", "genre": "C-Pop / Cyberpunk", "vibe_note": "ซาวด์ล้ำสมัย สไตล์ฟิวเจอร์ริสติก"},
                    {"artist": "Jay Chou", "title": "Simple Love", "genre": "C-Pop / R&B", "vibe_note": "คลาสสิกฟังสบาย"},
                    {"artist": "Eric Chou", "title": "The Distance of Love", "genre": "Mandopop", "vibe_note": "เพลงรักหวานซึ้ง"},
                    {"artist": "Crowd Lu", "title": "Your Name Engraved Herein", "genre": "Acoustic Pop", "vibe_note": "กีตาร์โปร่งอบอุ่น"},
                    {"artist": "A-Lin", "title": "A Kind of Sorrow", "genre": "Mandopop", "vibe_note": "บทเพลงเศร้าซึ้งกินใจ"}
                ]
            },
            'thai_party_3cha': {
                'title': '🚗 3ช่า & Thai Party Club (โจ๊ะๆ มันส์ๆ)',
                'summary': 'เพลง 3ช่า รีมิกซ์ และฮิปฮอปไทยมันส์ๆ สำหรับปาร์ตี้และผับไทย',
                'tracks': [
                    {"artist": "ขันที (Khan-T)", "title": "ตามองตา (Eye's 3Cha Remix)", "genre": "3Cha Dance", "vibe_note": "จังหวะโจ๊ะคลาสสิก"},
                    {"artist": "โจอี้ บอย", "title": "กะหล่ำปลี", "genre": "Thai Hip-Hop", "vibe_note": "สายตลก สนุกสนาน"},
                    {"artist": "Youngohm", "title": "ธาตุทองซาวด์", "genre": "Thai Hip-Hop", "vibe_note": "ฮิตติดผับทั่วประเทศ"},
                    {"artist": "F.HERO, MILLI", "title": "Mirror Mirror", "genre": "Thai Hip-Hop", "vibe_note": "แร็ปดุเดือด เพิ่มความมันส์"},
                    {"artist": "แจ๊ส สปุ๊กนิค ปาปิยอง กุ๊กกุ๊ก", "title": "แว้นฟ้อหล่อเฟี้ยว", "genre": "Thai Party", "vibe_note": "เต้นยับ สนุกสนาน"},
                    {"artist": "D GERRARD", "title": "Galaxy", "genre": "Thai R&B", "vibe_note": "กรูฟเท่ๆ ชวนโยก"},
                    {"artist": "UrboyTJ", "title": "วายร้าย (Villain)", "genre": "Thai Hip-Hop", "vibe_note": "เพลงประจำสายตี้"},
                    {"artist": "SPRITE, GUYGEEGEE", "title": "ทน", "genre": "Thai Hip-Hop", "vibe_note": "เพลงไทยระดับชาร์ตโลก"},
                    {"artist": "ยังโอม", "title": "เฉียบคะนอง", "genre": "Thai Hip-Hop", "vibe_note": "เบสแน่น เต้นสนุก"},
                    {"artist": "โจอี้ บอย", "title": "ลอยทะเล", "genre": "3Cha Pop", "vibe_note": "เพลงเต้นระดับตำนาน"},
                    {"artist": "แจ๊ส สปุ๊กนิค ปาปิยอง กุ๊กกุ๊ก", "title": "มือลั่น", "genre": "Thai Party", "vibe_note": "ร้องตามได้ทั้งงาน"},
                    {"artist": "F.HERO", "title": "จำเก่ง", "genre": "Thai Hip-Hop", "vibe_note": "กรูฟสนุกสนาน"}
                ]
            },
            'beach': {
                'title': '🌴 Sunset Beach Club & Tropical Chill',
                'summary': 'ดนตรี Tropical House, Nu-Disco และ Melodic Chillout ริมชายหาด',
                'tracks': [
                    {"artist": "Kygo, Conrad Sewell", "title": "Firestone", "genre": "Tropical House", "vibe_note": "เสียงซินธ์โปร่งสบาย เหมาะกับแดดบ่ายริมหาด"},
                    {"artist": "Robin Schulz", "title": "Sugar", "genre": "Deep House", "vibe_note": "กรูฟสนุก ฟังสบาย"},
                    {"artist": "Bakermat", "title": "One Day (Vandaag)", "genre": "Melodic House", "vibe_note": "เสียงแซกโซโฟนคลาสสิกฟีลกู้ด"},
                    {"artist": "Klingande", "title": "Jubel", "genre": "Tropical House", "vibe_note": "จังหวะพระอาทิตย์ตกริมทะเล"},
                    {"artist": "Jonas Blue, Dakota", "title": "Fast Car", "genre": "Tropical House", "vibe_note": "ร้องตามง่าย บรรยากาศสดใส"},
                    {"artist": "Duke Dumont", "title": "Ocean Drive", "genre": "Nu-Disco", "vibe_note": "ไวบ์ช่วงค่ำริมหาดสุดคูล"},
                    {"artist": "Sam Feldt", "title": "Show Me Love", "genre": "Tropical House", "vibe_note": "เบสไลน์นุ่มนวล เพิ่มพลังบวก"},
                    {"artist": "Lost Frequencies", "title": "Are You With Me", "genre": "Deep House", "vibe_note": "ท่อนฮุคกีตาร์โปร่งอันเป็นเอกลักษณ์"},
                    {"artist": "Kygo, Whitney Houston", "title": "Higher Love", "genre": "Tropical House", "vibe_note": "เสียงร้องทรงพลัง บรรยากาศสดใส"},
                    {"artist": "Petit Biscuit", "title": "Sunset Lover", "genre": "Chill Electronic", "vibe_note": "คลาสสิกชมพระอาทิตย์ตก"},
                    {"artist": "Gryffin, Elley Duhe", "title": "Tie Me Down", "genre": "Melodic Dance", "vibe_note": "ปาร์ตี้บีชค็อกเทล"},
                    {"artist": "Matoma, Astrid S", "title": "Running Out", "genre": "Tropical House", "vibe_note": "จังหวะโยกเบาๆ ริมสระว่ายน้ำ"},
                    {"artist": "Avicii", "title": "Wake Me Up", "genre": "Folk / Melodic", "vibe_note": "เพลงระดับตำนานริมหาด"},
                    {"artist": "Calvin Harris", "title": "Summer", "genre": "Dance", "vibe_note": "เพลงฮิตฤดูร้อน"},
                    {"artist": "Kungs, Cookin' on 3 Burners", "title": "This Girl", "genre": "House / Funk", "vibe_note": "กรูฟสนุกสนานริมทะเล"},
                    {"artist": "Seeb, Mike Posner", "title": "I Took A Pill In Ibiza", "genre": "Tropical House", "vibe_note": "จังหวะโยกสบายๆ"},
                    {"artist": "Sigala", "title": "Easy Love", "genre": "Piano House", "vibe_note": "เสียงเปียโนสดใสริมหาด"}
                ]
            },
            'rooftop': {
                'title': '🍸 Rooftop Cocktail Lounge & Deep House',
                'summary': 'ไวบ์หรูหรา นั่งจิบค็อกเทลชมวิวเมือง ดนตรี Deep House & Melodic Techno',
                'tracks': [
                    {"artist": "RÜFÜS DU SOL", "title": "Innerbloom", "genre": "Melodic House", "vibe_note": "มิติเสียงลึกซึ้ง เหมาะกับวิวตึกสูง"},
                    {"artist": "CamelPhat, Elderbrook", "title": "Cola", "genre": "Tech House", "vibe_note": "กรูฟเซ็กซี่ มีเสน่ห์"},
                    {"artist": "Nora En Pure", "title": "Come With Me", "genre": "Deep House", "vibe_note": "เปียโนนุ่มนวล หรูหรา"},
                    {"artist": "Lane 8, POLIÇA", "title": "Brightest Lights", "genre": "Deep House", "vibe_note": "อบอุ่น เคล้าแสงไฟเมือง"},
                    {"artist": "Ben Böhmer, Romain Garcia", "title": "Cappadocia", "genre": "Melodic House", "vibe_note": "ฟีลลิ่งลอยๆ ชิลล์ขั้นสุด"},
                    {"artist": "Tinlicker, Helsloot", "title": "Because You Move Me", "genre": "Deep House", "vibe_note": "ท่วงทำนองติดหู จิบค็อกเทลเพลิน"},
                    {"artist": "ZHU", "title": "Faded", "genre": "Deep House", "vibe_note": "ความเท่สไตล์ ZHU ยามค่ำคืน"},
                    {"artist": "Meduza, Goodboys", "title": "Piece Of Your Heart", "genre": "Deep House", "vibe_note": "ท่อนเบสหนักแน่น โดนใจสายปาร์ตี้"},
                    {"artist": "ARTBAT", "title": "Flame", "genre": "Melodic Techno", "vibe_note": "สร้างบรรยากาศลึกลับน่าค้นหา"},
                    {"artist": "Monolink", "title": "Return to Oz (ARTBAT Remix)", "genre": "Melodic Techno", "vibe_note": "กรูฟเท่ ทรงพลัง"},
                    {"artist": "Boris Brejcha", "title": "Gravity", "genre": "High-Tech Minimal", "vibe_note": "บีทขับเคลื่อนต่อเนื่อง"},
                    {"artist": "Jan Blomqvist", "title": "Maybe Not", "genre": "Melodic House", "vibe_note": "เสียงร้องละมุนยามค่ำคืน"},
                    {"artist": "Bob Moses", "title": "Tearing Me Up", "genre": "Deep House", "vibe_note": "กรูฟชวนหลงใหล"},
                    {"artist": "Yotto", "title": "Rhythm (Of The Night)", "genre": "Melodic House", "vibe_note": "บรรยากาศลอยๆ"}
                ]
            },
            'club_peak': {
                'title': '🔥 Peak Time Club & High-Energy Tech House (128 BPM)',
                'summary': 'เพลงเต้นบีทหนัก ดรอปมันส์ สำหรับช่วง Peak Time ในคลับและปาร์ตี้',
                'tracks': [
                    {"artist": "Fisher", "title": "Losing It", "genre": "Tech House", "vibe_note": "แทร็กระเบิดฟลอร์อันดับ 1"},
                    {"artist": "Dom Dolla", "title": "Rhyme Dust", "genre": "Tech House", "vibe_note": "ดรอปหนัก บีทกระชับ 128 BPM"},
                    {"artist": "Chris Lake, Aluna", "title": "Beggin'", "genre": "Tech House", "vibe_note": "กรูฟสนุก เต้นไม่หยุด"},
                    {"artist": "John Summit", "title": "Where You Are", "genre": "House", "vibe_note": "ท่อนร้องติดหู ดรอปทรงพลัง"},
                    {"artist": "Mau P", "title": "Drugs From Amsterdam", "genre": "Tech House", "vibe_note": "เสียงฮิตในทุกผับยุคนี้"},
                    {"artist": "James Hype, Miggy Dela Rosa", "title": "Ferrari", "genre": "House", "vibe_note": "ไฮป์คนฟัง ร้องตามเต้นตาม"},
                    {"artist": "Acraze, Cherish", "title": "Do It To It", "genre": "Tech House", "vibe_note": "เพลงไวรัล คลับมิกซ์สุดมันส์"},
                    {"artist": "Peggy Gou", "title": "(It Goes Like) Nanana", "genre": "House", "vibe_note": "พลังบวก เต้นตามทั้งผับ"},
                    {"artist": "Fred again.., Swedish House Mafia", "title": "Turn On The Lights again..", "genre": "UK Garage", "vibe_note": "บีทเร่งเร้า เพิ่มความเดือด"},
                    {"artist": "Tiësto", "title": "The Business", "genre": "Bass House", "vibe_note": "เบสทึบแน่น สไตล์ Mainstage"},
                    {"artist": "David Guetta, Bebe Rexha", "title": "I'm Good (Blue)", "genre": "Dance / EDM", "vibe_note": "ทุกคนร้องตามได้ทั้งผับ"},
                    {"artist": "Swedish House Mafia", "title": "Don't You Worry Child", "genre": "EDM Anthem", "vibe_note": "เพลงชาติสายปาร์ตี้"},
                    {"artist": "Martin Garrix", "title": "Animals", "genre": "Big Room EDM", "vibe_note": "ดรอปกระโดดสุดมันส์"},
                    {"artist": "Skrillex, Fred again.., Flowdan", "title": "Rumble", "genre": "Bass / UKG", "vibe_note": "ดรอปเบสหนักสะใจ"},
                    {"artist": "Alok, Dynoro", "title": "On & On", "genre": "Slap House", "vibe_note": "เบสเด้งหนักแน่น"}
                ]
            }
        }

        # 1. Multi-Language Selection Pool
        if languages and ('korean' in languages or 'japanese' in languages or 'chinese' in languages):
            is_chill = (vibe_intent in ('chill', 'cafe'))
            pool_by_lang = {
                'thai': vibe_presets['thai_chill']['tracks'] if is_chill else (vibe_presets['thai_genz_mala']['tracks'] + vibe_presets['thai_chill']['tracks']),
                'korean': vibe_presets['kpop_hits']['tracks'],
                'japanese': vibe_presets['jpop_citypop']['tracks'],
                'chinese': vibe_presets['cpop_mando']['tracks'],
                'english': vibe_presets['cafe']['tracks'] if is_chill else (vibe_presets['beach']['tracks'] + vibe_presets['rooftop']['tracks'] + vibe_presets['cafe']['tracks'])
            }
            active_langs = [l for l in languages if l in pool_by_lang]
            if active_langs:
                mixed_tracks = []
                max_len = max(len(pool_by_lang[l]) for l in active_langs)
                for i in range(max_len):
                    for l in active_langs:
                        if len(mixed_tracks) >= count:
                            break
                        p_list = pool_by_lang[l]
                        if i < len(p_list):
                            t = p_list[i]
                            if not any(x['artist'] == t['artist'] and x['title'] == t['title'] for x in mixed_tracks):
                                mixed_tracks.append(t)

                filled = cls._fill_tracks_to_count(mixed_tracks, count, 'Multi-Language Mix', vibe_presets, languages, vibe_intent, prompt)
                lang_labels = {'thai': '🇹🇭 ไทย', 'english': '🇬🇧 สากล', 'korean': '🇰🇷 เกาหลี', 'japanese': '🇯🇵 ญี่ปุ่น', 'chinese': '🇨🇳 จีน'}
                title_langs = ' + '.join(lang_labels.get(l, l) for l in active_langs)
                vibe_label = "ชิลล์ ฟังสบาย" if is_chill else "คัดสรรพิเศษ"
                return {
                    'setlist_title': f"✨ AI Multi-Language Mix ({title_langs})",
                    'vibe_summary': f"เซ็ตเพลง{vibe_label} ผสมผสานเพลงภาษา {title_langs} สำหรับ {prompt or 'บรรยากาศร้าน'}",
                    'tracks': filled
                }

        # 2. Single Language Selection
        if languages and len(languages) == 1:
            only_lang = languages[0]
            if only_lang == 'korean':
                target_key = 'kpop_hits'
            elif only_lang == 'japanese':
                target_key = 'jpop_citypop'
            elif only_lang == 'chinese':
                target_key = 'cpop_mando'
            elif only_lang == 'thai':
                target_key = 'thai_chill' if vibe_intent in ('chill', 'cafe') else 'thai_genz_mala'
            else:
                target_key = 'cafe' if vibe_intent in ('chill', 'cafe') else 'beach'

            target = vibe_presets[target_key]
            filled = cls._fill_tracks_to_count(target['tracks'], count, target_key, vibe_presets, languages, vibe_intent, prompt)
            return {'setlist_title': target['title'], 'vibe_summary': target['summary'], 'tracks': filled}

        # 3. Vibe-based selection: CHILL & CAFE IS GIVEN HIGHEST PRIORITY OVER GENERIC KEYWORDS
        if vibe_intent in ('chill', 'cafe'):
            target_key = 'thai_chill' if re.search(r'[\u0e00-\u0e7f]', prompt) or 'thai' in languages else 'cafe'
        elif vibe_intent == '3cha':
            target_key = 'thai_party_3cha'
        elif vibe_intent == 'club_peak':
            target_key = 'club_peak'
        elif vibe_intent == 'beach':
            target_key = 'beach'
        elif vibe_intent == 'rooftop':
            target_key = 'rooftop'
        elif any(w in p for w in ['หมาล่า', 'ชาบู', 'หมูกระทะ', 'นักศึกษา', 'นักเรียน', 'gen z', 'gen-z', 'วัยรุ่น', 'ร้านอาหาร', 't-pop', 'tpop', 'mala']):
            target_key = 'thai_genz_mala'
        else:
            live_found = cls._search_live_online(prompt, count=count, vibe_intent=vibe_intent)
            if live_found and len(live_found) >= count:
                return {
                    'setlist_title': f"✨ เพลงที่ค้นพบ: {prompt[:30]}",
                    'vibe_summary': f"ค้นพบเพลงจริงตรงกับ '{prompt}'",
                    'tracks': live_found[:count]
                }
            target_key = 'thai_chill' if re.search(r'[\u0e00-\u0e7f]', prompt) else 'cafe'

        target = vibe_presets[target_key]
        filled = cls._fill_tracks_to_count(target['tracks'], count, target_key, vibe_presets, languages, vibe_intent, prompt)
        return {
            'setlist_title': target['title'],
            'vibe_summary': target['summary'],
            'tracks': filled
        }
