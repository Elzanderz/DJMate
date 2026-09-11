import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Radio,
  Sparkles,
  Copy,
  Check,
  Play,
  Pause,
  SlidersHorizontal,
  ExternalLink,
  Minimize2,
  Maximize2,
  RefreshCw,
  Search,
  Disc3,
  Flame,
  Music2,
  X,
} from 'lucide-react';

interface RecommendedTrack {
  id?: string;
  title: string;
  artist?: string;
  bpm?: number;
  camelot?: string;
  key_name?: string;
  energy?: number;
  stars?: number;
  filepath?: string;
  cover_url?: string;
  copilot_score: number;
  harmonic_info: {
    score: number;
    badge: string;
    type: string;
    color: string;
    description: string;
  };
  bpm_info: {
    score: number;
    diff: number;
    diff_pct: number;
    label: string;
    quality: string;
    half_double: boolean;
  };
  mix_tip?: string;
}

interface LiveCopilotModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentTrack: any | null;
  libraryTracks: any[];
  onPlayTrack: (track: any) => void;
  activePlayingTrack: any | null;
  isPlaying: boolean;
  invokeBackend: (command: string, args?: any) => Promise<any>;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const LiveCopilotModal: React.FC<LiveCopilotModalProps> = ({
  isOpen,
  onClose,
  currentTrack,
  libraryTracks,
  onPlayTrack,
  activePlayingTrack,
  isPlaying,
  invokeBackend,
  showToast,
}) => {
  const [isMiniMode, setIsMiniMode] = useState<boolean>(false);
  const [filterMode, setFilterMode] = useState<'all' | 'exact' | 'lift' | 'boost' | 'relative' | 'tight_bpm'>('all');
  const [recommendations, setRecommendations] = useState<RecommendedTrack[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [referenceTrack, setReferenceTrack] = useState<any | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [autoDetectSoftware, setAutoDetectSoftware] = useState<boolean>(true);
  const [detectedSoftware, setDetectedSoftware] = useState<string | null>(null);
  const [localLib, setLocalLib] = useState<any[]>(libraryTracks || []);
  const [isPickerOpen, setIsPickerOpen] = useState<boolean>(false);
  const [pickerSearch, setPickerSearch] = useState<string>('');

  // Fetch library history if libraryTracks was empty
  useEffect(() => {
    if (libraryTracks && libraryTracks.length > 0) {
      setLocalLib(libraryTracks);
    } else {
      invokeBackend('get_history').then((hist: any) => {
        if (Array.isArray(hist) && hist.length > 0) {
          setLocalLib(hist);
          if (!referenceTrack) setReferenceTrack(hist[0]);
        }
      }).catch((e) => console.warn('get_history in copilot failed:', e));
    }
  }, [libraryTracks, isOpen, invokeBackend]);

  // Sync reference track with currentTrack or activePlayingTrack
  useEffect(() => {
    if (!referenceTrack) {
      if (activePlayingTrack) {
        setReferenceTrack(activePlayingTrack);
      } else if (currentTrack) {
        setReferenceTrack(currentTrack);
      } else if (localLib.length > 0) {
        setReferenceTrack(localLib[0]);
      }
    }
  }, [currentTrack, activePlayingTrack, localLib]);

  // Check live DJ software (Serato / Rekordbox) periodically if enabled
  useEffect(() => {
    if (!isOpen || !autoDetectSoftware) return;

    const checkLiveTrack = async () => {
      try {
        const res = await invokeBackend('get_live_dj_track');
        if (res && res.result && res.result.found && res.result.track) {
          const live = res.result.track;
          setDetectedSoftware(live.software || 'DJ Software');
          // Find matching track in library if available
          const matchInLib = localLib.find(
            (t) =>
              t.title.toLowerCase().includes(live.title.toLowerCase()) ||
              live.title.toLowerCase().includes(t.title.toLowerCase())
          );
          if (matchInLib) {
            setReferenceTrack(matchInLib);
          } else {
            setReferenceTrack({
              title: live.title,
              artist: live.artist || 'Live Deck',
              bpm: live.bpm || 128,
              camelot: live.camelot || '8A',
              source: live.software,
            });
          }
        }
      } catch (e) {
        // Silent poll error
      }
    };

    checkLiveTrack();
    const interval = setInterval(checkLiveTrack, 5000);
    return () => clearInterval(interval);
  }, [isOpen, autoDetectSoftware, localLib, invokeBackend]);

  // Fetch recommendations when reference track or filter changes
  useEffect(() => {
    if (!isOpen || !referenceTrack) return;

    const fetchRecs = async () => {
      setIsLoading(true);
      try {
        const res = await invokeBackend('get_next_track_recommendations', {
          current_track: referenceTrack,
          currentTrack: referenceTrack,
          library_tracks: localLib.length > 0 ? localLib : undefined,
          libraryTracks: localLib.length > 0 ? localLib : undefined,
          filter_mode: filterMode,
          filterMode: filterMode,
          max_results: 30,
          maxResults: 30,
        });
        if (res && res.result) {
          setRecommendations(res.result);
        }
      } catch (e) {
        console.error('Copilot recommendation error:', e);
      } finally {
        setIsLoading(false);
      }
    };

    fetchRecs();
  }, [isOpen, referenceTrack, filterMode, localLib, invokeBackend]);

  // Handle Window Size & Always-on-top toggle
  const toggleMiniMode = async () => {
    const nextMode = !isMiniMode;
    setIsMiniMode(nextMode);
    try {
      await invokeBackend('set_mini_overlay_mode', { is_mini: nextMode, isMini: nextMode });
      if (nextMode) {
        showToast('สลับเป็นโหมด Mini Overlay (Always on Top) สำหรับวางข้าง Rekordbox แล้ว', 'info');
      }
    } catch (e) {
      console.warn('Cannot toggle window size:', e);
    }
  };

  // 1-Click Copy track to clipboard for instant Ctrl+V into Rekordbox / Serato
  const handleCopyTrack = (track: RecommendedTrack) => {
    const text = `${track.artist ? `${track.artist} - ` : ''}${track.title}`;
    navigator.clipboard.writeText(text);
    setCopiedId(track.id || track.title);
    showToast(`คัดลอก "${text}" แล้ว! กด Ctrl+V ใน Rekordbox / Serato ได้เลย`, 'success');
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Make this recommended track the new reference track (for chaining sets)
  const handleChainNext = (track: RecommendedTrack) => {
    setReferenceTrack(track);
    showToast(`ตั้ง "${track.title}" เป็นเพลงปัจจุบันแล้ว แนะนำเพลงถัดไปต่อทันที!`, 'info');
  };

  if (!isOpen) return null;

  // Filter by search query if typed
  const filteredRecs = recommendations.filter((r) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return r.title.toLowerCase().includes(q) || (r.artist && r.artist.toLowerCase().includes(q));
  });

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center ${
        isMiniMode
          ? 'p-0 bg-black/90 backdrop-blur-md'
          : 'bg-black/80 backdrop-blur-sm p-4'
      }`}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ duration: 0.2 }}
        className={`flex flex-col bg-zinc-950 border border-white/10 shadow-2xl overflow-hidden font-sans text-zinc-200 ${
          isMiniMode
            ? 'w-full h-full rounded-none'
            : 'w-full max-w-3xl h-[88vh] rounded-2xl'
        }`}
      >
        {/* ================= HEADER ================= */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-zinc-900/70">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-emerald-500/20 to-cyan-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Radio size={16} className="animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm text-white tracking-wide flex items-center gap-1">
                  <span>DJ Live</span>
                  <span className="text-emerald-400 font-extrabold">Copilot</span>
                </span>
                <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  REAL-TIME
                </span>
                {detectedSoftware && (
                  <span className="text-[9px] font-mono text-cyan-400 bg-cyan-500/10 px-1.5 py-0.2 rounded border border-cyan-500/20">
                    {detectedSoftware} Live
                  </span>
                )}
              </div>
              <p className="text-[10px] text-zinc-400">
                {isMiniMode ? 'Floating Overlay (Always on Top)' : 'AI Next-Track Recommender for Rekordbox & Serato'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Toggle Mini Overlay Mode */}
            <button
              onClick={toggleMiniMode}
              title={isMiniMode ? 'สลับเป็นจอใหญ่' : 'ย่อเป็นหน้าต่างลอย Always-on-Top'}
              className="p-1.5 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 hover:text-white transition border border-white/5"
            >
              {isMiniMode ? <Maximize2 size={14} /> : <Minimize2 size={14} />}
            </button>

            {/* Close Button */}
            <button
              onClick={async () => {
                if (isMiniMode) {
                  await invokeBackend('set_mini_overlay_mode', { is_mini: false });
                  setIsMiniMode(false);
                }
                onClose();
              }}
              className="p-1.5 rounded-lg bg-zinc-800/80 hover:bg-red-500/20 text-zinc-400 hover:text-red-400 transition border border-white/5"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* ================= CURRENT LIVE PLAYING TRACK BAR ================= */}
        <div className="p-3 bg-gradient-to-r from-zinc-900/90 via-zinc-900/50 to-zinc-950 border-b border-white/10">
          <div className="flex items-center justify-between mb-1.5 text-[10px] font-bold tracking-wider text-zinc-500 uppercase">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping inline-block" />
              <span>CURRENTLY PLAYING ON DECK</span>
            </span>
            <div className="flex items-center gap-2.5">
              <button
                onClick={() => setIsPickerOpen(!isPickerOpen)}
                className="text-[10px] font-bold text-emerald-400 hover:text-emerald-300 transition cursor-pointer flex items-center gap-1"
              >
                <span>🔍 {isPickerOpen ? 'ซ่อนการค้นหา' : 'เปลี่ยนเพลงที่เล่นอยู่'}</span>
              </button>
              <span className="font-mono text-zinc-400">{filteredRecs.length} Matches</span>
            </div>
          </div>

          {/* Quick Picker / Search Dropdown for Current Track */}
          {isPickerOpen && (
            <div className="mb-2 p-2.5 rounded-xl bg-zinc-900 border border-emerald-500/30 space-y-2">
              <div className="flex items-center gap-2">
                <Search size={14} className="text-emerald-400" />
                <input
                  type="text"
                  value={pickerSearch}
                  onChange={(e) => setPickerSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && pickerSearch.trim()) {
                      // Custom track manual input
                      setReferenceTrack({
                        title: pickerSearch.trim(),
                        artist: 'Manual Input',
                        bpm: 126,
                        camelot: '8A',
                      });
                      setIsPickerOpen(false);
                      showToast(`ตั้ง "${pickerSearch.trim()}" เป็นเพลงปัจจุบันแล้ว`, 'success');
                    }
                  }}
                  placeholder="พิมพ์ชื่อเพลงใน Rekordbox หรือ Library (กด Enter เพื่อเลือก)..."
                  className="flex-1 bg-black/50 text-xs text-white px-2.5 py-1.5 rounded-lg border border-white/10 focus:border-emerald-500/50 focus:outline-none"
                  autoFocus
                />
              </div>

              {/* Quick Results from Library */}
              {pickerSearch.trim() && (
                <div className="max-h-36 overflow-y-auto space-y-1">
                  {localLib
                    .filter(
                      (t) =>
                        t.title.toLowerCase().includes(pickerSearch.toLowerCase()) ||
                        (t.artist && t.artist.toLowerCase().includes(pickerSearch.toLowerCase()))
                    )
                    .slice(0, 5)
                    .map((t, idx) => (
                      <div
                        key={t.id || idx}
                        onClick={() => {
                          setReferenceTrack(t);
                          setIsPickerOpen(false);
                          showToast(`เลือก "${t.title}" เป็นเพลงที่กำลังเล่นแล้ว!`, 'success');
                        }}
                        className="flex items-center justify-between p-1.5 rounded-lg bg-black/30 hover:bg-emerald-500/20 cursor-pointer text-xs transition"
                      >
                        <div className="truncate flex-1">
                          <span className="text-white font-semibold">{t.title}</span>
                          <span className="text-zinc-400 ml-1.5 text-[11px]">{t.artist}</span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0 ml-2">
                          <span className="text-[9px] font-mono font-bold text-emerald-400 bg-emerald-500/10 px-1 py-0.2 rounded">
                            {t.camelot || '8A'}
                          </span>
                          <span className="text-[9px] font-mono text-zinc-400">
                            {Math.round(t.bpm || 128)}
                          </span>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}

          {referenceTrack ? (
            <div
              onClick={() => setIsPickerOpen(!isPickerOpen)}
              className="flex items-center justify-between gap-3 bg-black/40 hover:bg-black/60 cursor-pointer p-2.5 rounded-xl border border-white/5 transition"
              title="คลิกเพื่อเปลี่ยนหรือพิมพ์ชื่อเพลงที่กำลังเล่น"
            >
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <div className="w-10 h-10 rounded-lg bg-zinc-800 overflow-hidden shrink-0 border border-white/10 flex items-center justify-center relative">
                  {referenceTrack.cover_url ? (
                    <img src={referenceTrack.cover_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <Disc3 size={20} className="text-zinc-600" />
                  )}
                </div>
                <div className="min-w-0 flex-1 leading-tight">
                  <p className="text-xs font-bold text-white truncate">{referenceTrack.title}</p>
                  <p className="text-[11px] text-zinc-400 truncate mt-0.5">{referenceTrack.artist || 'Unknown Artist'}</p>
                </div>
              </div>

              {/* Badges: Key & BPM */}
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-xs font-mono font-bold px-2 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                  {referenceTrack.camelot || '8A'}
                </span>
                <span className="text-xs font-mono font-bold px-2 py-1 rounded-lg bg-zinc-800 text-zinc-200 border border-white/5">
                  {Math.round(referenceTrack.bpm || 128)} BPM
                </span>
              </div>
            </div>
          ) : (
            <div
              onClick={() => setIsPickerOpen(true)}
              className="text-center py-2 text-xs text-zinc-400 hover:text-white cursor-pointer bg-black/30 rounded-xl border border-dashed border-white/10"
            >
              🔍 คลิกเพื่อเลือกหรือพิมพ์ชื่อเพลงที่กำลังเปิดอยู่ใน Rekordbox
            </div>
          )}
        </div>

        {/* ================= FILTER PILLS ================= */}
        <div className="flex items-center gap-1.5 p-2 px-3 border-b border-white/5 overflow-x-auto no-scrollbar text-xs">
          {[
            { id: 'all', label: 'All Matches' },
            { id: 'exact', label: '🟢 Exact Key' },
            { id: 'lift', label: '🔵 +1 Lift' },
            { id: 'boost', label: '⚡ +2 Boost' },
            { id: 'relative', label: '🟣 Relative' },
            { id: 'tight_bpm', label: 'BPM ±3%' },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setFilterMode(f.id as any)}
              className={`px-2.5 py-1 rounded-lg font-medium whitespace-nowrap text-[11px] transition ${
                filterMode === f.id
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold'
                  : 'bg-zinc-900 text-zinc-400 hover:text-white hover:bg-zinc-800 border border-white/5'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* ================= SEARCH INPUT (QUICK FIND) ================= */}
        <div className="p-2 px-3 border-b border-white/5">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-2.5 text-zinc-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="กรองชื่อเพลง / ศิลปิน ในผลลัพธ์..."
              className="w-full bg-zinc-900 text-xs text-white pl-8 pr-3 py-1.5 rounded-lg border border-white/5 focus:border-emerald-500/40 focus:outline-none transition placeholder:text-zinc-500"
            />
          </div>
        </div>

        {/* ================= RECOMMENDATIONS LIST ================= */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-48 text-zinc-500 space-y-2">
              <RefreshCw size={24} className="animate-spin text-emerald-400" />
              <p className="text-xs">กำลังคำนวณคู่ผสมเพลงที่ดีที่สุด...</p>
            </div>
          ) : filteredRecs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-zinc-500 text-xs">
              <p>ไม่พบเพลงที่ตรงกับตัวกรองนี้ใน Library</p>
              <p className="text-[10px] text-zinc-600 mt-1">ลองเปลี่ยนฟิลเตอร์ หรือนำเข้าเพลงเข้า Library เพิ่มเติม</p>
            </div>
          ) : (
            filteredRecs.map((track, idx) => {
              const isCopied = copiedId === (track.id || track.title);
              const isCurrentlyPlaying =
                activePlayingTrack &&
                (activePlayingTrack.id === track.id || activePlayingTrack.filepath === track.filepath);

              return (
                <div
                  key={track.id || idx}
                  className="group relative flex items-center justify-between gap-3 p-2.5 rounded-xl bg-zinc-900/60 hover:bg-zinc-800/80 border border-white/5 hover:border-emerald-500/30 transition shadow-sm"
                >
                  {/* Left: Rank + Cover + Title + Artist */}
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    {/* Rank Badge */}
                    <span className="text-[10px] font-mono font-bold text-zinc-500 w-4 text-center">
                      {idx + 1}
                    </span>

                    {/* Cover Art / Play Button */}
                    <div
                      onClick={() => onPlayTrack(track)}
                      className="w-9 h-9 rounded-lg bg-zinc-800 overflow-hidden shrink-0 border border-white/10 relative group/cover cursor-pointer flex items-center justify-center"
                    >
                      {track.cover_url ? (
                        <img src={track.cover_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <Music2 size={16} className="text-zinc-600" />
                      )}
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover/cover:opacity-100 flex items-center justify-center transition">
                        {isCurrentlyPlaying && isPlaying ? (
                          <Pause size={14} className="text-emerald-400" />
                        ) : (
                          <Play size={14} className="text-white fill-current" />
                        )}
                      </div>
                    </div>

                    {/* Track info */}
                    <div className="min-w-0 flex-1 leading-tight">
                      <div className="flex items-center gap-1.5">
                        <p className="text-xs font-bold text-white truncate group-hover:text-emerald-300 transition">
                          {track.title}
                        </p>
                      </div>
                      <p className="text-[11px] text-zinc-400 truncate mt-0.5">
                        {track.artist || 'Unknown Artist'}
                      </p>
                      <p className="text-[9px] text-zinc-500 truncate mt-0.5 font-medium">
                        💡 {track.mix_tip}
                      </p>
                    </div>
                  </div>

                  {/* Center/Right: Badges & Scores */}
                  <div className="flex items-center gap-2 shrink-0">
                    {/* Transition Badge */}
                    <div className="flex flex-col items-end">
                      <span
                        style={{ color: track.harmonic_info.color }}
                        className="text-[10px] font-bold font-mono px-1.5 py-0.5 rounded bg-black/40 border border-white/10"
                      >
                        {track.harmonic_info.badge}
                      </span>
                      <span className="text-[9px] font-mono text-zinc-400 mt-0.5">
                        {track.bpm_info.label}
                      </span>
                    </div>

                    {/* Key & BPM */}
                    <div className="flex flex-col items-center">
                      <span className="text-[10px] font-mono font-bold text-zinc-200 bg-zinc-800 px-1.5 py-0.5 rounded border border-white/5">
                        {track.camelot || '8A'}
                      </span>
                      <span className="text-[9px] font-mono text-zinc-400 mt-0.5">
                        {Math.round(track.bpm || 128)}
                      </span>
                    </div>

                    {/* 1-Click Copy Button */}
                    <button
                      onClick={() => handleCopyTrack(track)}
                      title="คลิกเพื่อคัดลอกชื่อเพลงไป Paste ใน Rekordbox"
                      className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-bold transition ${
                        isCopied
                          ? 'bg-emerald-500 text-black font-extrabold'
                          : 'bg-zinc-800 hover:bg-emerald-500/20 text-zinc-300 hover:text-emerald-400 border border-white/10'
                      }`}
                    >
                      {isCopied ? <Check size={13} /> : <Copy size={13} />}
                      <span className="text-[10px] font-mono hidden sm:inline">
                        {isCopied ? 'COPIED' : 'COPY'}
                      </span>
                    </button>

                    {/* Chain Next (Set as current) */}
                    <button
                      onClick={() => handleChainNext(track)}
                      title="ตั้งเพลงนี้เป็นเพลงปัจจุบันเพื่อดูเพลงถัดไปต่อ"
                      className="p-1.5 rounded-lg bg-zinc-800 hover:bg-indigo-500/20 text-zinc-400 hover:text-indigo-400 transition border border-white/5"
                    >
                      <Sparkles size={13} />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* ================= FOOTER / TIPS ================= */}
        <div className="px-4 py-2.5 border-t border-white/10 bg-zinc-900/60 flex items-center justify-between text-[11px] text-zinc-400">
          <div className="flex items-center gap-2">
            <span className="text-emerald-400 font-bold">💡 DJ Workflow Tip:</span>
            <span>คลิกปุ่ม <b>COPY</b> แล้วกด <kbd className="px-1.5 py-0.5 rounded bg-zinc-800 border border-white/10 text-white font-mono text-[10px]">Ctrl+V</kbd> ในช่องค้นหาของ Rekordbox ได้ทันที</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (libraryTracks.length > 0) {
                  const randomTrack = libraryTracks[Math.floor(Math.random() * libraryTracks.length)];
                  setReferenceTrack(randomTrack);
                }
              }}
              className="text-[10px] font-medium text-zinc-400 hover:text-white transition"
            >
              สุ่มเพลงปัจจุบัน
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
