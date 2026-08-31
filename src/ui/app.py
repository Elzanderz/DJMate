# -*- coding: utf-8 -*-
import os
import sys
import threading
import subprocess
from io import BytesIO
from typing import List, Dict
import requests
from PIL import Image

import customtkinter as ctk
from tkinter import filedialog, messagebox

from ..services.spotify_service import SpotifyService
from ..services.downloader_service import DownloaderService
from ..services.dj_analyzer_service import DJAnalyzerService
from ..services.rekordbox_service import RekordboxService

# Theme Settings
ctk.set_appearance_mode('Dark')
ctk.set_default_color_theme('dark-blue')

# DJ Cyber Studio Color Palette
BG_DARK = '#0B0D14'
CARD_BG = '#141724'
CARD_HOVER = '#1B2032'
CARD_BORDER = '#252B42'
CYAN_ACCENT = '#00F2FE'
NEON_GREEN = '#10B981'
NEON_GREEN_HOVER = '#059669'
TEXT_MAIN = '#FFFFFF'
TEXT_MUTED = '#8E9BB0'

class DJTrackRow(ctk.CTkFrame):
    def __init__(self, master, track_info: Dict, on_remove, on_convert, **kwargs):
        super().__init__(master, fg_color=CARD_BG, corner_radius=10, border_width=1, border_color=CARD_BORDER, **kwargs)
        self.track_info = track_info
        self.on_remove = on_remove
        self.on_convert = on_convert

        self.grid_columnconfigure(2, weight=1)

        # 1. Cover Art Placeholder
        self.cover_label = ctk.CTkLabel(
            self, text='[DJ]', width=52, height=52,
            fg_color='#1E2337', corner_radius=8, font=('Segoe UI', 13, 'bold'), text_color=CYAN_ACCENT
        )
        self.cover_label.grid(row=0, column=0, rowspan=2, padx=(10, 12), pady=10)

        # Async cover load
        threading.Thread(target=self._load_cover, daemon=True).start()

        # 2. Track Number & Title
        title_text = track_info.get('title', 'Unknown Title')
        if len(title_text) > 36:
            title_text = title_text[:33] + '...'
        self.title_label = ctk.CTkLabel(
            self, text=title_text, font=ctk.CTkFont(size=14, weight='bold'), text_color=TEXT_MAIN, anchor='w'
        )
        self.title_label.grid(row=0, column=1, columnspan=2, sticky='w', padx=(0, 10), pady=(8, 0))

        artist_text = track_info.get('artist', 'Unknown Artist')
        if track_info.get('album'):
            artist_text += f' - ' + track_info['album']
        if len(artist_text) > 48:
            artist_text = artist_text[:45] + '...'
        self.artist_label = ctk.CTkLabel(
            self, text=artist_text, font=ctk.CTkFont(size=12), text_color=TEXT_MUTED, anchor='w'
        )
        self.artist_label.grid(row=1, column=1, columnspan=2, sticky='w', padx=(0, 10), pady=(0, 8))

        # 3. Camelot Key Badge
        camelot = track_info.get('camelot', '--')
        key_color = track_info.get('color', '#333D56')
        self.key_badge = ctk.CTkButton(
            self,
            text=f'KEY: {camelot}',
            width=78,
            height=26,
            fg_color=key_color if camelot != '--' else '#222A3F',
            text_color='#000000' if camelot != '--' else '#8E9BB0',
            font=ctk.CTkFont(size=11, weight='bold'),
            corner_radius=6,
            hover=False
        )
        self.key_badge.grid(row=0, column=3, rowspan=2, padx=(5, 8), pady=10)

        # 4. BPM Badge
        bpm_val = track_info.get('bpm')
        bpm_text = f"{float(bpm_val):.1f} BPM" if bpm_val else '--- BPM'
        self.bpm_badge = ctk.CTkButton(
            self,
            text=bpm_text,
            width=84,
            height=26,
            fg_color='#1E2337',
            text_color=CYAN_ACCENT,
            font=ctk.CTkFont(size=11, weight='bold'),
            corner_radius=6,
            hover=False
        )
        self.bpm_badge.grid(row=0, column=4, rowspan=2, padx=(0, 8), pady=10)

        # 5. Genre Badge
        genre_text = track_info.get('genre', 'Dance')
        if len(genre_text) > 14:
            genre_text = genre_text[:12] + '..'
        self.genre_badge = ctk.CTkButton(
            self,
            text=genre_text,
            width=80,
            height=26,
            fg_color='#181C2B',
            text_color='#CBD5E1',
            font=ctk.CTkFont(size=11),
            corner_radius=6,
            hover=False
        )
        self.genre_badge.grid(row=0, column=5, rowspan=2, padx=(0, 10), pady=10)

        # 6. Status & Progress
        self.status_label = ctk.CTkLabel(
            self, text='Ready', font=ctk.CTkFont(size=11), text_color=TEXT_MUTED, width=130, anchor='e'
        )
        self.status_label.grid(row=0, column=6, padx=(0, 10), pady=(8, 0), sticky='e')

        self.progress_bar = ctk.CTkProgressBar(self, width=130, height=6, progress_color=NEON_GREEN)
        self.progress_bar.set(0)
        self.progress_bar.grid(row=1, column=6, padx=(0, 10), pady=(0, 8), sticky='e')

        # 7. Action Buttons
        self.btn_convert = ctk.CTkButton(
            self, text='Convert', width=68, height=28,
            fg_color=NEON_GREEN, hover_color=NEON_GREEN_HOVER, text_color='#000000',
            font=ctk.CTkFont(size=12, weight='bold'),
            command=lambda: self.on_convert(self)
        )
        self.btn_convert.grid(row=0, column=7, rowspan=2, padx=(5, 6), pady=10)

        self.btn_remove = ctk.CTkButton(
            self, text='X', width=28, height=28,
            fg_color='#1E2337', hover_color='#552222', text_color='#FF6B6B',
            command=lambda: self.on_remove(self)
        )
        self.btn_remove.grid(row=0, column=8, rowspan=2, padx=(0, 10), pady=10)

    def _load_cover(self):
        try:
            url = self.track_info.get('cover_url')
            track_id = self.track_info.get('id')
            if not url and track_id:
                sp = SpotifyService()
                url = sp.get_track_cover(track_id)
                if url:
                    self.track_info['cover_url'] = url

            if url:
                res = requests.get(url, timeout=6)
                if res.status_code == 200:
                    img = Image.open(BytesIO(res.content)).resize((52, 52), Image.Resampling.LANCZOS)
                    ctk_img = ctk.CTkImage(light_image=img, dark_image=img, size=(52, 52))
                    self.after(0, lambda: self.cover_label.configure(image=ctk_img, text=''))
        except Exception:
            pass

    def update_dj_badges(self):
        camelot = self.track_info.get('camelot', '--')
        color = self.track_info.get('color', '#333D56')
        bpm = self.track_info.get('bpm')
        bpm_str = f"{float(bpm):.1f} BPM" if bpm else '--- BPM'
        genre = self.track_info.get('genre', 'Dance')

        self.key_badge.configure(
            text=f'KEY: {camelot}',
            fg_color=color if camelot != '--' else '#222A3F',
            text_color='#000000' if camelot != '--' else '#8E9BB0'
        )
        self.bpm_badge.configure(text=bpm_str)
        self.genre_badge.configure(text=genre[:12] if len(genre) > 14 else genre)

    def update_status(self, pct: float, text: str, color: str = None):
        def _update():
            self.progress_bar.set(pct / 100.0)
            self.status_label.configure(text=text)
            if color:
                self.status_label.configure(text_color=color)
            if self.track_info.get('camelot'):
                self.update_dj_badges()
        self.after(0, _update)

    def set_downloading(self):
        self.btn_convert.configure(state='disabled')
        self.btn_remove.configure(state='disabled')

    def set_finished(self, success: bool = True):
        self.btn_convert.configure(state='normal')
        self.btn_remove.configure(state='normal')
        if success:
            self.btn_convert.configure(text='Done', fg_color='#1E3A2F', state='disabled')
            self.update_dj_badges()


