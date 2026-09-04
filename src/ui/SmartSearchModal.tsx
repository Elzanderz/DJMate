import React, { useState, useEffect, useRef } from 'react';
import { CamelotBadge } from '../App';

export interface SmartSearchTrack {
  id: string;
  title: string;
  artist: string;
  album?: string;
  duration_ms?: number;
  cover_url?: string;
  preview_url?: string;
  youtube_url?: string;
  year?: string;
  genre?: string;
  bpm?: number;
  camelot?: string;
  key_name?: string;
  playlist_name?: string;
  filepath?: string;
  existing_filepath?: string;
  is_local?: boolean;
  is_already_downloaded?: boolean;
  source?: string;
  search_query?: string;
  search_score?: number;
  raw_source?: string;
}

interface SmartSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialQuery?: string;
  invokeBackend: (command: string, args?: any) => Promise<any>;
  onAddTracksToQueue: (tracks: any[]) => void;
  onPlayTrack?: (track: any) => void;
  onOpenFolder?: (path?: string) => void;
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

export const SmartSearchModal: React.FC<SmartSearchModalProps> = ({
  isOpen,
  onClose,
  initialQuery = '',
  invokeBackend,
  onAddTracksToQueue,
  onPlayTrack,
  onOpenFolder,
  showToast
}) => {
  const [query, setQuery] = useState(initialQuery);
  const [activeSearchTab, setActiveSearchTab] = useState<'local' | 'online'>('local');
  const [isLoading, setIsLoading] = useState(false);
  const [localResults, setLocalResults] = useState<SmartSearchTrack[]>([]);
  const [onlineResults, setOnlineResults] = useState<SmartSearchTrack[]>([]);
  const [selectedOnlineIds, setSelectedOnlineIds] = useState<Set<string>>(new Set());
  const [previewAudioUrl, setPreviewAudioUrl] = useState<string | null>(null);
  const [playingTrackId, setPlayingTrackId] = useState<string | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery(initialQuery);
      setTimeout(() => {
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }, 100);
      if (initialQuery.trim()) {
        performSearch(initialQuery.trim());
      } else {
        // Load initial local library list
        performLocalOnlySearch('');
      }
    } else {
      stopPreview();
    }
  }, [isOpen, initialQuery]);

  const stopPreview = () => {
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      audioPlayerRef.current.src = '';
    }
    setPreviewAudioUrl(null);
    setPlayingTrackId(null);
  };

  const handleTogglePlayPreview = async (track: SmartSearchTrack) => {
    if (playingTrackId === track.id) {
      stopPreview();
      return;
    }

    stopPreview();

    // 1. If it's a local track with filepath
    if (track.filepath || track.existing_filepath) {
      const targetPath = track.filepath || track.existing_filepath;
      try {
        const dataUrl = await invokeBackend('get_audio_data_url', { filepath: targetPath });
        if (dataUrl) {
          if (!audioPlayerRef.current) {
            audioPlayerRef.current = new Audio();
          }
          audioPlayerRef.current.src = dataUrl;
          audioPlayerRef.current.play();
          setPlayingTrackId(track.id);
          setPreviewAudioUrl(dataUrl);
          audioPlayerRef.current.onended = () => stopPreview();
          return;
        }
      } catch (err) {
        console.warn('Local preview error:', err);
      }
    }

    // 2. If it has a remote 30s preview URL (e.g. from Deezer / iTunes)
    if (track.preview_url) {
      if (!audioPlayerRef.current) {
        audioPlayerRef.current = new Audio();
      }
      audioPlayerRef.current.src = track.preview_url;
      audioPlayerRef.current.play();
      setPlayingTrackId(track.id);
      setPreviewAudioUrl(track.preview_url);
      audioPlayerRef.current.onended = () => stopPreview();
      return;
    }

    // 3. Fallback: trigger parent player if available
    if (onPlayTrack && (track.filepath || track.existing_filepath)) {
      onPlayTrack(track);
    } else {
      showToast('ไม่มีตัวอย่างเสียงสำหรับเพลงนี้ (ดาวน์โหลดเพื่อฟังฉบับเต็ม)', 'info');
    }
  };

  const performLocalOnlySearch = async (q: string) => {
    try {
      const res: SmartSearchTrack[] = await invokeBackend('search_local_folder', { query: q });
      setLocalResults(res || []);
    } catch (e) {
      console.warn('Local search error:', e);
    }
  };

  const performSearch = async (searchQ: string) => {
    const q = (searchQ || '').trim();
    if (!q) {
      performLocalOnlySearch('');
      return;
    }
    setIsLoading(true);
    try {
      let local: SmartSearchTrack[] = [];
      let online: SmartSearchTrack[] = [];

      try {
        const res = await invokeBackend('search_music_unified', { query: q });
        local = res?.local_results || [];
        online = res?.online_results || [];
      } catch (bridgeErr) {
        console.warn('Unified search bridge error, trying separate fallbacks:', bridgeErr);
        try {
          const [locRes, onRes] = await Promise.allSettled([
            invokeBackend('search_local_folder', { query: q }),
            invokeBackend('search_online_tracks', { query: q, limit: 12 })
          ]);
          if (locRes.status === 'fulfilled' && Array.isArray(locRes.value)) {
            local = locRes.value;
          }
          if (onRes.status === 'fulfilled' && Array.isArray(onRes.value)) {
            online = onRes.value;
          }
        } catch (subErr) {
          console.error('Fallback search failed:', subErr);
        }
      }

      setLocalResults(local);
      setOnlineResults(online);

      // Auto switch to tab with results
      if (local.length === 0 && online.length > 0) {
        setActiveSearchTab('online');
      } else if (local.length > 0 && online.length === 0) {
        setActiveSearchTab('local');
      } else if (online.length > 0 && activeSearchTab === 'online') {
        setActiveSearchTab('online');
      }
    } catch (err: any) {
      showToast('เกิดข้อผิดพลาดในการค้นหา: ' + (err?.message || err), 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      performSearch(query);
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  const handleAddSingleToQueue = (track: SmartSearchTrack) => {
    const formattedTrack = {
      id: track.id || `track_${Date.now()}`,
      title: track.title,
      artist: track.artist || '',
      album: track.album || '',
      source: track.source || 'Search',
      duration_ms: track.duration_ms || 0,
      cover_url: track.cover_url || '',
      year: track.year || '',
      bpm: track.bpm,
      camelot: track.camelot,
      key_name: track.key_name,
      playlist_name: track.playlist_name || 'Downloaded',
      search_query: track.search_query || `${track.artist} - ${track.title}`.trim(),
      is_already_downloaded: track.is_already_downloaded || false,
      filepath: track.filepath || track.existing_filepath,
      done: track.is_already_downloaded || false,
      statusText: track.is_already_downloaded ? 'Already in Library' : 'Ready'
    };

    onAddTracksToQueue([formattedTrack]);
    showToast(`เพิ่ม "${track.title}" เข้าคิวเรียบร้อยแล้ว`, 'success');
  };

  const handleAddSelectedToQueue = () => {
    const toAdd = onlineResults.filter((t) => selectedOnlineIds.has(t.id));
    if (toAdd.length === 0) return;

    const formattedList = toAdd.map((track) => ({
      id: track.id || `track_${Date.now()}_${Math.random()}`,
      title: track.title,
      artist: track.artist || '',
      album: track.album || '',
      source: track.source || 'Search',
      duration_ms: track.duration_ms || 0,
      cover_url: track.cover_url || '',
      year: track.year || '',
      bpm: track.bpm,
      camelot: track.camelot,
      key_name: track.key_name,
      playlist_name: 'Downloaded',
      search_query: track.search_query || `${track.artist} - ${track.title}`.trim(),
      is_already_downloaded: track.is_already_downloaded || false,
      filepath: track.filepath || track.existing_filepath,
      done: track.is_already_downloaded || false,
      statusText: track.is_already_downloaded ? 'Already in Library' : 'Ready'
    }));

    onAddTracksToQueue(formattedList);
    showToast(`เพิ่ม ${formattedList.length} เพลงเข้าคิวเรียบร้อยแล้ว`, 'success');
    setSelectedOnlineIds(new Set());
    onClose();
  };

  const handleSelectAllNonDuplicates = () => {
    const nonDups = onlineResults.filter((t) => !t.is_already_downloaded);
    const newSet = new Set<string>();
    nonDups.forEach((t) => newSet.add(t.id));
    setSelectedOnlineIds(newSet);
    showToast(`เลือก ${nonDups.length} เพลงที่ยังไม่มีในเครื่อง`, 'info');
  };

  const toggleSelectTrack = (id: string) => {
    setSelectedOnlineIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const formatDuration = (ms?: number) => {
    if (!ms || ms <= 0) return '--:--';
    const totalSecs = Math.floor(ms / 1000);
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-[#121216] border border-white/10 rounded-3xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden font-sans">
        
        {/* Modal Header & Search Bar */}
        <div className="p-6 border-b border-white/10 bg-[#17171d]/90">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <div>
                <h2 className="text-base font-extrabold text-white tracking-tight flex items-center gap-2">
                  <span>Smart Music Search</span>
                  <span className="text-[10px] font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2 py-0.5 rounded-full">
                    ภาษาไทย & สากล
                  </span>
                </h2>
                <p className="text-xs text-zinc-400">ค้นหาเพลงในเครื่องแบบอัจฉริยะ และค้นหาจากแหล่งออนไลน์พร้อมตรวจจับเพลงซ้ำ</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white flex items-center justify-center transition"
            >
              ✕
            </button>
          </div>

          {/* Search Input Box */}
          <div className="relative flex items-center gap-2">
            <div className="relative flex-1">
              <div className="absolute left-3.5 top-3 text-zinc-400">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <input
                ref={searchInputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="พิมพ์ชื่อเพลง, ศิลปิน, DJ Edit, SoundCloud Remix เช่น Fred again, Skrillex, EDM Bootleg..."
                className="w-full bg-[#0d0d11] text-white text-sm pl-10 pr-10 py-3 rounded-2xl border border-white/10 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition shadow-inner font-medium placeholder:text-zinc-500"
              />
              {query && (
                <button
                  onClick={() => {
                    setQuery('');
                    performLocalOnlySearch('');
                  }}
                  className="absolute right-3.5 top-3 text-zinc-500 hover:text-white text-xs p-1"
                >
                  ✕
                </button>
              )}
            </div>
            <button
              disabled={isLoading}
              onClick={() => performSearch(query)}
              className="px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold text-xs rounded-2xl shadow-lg transition disabled:opacity-50 flex items-center gap-2"
            >
              {isLoading && <span className="animate-spin text-xs">↻</span>}
              <span>{isLoading ? 'กำลังค้นหา...' : 'ค้นหา'}</span>
            </button>
          </div>

          {/* Quick Search Chips */}
          <div className="flex items-center gap-1.5 mt-3 overflow-x-auto pb-1 text-xs no-scrollbar">
            <span className="text-zinc-500 text-[11px] mr-1 whitespace-nowrap">ตัวอย่าง:</span>
            {['โต๊ะริม', 'วัดใจ', 'Three Man Down', 'Silly Fools', 'ทรงอย่างแบด', '128 BPM', '8A'].map((tag) => (
              <button
                key={tag}
                onClick={() => {
                  setQuery(tag);
                  performSearch(tag);
                }}
                className="px-2.5 py-1 bg-white/5 hover:bg-white/10 hover:text-white text-zinc-400 rounded-lg text-[11px] transition whitespace-nowrap border border-white/5"
              >
                {tag}
              </button>
            ))}
          </div>
        </div>

        {/* Tab Selector Bar */}
        <div className="flex items-center justify-between px-6 py-3 bg-[#141419] border-b border-white/5 text-xs">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveSearchTab('local')}
              className={`px-4 py-2 rounded-xl font-bold transition flex items-center gap-2 ${
                activeSearchTab === 'local'
                  ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/40 shadow'
                  : 'text-zinc-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <span>📁 เพลงในโฟลเดอร์เครื่อง</span>
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono ${
                activeSearchTab === 'local' ? 'bg-indigo-500 text-white' : 'bg-white/10 text-zinc-400'
              }`}>
                {localResults.length}
              </span>
            </button>

            <button
              onClick={() => setActiveSearchTab('online')}
              className={`px-4 py-2 rounded-xl font-bold transition flex items-center gap-2 ${
                activeSearchTab === 'online'
                  ? 'bg-purple-600/20 text-purple-400 border border-purple-500/40 shadow'
                  : 'text-zinc-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <span>🌐 ค้นหาออนไลน์เพื่อดาวน์โหลด</span>
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono ${
                activeSearchTab === 'online' ? 'bg-purple-500 text-white' : 'bg-white/10 text-zinc-400'
              }`}>
                {onlineResults.length}
              </span>
            </button>
          </div>

          {activeSearchTab === 'online' && onlineResults.length > 0 && (
            <div className="flex items-center gap-2">
              <button
                onClick={handleSelectAllNonDuplicates}
                className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white rounded-lg text-xs transition border border-white/10"
              >
                เลือกเฉพาะที่ยังไม่มี ({onlineResults.filter((t) => !t.is_already_downloaded).length})
              </button>
              {selectedOnlineIds.size > 0 && (
                <button
                  onClick={handleAddSelectedToQueue}
                  className="px-3.5 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold rounded-lg text-xs transition shadow-lg flex items-center gap-1.5"
                >
                  <span>+ เพิ่ม {selectedOnlineIds.size} เพลงเข้าคิว</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Results Container */}
        <div className="flex-1 overflow-y-auto p-6 space-y-2.5 custom-scrollbar">
          
          {/* TAB 1: LOCAL RESULTS */}
          {activeSearchTab === 'local' && (
            <div>
              {localResults.length === 0 ? (
                <div className="text-center py-16 text-zinc-500">
                  <div className="text-4xl mb-3">📂</div>
                  <div className="text-sm font-semibold text-zinc-300">ไม่พบเพลงในโฟลเดอร์เครื่องที่ตรงกับคำค้นหา</div>
                  <div className="text-xs text-zinc-500 mt-1">ลองเปลี่ยนคำค้นหา หรือสลับไปที่แท็บ "ค้นหาออนไลน์เพื่อดาวน์โหลด"</div>
                </div>
              ) : (
                <div className="space-y-2">
                  {localResults.map((t) => {
                    const isPlaying = playingTrackId === t.id;
                    return (
                      <div
                        key={t.id}
                        className="group flex items-center justify-between p-3 rounded-2xl bg-[#17171d]/60 hover:bg-[#1f1f27] border border-white/5 hover:border-indigo-500/30 transition shadow-sm"
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          {/* Cover Art & Play Overlay */}
                          <div className="relative w-12 h-12 rounded-xl bg-black/40 overflow-hidden shrink-0 border border-white/10">
                            {t.cover_url ? (
                              <img src={t.cover_url} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-zinc-600 text-lg">🎵</div>
                            )}
                            <button
                              onClick={() => handleTogglePlayPreview(t)}
                              className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-xs transition"
                            >
                              {isPlaying ? '⏸' : '▶'}
                            </button>
                          </div>

                          {/* Song Info */}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <h4 className="text-xs font-bold text-white truncate group-hover:text-indigo-300 transition">
                                {t.title}
                              </h4>
                              {t.playlist_name && (
                                <span className="text-[10px] bg-white/5 text-zinc-400 px-2 py-0.5 rounded-md border border-white/5 truncate max-w-[120px]">
                                  📁 {t.playlist_name}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-[11px] text-zinc-400 mt-0.5">
                              <span className="truncate">{t.artist || 'Unknown Artist'}</span>
                              {t.album && <span className="text-zinc-600">•</span>}
                              {t.album && <span className="truncate text-zinc-500">{t.album}</span>}
                            </div>
                          </div>

                          {/* DJ Badges: Camelot, BPM, Genre */}
                          <div className="hidden sm:flex items-center gap-2 shrink-0">
                            {t.camelot && (
                              <CamelotBadge
                                camelotKey={t.camelot}
                                keyName={t.key_name}
                                showHarmonicTag={false}
                              />
                            )}
                            {t.bpm && (
                              <span className="text-[10px] font-mono text-zinc-300 bg-white/5 px-2 py-0.5 rounded border border-white/5 font-semibold">
                                {Math.round(t.bpm)} BPM
                              </span>
                            )}
                            <span className="text-[11px] text-zinc-500 font-mono">
                              {formatDuration(t.duration_ms)}
                            </span>
                          </div>
                        </div>

                        {/* Local Actions */}
                        <div className="flex items-center gap-2 shrink-0 ml-4">
                          <button
                            onClick={() => handleTogglePlayPreview(t)}
                            className={`p-2 rounded-xl text-xs font-semibold transition ${
                              isPlaying
                                ? 'bg-indigo-600 text-white'
                                : 'bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white'
                            }`}
                            title="ฟังเพลง"
                          >
                            {isPlaying ? '⏸ หยุด' : '▶ ฟัง'}
                          </button>

                          {onOpenFolder && t.filepath && (
                            <button
                              onClick={() => onOpenFolder(t.filepath)}
                              className="p-2 bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white rounded-xl text-xs transition"
                              title="เปิดโฟลเดอร์ตำแหน่งไฟล์"
                            >
                              📂
                            </button>
                          )}

                          <button
                            onClick={() => handleAddSingleToQueue(t)}
                            className="px-3 py-2 bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 hover:text-white rounded-xl text-xs font-bold transition border border-indigo-500/30"
                            title="ส่งเข้าคิวแปลงไฟล์"
                          >
                            + เข้าคิว
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: ONLINE RESULTS WITH DUPLICATE CHECK */}
          {activeSearchTab === 'online' && (
            <div>
              {onlineResults.length === 0 ? (
                <div className="text-center py-16 text-zinc-500">
                  <div className="text-4xl mb-3">🌐</div>
                  <div className="text-sm font-semibold text-zinc-300">
                    {isLoading ? 'กำลังค้นหาเพลงออนไลน์...' : 'พิมพ์คำค้นหาและกดค้นหาเพื่อดึงเพลงจาก Apple Music / Deezer / YouTube'}
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {onlineResults.map((t) => {
                    const isSelected = selectedOnlineIds.has(t.id);
                    const isPlaying = playingTrackId === t.id;
                    const isDuplicate = !!t.is_already_downloaded;

                    return (
                      <div
                        key={t.id}
                        onClick={() => toggleSelectTrack(t.id)}
                        className={`group flex items-center justify-between p-3 rounded-2xl border transition shadow-sm cursor-pointer ${
                          isSelected
                            ? 'bg-purple-900/20 border-purple-500/50'
                            : isDuplicate
                            ? 'bg-[#151a17]/70 border-emerald-900/30 hover:border-emerald-500/40'
                            : 'bg-[#17171d]/60 hover:bg-[#1f1f27] border-white/5 hover:border-purple-500/30'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          {/* Checkbox */}
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectTrack(t.id)}
                            onClick={(e) => e.stopPropagation()}
                            className="w-4 h-4 rounded accent-purple-500 cursor-pointer"
                          />

                          {/* Cover Art & Preview Button */}
                          <div className="relative w-12 h-12 rounded-xl bg-black/40 overflow-hidden shrink-0 border border-white/10">
                            {t.cover_url ? (
                              <img src={t.cover_url} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-zinc-600 text-lg">🌐</div>
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleTogglePlayPreview(t);
                              }}
                              className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-xs transition"
                            >
                              {isPlaying ? '⏸' : '▶'}
                            </button>
                          </div>

                          {/* Track Details */}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <h4 className="text-xs font-bold text-white truncate group-hover:text-purple-300 transition">
                                {t.title}
                              </h4>
                              
                              {/* Source Badge */}
                              <span className={`text-[10px] px-1.5 py-0.5 rounded border shrink-0 ${
                                t.source === 'SoundCloud'
                                  ? 'bg-[#ff5500]/15 text-[#ff7733] border-[#ff5500]/30 font-semibold'
                                  : t.source === 'Bandcamp'
                                  ? 'bg-[#1da0c3]/15 text-[#3ac4e8] border-[#1da0c3]/30 font-semibold'
                                  : t.source === 'Beatport'
                                  ? 'bg-[#01ff95]/15 text-[#01ff95] border-[#01ff95]/30 font-semibold'
                                  : t.source === 'Deezer'
                                  ? 'bg-purple-500/15 text-purple-300 border-purple-500/30'
                                  : 'bg-white/5 text-zinc-400 border-white/5'
                              }`}>
                                {t.source || 'Online'}
                              </span>

                              {/* DUPLICATE STATUS BADGE */}
                              {isDuplicate && (
                                <span className="text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0 animate-in fade-in">
                                  <span>✓</span>
                                  <span>มีในเครื่องแล้ว</span>
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-2 text-[11px] text-zinc-400 mt-0.5">
                              <span className="truncate font-medium">{t.artist || 'Unknown Artist'}</span>
                              {t.album && <span className="text-zinc-600">•</span>}
                              {t.album && <span className="truncate text-zinc-500">{t.album}</span>}
                              {t.year && <span className="text-zinc-600">• {t.year}</span>}
                            </div>
                          </div>

                          {/* Duration */}
                          <div className="hidden sm:block text-[11px] text-zinc-500 font-mono shrink-0 mr-2">
                            {formatDuration(t.duration_ms)}
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2 shrink-0 ml-3" onClick={(e) => e.stopPropagation()}>
                          {/* Play / Preview Button */}
                          <button
                            onClick={() => handleTogglePlayPreview(t)}
                            className={`p-2 rounded-xl text-xs font-semibold transition ${
                              isPlaying
                                ? 'bg-purple-600 text-white'
                                : 'bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white'
                            }`}
                            title={isDuplicate ? 'ฟังเพลงในเครื่อง' : 'ฟังตัวอย่าง'}
                          >
                            {isPlaying ? '⏸ หยุด' : '▶ ฟัง'}
                          </button>

                          {/* If duplicate: Option to open folder or re-queue */}
                          {isDuplicate ? (
                            <div className="flex items-center gap-1.5">
                              {onOpenFolder && t.existing_filepath && (
                                <button
                                  onClick={() => onOpenFolder(t.existing_filepath)}
                                  className="p-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 rounded-xl text-xs transition border border-emerald-500/20"
                                  title="เปิดดูไฟล์ในเครื่อง"
                                >
                                  📂 ดูไฟล์
                                </button>
                              )}
                              <button
                                onClick={() => handleAddSingleToQueue(t)}
                                className="px-2.5 py-2 bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white rounded-xl text-xs transition"
                                title="เพิ่มเข้าคิวอีกครั้ง"
                              >
                                โหลดซ้ำ
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => handleAddSingleToQueue(t)}
                              className="px-3.5 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold rounded-xl text-xs transition shadow-md flex items-center gap-1"
                            >
                              <span>+ เพิ่มเข้าคิว</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-[#141419] border-t border-white/5 flex items-center justify-between text-xs text-zinc-400">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>
              <span>ระบบตรวจจับเพลงซ้ำอัตโนมัติเปิดใช้งานอยู่</span>
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white rounded-xl font-semibold transition"
            >
              ปิดหน้าต่าง
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