class SpotifyConverterApp(ctk.CTk):
    def __init__(self):
        super().__init__()

        self.title('Spotify DJ Converter & Harmonic Mixtape Suite (rekordbox Ready)')
        self.geometry('1080x740')
        self.minsize(960, 620)
        self.configure(fg_color=BG_DARK)

        self.spotify_service = SpotifyService()
        self.tracks_queue: List[DJTrackRow] = []
        self.output_dir = os.path.abspath(os.path.join(os.getcwd(), 'downloads'))
        self.is_converting = False

        self._build_ui()

    def _build_ui(self):
        # 1. Header Frame
        header = ctk.CTkFrame(self, fg_color='transparent')
        header.pack(fill='x', padx=24, pady=(18, 8))

        title = ctk.CTkLabel(
            header,
            text='DJ SPOTIFY HARMONIC SUITE',
            font=ctk.CTkFont(family='Segoe UI', size=22, weight='bold'),
            text_color=CYAN_ACCENT
        )
        title.pack(side='left')

        tag = ctk.CTkLabel(
            header,
            text='REKORDBOX XML • CAMELOT WHEEL • BPM & KEY DETECT • SMART MIXTAPE',
            font=ctk.CTkFont(size=11, weight='bold'),
            text_color='#059669',
            fg_color='#142620',
            corner_radius=6,
            padx=10, pady=3
        )
        tag.pack(side='left', padx=(14, 0))

        # 2. Input Box (URL / Query)
        input_frame = ctk.CTkFrame(self, fg_color=CARD_BG, corner_radius=12, border_width=1, border_color=CARD_BORDER)
        input_frame.pack(fill='x', padx=24, pady=(0, 10))

        self.url_entry = ctk.CTkEntry(
            input_frame,
            placeholder_text='Paste Spotify Track / Album / Playlist URL to analyze BPM & Keys...',
            font=ctk.CTkFont(size=13),
            height=42,
            border_width=0,
            fg_color='transparent'
        )
        self.url_entry.pack(side='left', fill='x', expand=True, padx=(15, 10), pady=8)
        self.url_entry.bind('<Return>', lambda e: self.on_add_url())

        self.btn_paste = ctk.CTkButton(
            input_frame,
            text='Paste',
            width=70,
            height=34,
            fg_color='#1E2337',
            hover_color='#2B324D',
            command=self.on_paste_clipboard
        )
        self.btn_paste.pack(side='left', padx=(0, 8), pady=8)

        self.btn_add = ctk.CTkButton(
            input_frame,
            text='+ Analyze & Add',
            width=140,
            height=34,
            fg_color=NEON_GREEN,
            hover_color=NEON_GREEN_HOVER,
            text_color='#000000',
            font=ctk.CTkFont(weight='bold'),
            command=self.on_add_url
        )
        self.btn_add.pack(side='left', padx=(0, 10), pady=8)

        # 3. DJ Control Bar (Smart Sort, Export Rekordbox, Format, Folder)
        dj_bar = ctk.CTkFrame(self, fg_color=CARD_BG, corner_radius=10, border_width=1, border_color=CARD_BORDER)
        dj_bar.pack(fill='x', padx=24, pady=(0, 10))

        # Harmonic Sort Button
        btn_harmonic = ctk.CTkButton(
            dj_bar,
            text='Harmonic Sort (Camelot)',
            width=175,
            height=32,
            fg_color='#2563EB',
            hover_color='#1D4ED8',
            font=ctk.CTkFont(size=12, weight='bold'),
            command=self.on_harmonic_sort
        )
        btn_harmonic.pack(side='left', padx=(12, 8), pady=8)

        # Export rekordbox XML
        btn_rekordbox = ctk.CTkButton(
            dj_bar,
            text='Export rekordbox XML',
            width=165,
            height=32,
            fg_color='#7C3AED',
            hover_color='#6D28D9',
            font=ctk.CTkFont(size=12, weight='bold'),
            command=self.on_export_rekordbox
        )
        btn_rekordbox.pack(side='left', padx=(0, 8), pady=8)

        # Export M3U8 Playlist
        btn_m3u8 = ctk.CTkButton(
            dj_bar,
            text='Export M3U8',
            width=105,
            height=32,
            fg_color='#1E2337',
            hover_color='#2B324D',
            font=ctk.CTkFont(size=12, weight='bold'),
            command=self.on_export_m3u8
        )
        btn_m3u8.pack(side='left', padx=(0, 15), pady=8)

        # Format
        lbl_format = ctk.CTkLabel(dj_bar, text='Format:', font=ctk.CTkFont(size=12, weight='bold'), text_color=TEXT_MUTED)
        lbl_format.pack(side='left', padx=(0, 6), pady=8)

        self.format_menu = ctk.CTkOptionMenu(
            dj_bar,
            values=['MP3', 'FLAC', 'M4A', 'WAV'],
            width=85,
            height=30,
            fg_color='#1E2337',
            button_color='#2B324D',
            command=self._on_format_change
        )
        self.format_menu.set('MP3')
        self.format_menu.pack(side='left', padx=(0, 10), pady=8)

        # Bitrate
        self.quality_menu = ctk.CTkOptionMenu(
            dj_bar,
            values=['320 kbps (Best)', '256 kbps (High)', '192 kbps (Medium)', '128 kbps (Standard)'],
            width=140,
            height=30,
            fg_color='#1E2337',
            button_color='#2B324D'
        )
        self.quality_menu.set('320 kbps (Best)')
        self.quality_menu.pack(side='left', padx=(0, 12), pady=8)

        # Folder Buttons
        btn_open = ctk.CTkButton(
            dj_bar,
            text='Open Folder',
            width=90,
            height=30,
            fg_color='#1E2337',
            hover_color='#2B324D',
            command=self.on_open_folder
        )
        btn_open.pack(side='right', padx=(0, 10), pady=8)

        btn_browse = ctk.CTkButton(
            dj_bar,
            text='Save Path...',
            width=85,
            height=30,
            fg_color='#1E2337',
            hover_color='#2B324D',
            command=self.on_browse_folder
        )
        btn_browse.pack(side='right', padx=(0, 6), pady=8)

        # 4. Main Scrollable List Frame
        self.queue_scroll = ctk.CTkScrollableFrame(self, fg_color='transparent')
        self.queue_scroll.pack(fill='both', expand=True, padx=24, pady=(0, 10))

        self.empty_label = ctk.CTkLabel(
            self.queue_scroll,
            text='Paste a Spotify Playlist / Track URL to begin DJ & Camelot Key Analysis',
            font=ctk.CTkFont(size=15),
            text_color='#4E5A78'
        )
        self.empty_label.pack(pady=120)

        # 5. Bottom Action Bar
        bottom_bar = ctk.CTkFrame(self, fg_color=CARD_BG, corner_radius=12, border_width=1, border_color=CARD_BORDER)
        bottom_bar.pack(fill='x', padx=24, pady=(0, 18))

        self.lbl_queue_count = ctk.CTkLabel(
            bottom_bar,
            text='DJ Queue: 0 tracks',
            font=ctk.CTkFont(size=13, weight='bold'),
            text_color=TEXT_MUTED
        )
        self.lbl_queue_count.pack(side='left', padx=20, pady=12)

        self.btn_clear = ctk.CTkButton(
            bottom_bar,
            text='Clear Queue',
            width=100,
            height=34,
            fg_color='#1E2337',
            hover_color='#4E2222',
            command=self.on_clear_queue
        )
        self.btn_clear.pack(side='left', padx=(0, 15), pady=12)

        self.btn_convert_all = ctk.CTkButton(
            bottom_bar,
            text='⚡ Convert & Analyze All for rekordbox',
            width=260,
            height=40,
            fg_color=NEON_GREEN,
            hover_color=NEON_GREEN_HOVER,
            text_color='#000000',
            font=ctk.CTkFont(size=14, weight='bold'),
            command=self.on_convert_all
        )
        self.btn_convert_all.pack(side='right', padx=20, pady=10)

    def _on_format_change(self, choice: str):
        if choice == 'MP3':
            self.quality_menu.pack(side='left', padx=(0, 12), pady=8)
        else:
            self.quality_menu.pack_forget()

    def on_paste_clipboard(self):
        try:
            clipboard = self.clipboard_get()
            self.url_entry.delete(0, 'end')
            self.url_entry.insert(0, clipboard.strip())
        except Exception:
            pass

    def on_browse_folder(self):
        selected = filedialog.askdirectory(initialdir=self.output_dir)
        if selected:
            self.output_dir = selected

    def on_open_folder(self):
        os.makedirs(self.output_dir, exist_ok=True)
        if sys.platform == 'win32':
            os.startfile(self.output_dir)
        else:
            subprocess.run(['open' if sys.platform == 'darwin' else 'xdg-open', self.output_dir])

    def on_add_url(self):
        url = self.url_entry.get().strip()
        if not url:
            return

        self.btn_add.configure(state='disabled', text='Analyzing...')
        threading.Thread(target=self._async_fetch_metadata, args=(url,), daemon=True).start()

    def _async_fetch_metadata(self, url: str):
        try:
            tracks = self.spotify_service.get_info(url)
            self.after(0, lambda: self._add_tracks_to_ui(tracks))
        except Exception as e:
            self.after(0, lambda: messagebox.showerror('Error', f'Failed to fetch metadata: {str(e)}'))
        finally:
            self.after(0, lambda: self.btn_add.configure(state='normal', text='+ Analyze & Add'))
            self.after(0, lambda: self.url_entry.delete(0, 'end'))

    def _add_tracks_to_ui(self, tracks: List[Dict]):
        if self.empty_label.winfo_exists():
            self.empty_label.pack_forget()

        for t in tracks:
            row = DJTrackRow(
                self.queue_scroll,
                track_info=t,
                on_remove=self.remove_track_row,
                on_convert=self.convert_single_track
            )
            row.pack(fill='x', pady=4)
            self.tracks_queue.append(row)

        self._update_queue_counter()

    def remove_track_row(self, row: DJTrackRow):
        if row in self.tracks_queue:
            self.tracks_queue.remove(row)
            row.destroy()
        self._update_queue_counter()
        if not self.tracks_queue:
            self.empty_label.pack(pady=120)

    def on_clear_queue(self):
        if self.is_converting:
            messagebox.showwarning('Warning', 'Conversion in progress. Please wait until finished.')
            return
        for row in self.tracks_queue:
            row.destroy()
        self.tracks_queue.clear()
        self._update_queue_counter()
        self.empty_label.pack(pady=120)

    def _update_queue_counter(self):
        count = len(self.tracks_queue)
        self.lbl_queue_count.configure(text=f'DJ Queue: {count} tracks' if count != 1 else 'DJ Queue: 1 track')

    def on_harmonic_sort(self):
        if len(self.tracks_queue) <= 1:
            return

        tracks_data = [row.track_info for row in self.tracks_queue]
        sorted_data = DJAnalyzerService.smart_harmonic_sort(tracks_data)

        # Clear UI rows and re-add in sorted harmonic order
        for row in self.tracks_queue:
            row.destroy()
        self.tracks_queue.clear()

        self._add_tracks_to_ui(sorted_data)
        messagebox.showinfo('Harmonic Sort', 'Tracks sorted by Camelot Wheel & BPM for smooth DJ transitions!')

    def on_export_rekordbox(self):
        if not self.tracks_queue:
            messagebox.showinfo('Info', 'Queue is empty. Please add songs first.')
            return

        file_path = filedialog.asksaveasfilename(
            defaultextension='.xml',
            filetypes=[('rekordbox XML', '*.xml')],
            initialfile='rekordbox_spotify_dj_set.xml',
            initialdir=self.output_dir
        )
        if not file_path:
            return

        tracks_data = [row.track_info for row in self.tracks_queue]
        RekordboxService.export_rekordbox_xml(tracks_data, file_path)
        messagebox.showinfo('rekordbox Export', f'rekordbox XML exported successfully to:\n{file_path}\n\nImport into rekordbox via File -> Import -> Import rekordbox XML')

    def on_export_m3u8(self):
        if not self.tracks_queue:
            messagebox.showinfo('Info', 'Queue is empty. Please add songs first.')
            return

        file_path = filedialog.asksaveasfilename(
            defaultextension='.m3u8',
            filetypes=[('M3U8 Playlist', '*.m3u8')],
            initialfile='spotify_dj_mixtape.m3u8',
            initialdir=self.output_dir
        )
        if not file_path:
            return

        tracks_data = [row.track_info for row in self.tracks_queue]
        RekordboxService.export_m3u8(tracks_data, file_path)
        messagebox.showinfo('M3U8 Export', f'DJ Playlist exported successfully to:\n{file_path}')

    def _get_selected_format_and_quality(self):
        fmt = self.format_menu.get().lower()
        quality_str = self.quality_menu.get()
        kbps = '320'
        if '256' in quality_str:
            kbps = '256'
        elif '192' in quality_str:
            kbps = '192'
        elif '128' in quality_str:
            kbps = '128'
        return fmt, kbps

    def convert_single_track(self, row: DJTrackRow):
        fmt, quality = self._get_selected_format_and_quality()
        row.set_downloading()
        threading.Thread(target=self._run_conversion, args=([row], fmt, quality), daemon=True).start()

    def on_convert_all(self):
        if self.is_converting:
            return
        if not self.tracks_queue:
            messagebox.showinfo('Info', 'Queue is empty. Please add songs first.')
            return

        fmt, quality = self._get_selected_format_and_quality()
        self.is_converting = True
        self.btn_convert_all.configure(state='disabled', text='Analyzing & Converting...')
        self.btn_clear.configure(state='disabled')

        threading.Thread(target=self._run_batch_conversion, args=(list(self.tracks_queue), fmt, quality), daemon=True).start()

    def _run_conversion(self, rows: List[DJTrackRow], audio_format: str, quality: str):
        for row in rows:
            row.set_downloading()
            try:
                DownloaderService.download_track(
                    track_info=row.track_info,
                    output_dir=self.output_dir,
                    audio_format=audio_format,
                    audio_quality=quality,
                    progress_callback=row.update_status
                )
                row.set_finished(True)
            except Exception as e:
                row.update_status(0.0, 'Failed', color='#FF6B6B')
                row.set_finished(False)

    def _run_batch_conversion(self, rows: List[DJTrackRow], audio_format: str, quality: str):
        self._run_conversion(rows, audio_format, quality)
        self.is_converting = False
        self.after(0, lambda: self.btn_convert_all.configure(state='normal', text='⚡ Convert & Analyze All for rekordbox'))
        self.after(0, lambda: self.btn_clear.configure(state='normal'))
        self.after(0, lambda: messagebox.showinfo('Finished', 'All DJ tracks downloaded, analyzed for Camelot Keys/BPM, and tagged!'))