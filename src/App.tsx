import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { invoke } from '@tauri-apps/api/core';
import { SmartSearchModal } from './ui/SmartSearchModal';

// Robust Thai & International text normalization helper
export function normalizeThaiString(str: string): string {
  if (!str) return '';
  return str
    .normalize('NFC')
    .toLowerCase()
    .replace(/[\u0E48-\u0E4C\u0E47\u0E4D\u0E4E\u0E3A]/g, '')
    .replace(/[^\w\s\u0E00-\u0E7F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Tauri v2 & Webview Unified Bridge
async function invokeBackend(command: string, args: any = {}): Promise<any> {
  try {
    return await invoke(command, args);
  } catch (e: any) {
    // Fallback for pywebview or browser
    const pywebview = (window as any).pywebview;
    if (pywebview && pywebview.api && pywebview.api[command]) {
      return await pywebview.api[command](...(Object.values(args)));
    }
    const tauriGlobal = (window as any).__TAURI__;
    if (tauriGlobal && tauriGlobal.core && tauriGlobal.core.invoke) {
      return await tauriGlobal.core.invoke(command, args);
    }
    console.error(`Invoke error for ${command}:`, e);
    throw e;
  }
}

interface Track {
  id?: string;
  title: string;
  artist?: string;
  album?: string;
  label?: string;
  playlist_name?: string;
  source?: string;
  duration_ms?: number;
  cover_url?: string;
  bpm?: number;
  camelot?: string;
  key_name?: string;
  color?: string;
  genre?: string;
  energy?: number;
  stars?: number;
  rating_255?: number;
  cues?: Array<{ name: string; start: number; num: number }>;
  filepath?: string;
  progress?: number;
  statusText?: string;
  done?: boolean;
  added_at?: number;
  year?: string;
  track_number?: number;
  search_query?: string;
  vibe_note?: string;
  folder_mode?: string;
}

const CAMELOT_WHEEL = [
  { key: '1B', musical: 'B Maj', rel: '1A', num: 1, type: 'B', color: '#14b8a6' },
  { key: '2B', musical: 'F# Maj', rel: '2A', num: 2, type: 'B', color: '#0ea5e9' },
  { key: '3B', musical: 'Db Maj', rel: '3A', num: 3, type: 'B', color: '#3b82f6' },
  { key: '4B', musical: 'Ab Maj', rel: '4A', num: 4, type: 'B', color: '#8b5cf6' },
  { key: '5B', musical: 'Eb Maj', rel: '5A', num: 5, type: 'B', color: '#a855f7' },
  { key: '6B', musical: 'Bb Maj', rel: '6A', num: 6, type: 'B', color: '#ec4899' },
  { key: '7B', musical: 'F Maj', rel: '7A', num: 7, type: 'B', color: '#f43f5e' },
  { key: '8B', musical: 'C Maj', rel: '8A', num: 8, type: 'B', color: '#f97316' },
  { key: '9B', musical: 'G Maj', rel: '9A', num: 9, type: 'B', color: '#eab308' },
  { key: '10B', musical: 'D Maj', rel: '10A', num: 10, type: 'B', color: '#84cc16' },
  { key: '11B', musical: 'A Maj', rel: '11A', num: 11, type: 'B', color: '#22c55e' },
  { key: '12B', musical: 'E Maj', rel: '12A', num: 12, type: 'B', color: '#10b981' },
  { key: '1A', musical: 'Ab Min', rel: '1B', num: 1, type: 'A', color: '#2dd4bf' },
  { key: '2A', musical: 'Eb Min', rel: '2B', num: 2, type: 'A', color: '#38bdf8' },
  { key: '3A', musical: 'Bb Min', rel: '3B', num: 3, type: 'A', color: '#60a5fa' },
  { key: '4A', musical: 'F Min', rel: '4B', num: 4, type: 'A', color: '#a78bfa' },
  { key: '5A', musical: 'C Min', rel: '5B', num: 5, type: 'A', color: '#c084fc' },
  { key: '6A', musical: 'G Min', rel: '6B', num: 6, type: 'A', color: '#f472b6' },
  { key: '7A', musical: 'D Min', rel: '7B', num: 7, type: 'A', color: '#fb7185' },
  { key: '8A', musical: 'A Min', rel: '8B', num: 8, type: 'A', color: '#fb923c' },
  { key: '9A', musical: 'E Min', rel: '9B', num: 9, type: 'A', color: '#facc15' },
  { key: '10A', musical: 'B Min', rel: '10B', num: 10, type: 'A', color: '#a3e635' },
  { key: '11A', musical: 'F# Min', rel: '11B', num: 11, type: 'A', color: '#4ade80' },
  { key: '12A', musical: 'C# Min', rel: '12B', num: 12, type: 'A', color: '#34d399' },
];

// Harmonic Transition Engine & Set Score Analysis
interface TransitionInfo {
  score: number;
  label: string;
  type: 'perfect' | 'boost' | 'relative' | 'power' | 'step';
  color: string;
  mixOutTime: string;
  mixInTime: string;
}

const getHarmonicTransition = (fromTrack: Track, toTrack: Track): TransitionInfo => {
  const k1 = fromTrack.camelot || '8A';
  const k2 = toTrack.camelot || '8A';
  const num1 = parseInt(k1.slice(0, -1)) || 8;
  const let1 = k1.slice(-1) || 'A';
  const num2 = parseInt(k2.slice(0, -1)) || 8;
  const let2 = k2.slice(-1) || 'A';

  const diffNum = Math.abs(num1 - num2);
  const diffWheel = Math.min(diffNum, 12 - diffNum);
  const sameLetter = let1 === let2;

  const durSec = fromTrack.duration_ms ? fromTrack.duration_ms / 1000 : 180;
  const mixOutSec = Math.max(30, durSec - 30);
  const m = Math.floor(mixOutSec / 60);
  const s = Math.floor(mixOutSec % 60);
  const mixOutTime = `${m}:${s < 10 ? '0' : ''}${s}`;
  const mixInTime = '00:00 (32-Beat Intro)';

  if (k1 === k2) {
    return { score: 100, label: '🟢 Perfect Harmonic Match (100%)', type: 'perfect', color: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10', mixOutTime, mixInTime };
  }
  if (sameLetter && diffWheel === 1) {
    const isUp = (num2 - num1 === 1) || (num1 === 12 && num2 === 1);
    return { score: 95, label: isUp ? '🔵 +1 Harmonic Energy Lift (95%)' : '🔵 -1 Warm-down Step (95%)', type: 'boost', color: 'text-sky-400 border-sky-500/30 bg-sky-500/10', mixOutTime, mixInTime };
  }
  if (!sameLetter && diffWheel === 0) {
    return { score: 90, label: `🟣 Relative ${let2 === 'B' ? 'Major' : 'Minor'} Mood Switch (90%)`, type: 'relative', color: 'text-purple-400 border-purple-500/30 bg-purple-500/10', mixOutTime, mixInTime };
  }
  if (sameLetter && diffWheel === 2) {
    return { score: 85, label: '🟠 +2 Power Energy Boost (85%)', type: 'power', color: 'text-amber-400 border-amber-500/30 bg-amber-500/10', mixOutTime, mixInTime };
  }
  return { score: 75, label: '⚡ Dynamic Key Step (75%)', type: 'step', color: 'text-rose-400 border-rose-500/30 bg-rose-500/10', mixOutTime, mixInTime };
};

export default function App() {
  // Navigation Tabs: 'queue' | 'yt_extractor' | 'library' | 'mixtape' | 'crates' | 'mashups'
  const [activeTab, setActiveTab] = useState<'queue' | 'yt_extractor' | 'library' | 'mixtape' | 'crates' | 'mashups'>('queue');

  // AI DJ Gig Crates & Storage State
  const [gigCrates, setGigCrates] = useState<any[]>([]);
  const [selectedGigCrate, setSelectedGigCrate] = useState<string>('all');
  const [isClassifyingCrates, setIsClassifyingCrates] = useState(false);
  const [isBuildingStorage, setIsBuildingStorage] = useState(false);

  // AI Mashup Matcher State
  const [mashupPairs, setMashupPairs] = useState<any[]>([]);
  const [isFindingMashups, setIsFindingMashups] = useState(false);

  // Duplicate & Quality Cleaner State
  const [showCleanerModal, setShowCleanerModal] = useState(false);
  const [showCleanConfirmModal, setShowCleanConfirmModal] = useState(false);
  const [duplicateData, setDuplicateData] = useState<any>(null);
  const [isScanningDuplicates, setIsScanningDuplicates] = useState(false);
  const [isCleaningDuplicates, setIsCleaningDuplicates] = useState(false);

  // Input & Queue State
  const [url, setUrl] = useState('');
  const [tracks, setTracks] = useState<Track[]>([]);
  const [selectedIndices, setSelectedIndices] = useState<number[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isConvertingAll, setIsConvertingAll] = useState(false);

  // YouTube Dedicated Extractor State
  const [ytUrl, setYtUrl] = useState('');
  const [ytExtractedTracks, setYtExtractedTracks] = useState<Track[]>([]);
  const [isExtractingYt, setIsExtractingYt] = useState(false);

  // Settings
  const [format, setFormat] = useState('MP3');
  const [quality, setQuality] = useState('320 kbps');
  const [stemType, setStemType] = useState('full');
  const [folderMode, setFolderMode] = useState('playlist');
  const [normalizeAudio, setNormalizeAudio] = useState<boolean>(true);
  const [targetLufs, setTargetLufs] = useState<number>(-14.0);
  const [isNormalizingBatch, setIsNormalizingBatch] = useState<boolean>(false);
  const [outputDir, setOutputDir] = useState('downloads');
  const [notification, setNotification] = useState<{ msg: string; type: string } | null>(null);

  // Library & History Database
  const [libraryTracks, setLibraryTracks] = useState<Track[]>([]);
  const [selectedLibIndices, setSelectedLibIndices] = useState<number[]>([]);
  const [libSearch, setLibSearch] = useState('');
  const [libFilterKey, setLibFilterKey] = useState('ALL');
  const [libFilterStars, setLibFilterStars] = useState<number | 'ALL'>('ALL');

  // Smart Mixtape Studio
  const [mixtapeTracks, setMixtapeTracks] = useState<Track[]>([]);
  const [mixtapeMode, setMixtapeMode] = useState<'peak_climb' | 'harmonic_flow' | 'bpm_ramp' | 'sunset_lounge'>('peak_climb');
  const [mixtapeGenre, setMixtapeGenre] = useState('ALL');
  const [mixtapeBpmRange, setMixtapeBpmRange] = useState('ALL');
  const [mixtapeCount, setMixtapeCount] = useState(15);
  const [mixtapeSource, setMixtapeSource] = useState<'library' | 'queue'>('library');
  const [mixtapeTitle, setMixtapeTitle] = useState('Smart_Mixtape_Club_Set');
  const [isBuildingMixtape, setIsBuildingMixtape] = useState(false);
  const [isExportingPackage, setIsExportingPackage] = useState(false);
  const [libFilterGenre, setLibFilterGenre] = useState('ALL');
  const [libFilterPlaylist, setLibFilterPlaylist] = useState('ALL');
  const [isScanningShazam, setIsScanningShazam] = useState(false);
  const [isAuditioningMix, setIsAuditioningMix] = useState(false);
  const [auditionIndex, setAuditionIndex] = useState(0);

  // Audio Preview Player
  const [activeTrack, setActiveTrack] = useState<Track | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.85);
  const [prevVolume, setPrevVolume] = useState(0.85);
  const [isMuted, setIsMuted] = useState(false);

  // Right-Click Context Menu State (ระบบคลิกขวา)
  const [contextMenu, setContextMenu] = useState<{
    isOpen: boolean;
    x: number;
    y: number;
    track: Track | null;
    source?: 'queue' | 'library' | 'mixtape' | 'recommendation' | 'yt_extractor' | 'drawer' | 'player' | 'general';
    index?: number;
    playlistContext?: Track[];
  }>({
    isOpen: false,
    x: 0,
    y: 0,
    track: null,
    source: 'general',
  });

  // Dual-Deck Pro DJ Audio Engine (Seamless Equal-Power Crossfading)
  const deckARef = useRef<HTMLAudioElement>(new Audio());
  const deckBRef = useRef<HTMLAudioElement>(new Audio());
  const activeDeckRef = useRef<'A' | 'B'>('A');
  const isCrossfadingRef = useRef<boolean>(false);
  const crossfadeTimerRef = useRef<any>(null);
  const CROSSFADE_TIME = 4.5; // 4.5s smooth DJ crossfade curve

  // Apple Music & Spotify DJ Player System
  const [playQueue, setPlayQueue] = useState<Track[]>([]);
  const [isAutoDjEnabled, setIsAutoDjEnabled] = useState<boolean>(true);
  const [isShuffle, setIsShuffle] = useState<boolean>(false);
  const [repeatMode, setRepeatMode] = useState<'off' | 'all' | 'one'>('off');
  const [showExpandedPlayer, setShowExpandedPlayer] = useState<boolean>(false);
  const [showQueueDrawer, setShowQueueDrawer] = useState<boolean>(false);
  const [activePlaybackList, setActivePlaybackList] = useState<Track[]>([]);

  // Modals
  const [showCamelotModal, setShowCamelotModal] = useState(false);
  const [showTracklistModal, setShowTracklistModal] = useState(false);
  const [isParsingTracklist, setIsParsingTracklist] = useState(false);
  const [rawTracklistText, setRawTracklistText] = useState('');
  const [selectedKeyForWheel, setSelectedKeyForWheel] = useState('8A');
  const [editingTrack, setEditingTrack] = useState<(Track & { index: number; source: 'queue' | 'library' | 'mixtape' }) | null>(null);

  // YouTube & Tracklist TXT Export Modal
  const [showYoutubeExportModal, setShowYoutubeExportModal] = useState(false);
  const [youtubeExportTracks, setYoutubeExportTracks] = useState<Track[]>([]);
  const [youtubeExportTitle, setYoutubeExportTitle] = useState('YouTube Tracklist');
  const [youtubeExportFormat, setYoutubeExportFormat] = useState<'youtube' | 'numbered' | 'pro_dj' | 'plain'>('youtube');
  const [youtubeExportText, setYoutubeExportText] = useState('');

  // Folder & Mix Manager Modal
  const [showFolderManagerModal, setShowFolderManagerModal] = useState(false);
  const [folderSearchQuery, setFolderSearchQuery] = useState('');
  const [folderViewMode, setFolderViewMode] = useState<'list' | 'grid'>('list');
  const [folderSortColumn, setFolderSortColumn] = useState<'name' | 'count' | 'duration' | 'bpm' | 'rating'>('count');
  const [folderSortDirection, setFolderSortDirection] = useState<'asc' | 'desc'>('desc');
  const [quickFolderFilter, setQuickFolderFilter] = useState('');

  // USB / DJ Drive Export Modal
  const [showUsbModal, setShowUsbModal] = useState(false);
  const [availableDrives, setAvailableDrives] = useState<any[]>([]);
  const [selectedDrivePath, setSelectedDrivePath] = useState('');
  const [isExportingUsb, setIsExportingUsb] = useState(false);

  // Mixtape Set Export Modal
  const [showExportSetModal, setShowExportSetModal] = useState(false);
  const [exportSetCopyAudio, setExportSetCopyAudio] = useState(false);

  // Smart Search Modal State
  const [showSmartSearchModal, setShowSmartSearchModal] = useState(false);
  const [smartSearchInitialQuery, setSmartSearchInitialQuery] = useState('');

  // AI DJ Prompt Assistant Modal State
  const [showAiModal, setShowAiModal] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiTrackCount, setAiTrackCount] = useState(15);
  const [aiLanguages, setAiLanguages] = useState<string[]>(['thai', 'english']);
  const [aiMixtapeMode, setAiMixtapeMode] = useState<string>('peak_climb');
  const [aiApiKey, setAiApiKey] = useState(() => localStorage.getItem('ai_dj_api_key') || '');
  const [aiProvider, setAiProvider] = useState<'gemini' | 'openai'>(() => (localStorage.getItem('ai_dj_provider') as any) || 'gemini');
  const [showAiSettings, setShowAiSettings] = useState(false);
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [aiCuratedResult, setAiCuratedResult] = useState<{
    setlist_title: string;
    vibe_summary: string;
    mixtape_mode?: string;
    tracks: Track[];
  } | null>(null);
  const [aiPlaylistTitle, setAiPlaylistTitle] = useState('');
  const [aiSeparateFolder, setAiSeparateFolder] = useState(true);

  const toggleAiLanguage = (lang: string) => {
    setAiLanguages((prev) => {
      if (prev.includes(lang)) {
        if (prev.length === 1) return prev; // keep at least 1 language
        return prev.filter((l) => l !== lang);
      } else {
        return [...prev, lang];
      }
    });
  };

  const showToast = (msg: string, type: string = 'info') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 3500);
  };

  const refreshLibrary = async () => {
    try {
      const history = await invokeBackend('get_history');
      if (Array.isArray(history)) {
        setLibraryTracks(history);
      }
    } catch (e) {}
  };

  const handleFetchGigCrates = async () => {
    setIsClassifyingCrates(true);
    try {
      const crates = await invokeBackend('get_gig_crates', { tracks: libraryTracks.length > 0 ? libraryTracks : undefined });
      if (Array.isArray(crates)) {
        setGigCrates(crates);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsClassifyingCrates(false);
    }
  };

  const handleOpenStorageFolder = () => {
    const storagePath = `${outputDir}/DJ_Gig_Storage`.replace(/\//g, '\\');
    invokeBackend('open_folder', { path: storagePath });
  };

  const handleBuildGigStorage = async () => {
    setIsBuildingStorage(true);
    showToast('🤖 AI organizing library into Profile Storage Folders & Rekordbox Crates...', 'info');
    try {
      const res: any = await invokeBackend('build_gig_storage', {
        tracks: libraryTracks.length > 0 ? libraryTracks : undefined,
        target_dir: outputDir
      });
      if (res && res.success) {
        showToast(`✓ Created ${res.profiles_count} DJ Gig Folders + Rekordbox XML in ${res.storage_root}!`, 'success');
        handleFetchGigCrates();
        handleOpenStorageFolder();
      } else {
        showToast('Storage organization failed', 'error');
      }
    } catch (e) {
      showToast('Storage error: ' + e, 'error');
    } finally {
      setIsBuildingStorage(false);
    }
  };

  const handleFetchMashups = async () => {
    setIsFindingMashups(true);
    try {
      const res: any = await invokeBackend('find_mashup_matches', {
        tracks: libraryTracks.length > 0 ? libraryTracks : undefined,
        min_score: 80,
        limit: 50
      });
      if (Array.isArray(res)) {
        setMashupPairs(res);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsFindingMashups(false);
    }
  };

  const handleOpenCleanerModal = async () => {
    setShowCleanerModal(true);
    setIsScanningDuplicates(true);
    try {
      const res: any = await invokeBackend('scan_duplicates', {
        tracks: libraryTracks.length > 0 ? libraryTracks : undefined
      });
      if (res) {
        setDuplicateData(res);
      }
    } catch (e) {
      showToast('Error scanning duplicates: ' + e, 'error');
    } finally {
      setIsScanningDuplicates(false);
    }
  };

  const handleConfirmCleanDuplicates = async () => {
    if (!duplicateData || !duplicateData.clusters) return;
    const filepathsToDelete: string[] = [];

    duplicateData.clusters.forEach((c: any) => {
      c.tracks.forEach((t: any) => {
        if (!t.is_recommended_keep && t.filepath) {
          filepathsToDelete.push(t.filepath);
        }
      });
    });

    if (filepathsToDelete.length === 0) {
      showToast('No duplicates to clean', 'info');
      setShowCleanConfirmModal(false);
      return;
    }

    setShowCleanConfirmModal(false);
    setIsCleaningDuplicates(true);
    try {
      const res: any = await invokeBackend('clean_duplicates_batch', { filepaths: filepathsToDelete });
      if (res && res.success) {
        showToast(`🧹 Cleaned ${res.deleted_count} duplicates and freed ${res.freed_mb} MB!`, 'success');
        refreshLibrary();
        handleOpenCleanerModal();
      }
    } catch (e) {
      showToast('Cleaner error: ' + e, 'error');
    } finally {
      setIsCleaningDuplicates(false);
    }
  };

  const isAutoDjEnabledRef = useRef(isAutoDjEnabled);
  isAutoDjEnabledRef.current = isAutoDjEnabled;
  const activePlaybackListRef = useRef(activePlaybackList);
  activePlaybackListRef.current = activePlaybackList;
  const libraryTracksRef = useRef(libraryTracks);
  libraryTracksRef.current = libraryTracks;
  const tracksRef = useRef(tracks);
  tracksRef.current = tracks;
  const playQueueRef = useRef(playQueue);
  playQueueRef.current = playQueue;
  const isShuffleRef = useRef(isShuffle);
  isShuffleRef.current = isShuffle;
  const repeatModeRef = useRef(repeatMode);
  repeatModeRef.current = repeatMode;
  const activeTrackRef = useRef(activeTrack);
  activeTrackRef.current = activeTrack;
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;
  const volumeRef = useRef(volume);
  volumeRef.current = volume;
  const isMutedRef = useRef(isMuted);
  isMutedRef.current = isMuted;
  const libTableScrollRef = useRef<HTMLDivElement>(null);

  const getEffectiveVolume = () => (isMutedRef.current ? 0 : volumeRef.current);

  const getCurrentDeck = () => (activeDeckRef.current === 'A' ? deckARef.current : deckBRef.current);
  const getStandbyDeck = () => (activeDeckRef.current === 'A' ? deckBRef.current : deckARef.current);

  const stopCrossfade = () => {
    if (crossfadeTimerRef.current) {
      clearInterval(crossfadeTimerRef.current);
      crossfadeTimerRef.current = null;
    }
    isCrossfadingRef.current = false;
  };

  useEffect(() => {
    if (libTableScrollRef.current) {
      libTableScrollRef.current.scrollTop = 0;
    }
  }, [libFilterPlaylist, libSearch, libFilterGenre, libFilterKey, libFilterStars]);

  useEffect(() => {
    invokeBackend('get_output_dir').then((res) => {
      if (res) setOutputDir(res);
    });

    refreshLibrary();

    const deckA = deckARef.current;
    const deckB = deckBRef.current;
    deckA.volume = getEffectiveVolume();
    deckB.volume = 0;

    const setupDeckListeners = (deck: HTMLAudioElement, deckId: 'A' | 'B') => {
      const onTime = () => {
        // Strictly only accept time updates from the currently active deck
        if (activeDeckRef.current === deckId && !deck.paused) {
          setCurrentTime(deck.currentTime);

          // Auto-DJ seamless pre-end crossfade (starts 4.5s before song finishes)
          if (
            isAutoDjEnabledRef.current &&
            deck.duration > 10 &&
            deck.currentTime >= deck.duration - CROSSFADE_TIME &&
            !isCrossfadingRef.current &&
            !deck.paused
          ) {
            handlePlayNext(true);
          }
        }
      };

      const onMeta = () => {
        if (activeDeckRef.current === deckId && deck.duration) {
          setDuration(deck.duration);
        }
      };

      const onEnded = () => {
        if (activeDeckRef.current === deckId && !isCrossfadingRef.current) {
          handlePlayNext(false);
        }
      };

      deck.addEventListener('timeupdate', onTime);
      deck.addEventListener('loadedmetadata', onMeta);
      deck.addEventListener('ended', onEnded);

      return () => {
        deck.removeEventListener('timeupdate', onTime);
        deck.removeEventListener('loadedmetadata', onMeta);
        deck.removeEventListener('ended', onEnded);
      };
    };

    const cleanupA = setupDeckListeners(deckA, 'A');
    const cleanupB = setupDeckListeners(deckB, 'B');

    return () => {
      cleanupA();
      cleanupB();
      stopCrossfade();
    };
  }, []);

interface BeatportWaveformProps {
  currentTime: number;
  duration: number;
  onSeek: (time: number) => void;
  track?: Track | null;
}

const BeatportWaveform: React.FC<BeatportWaveformProps> = ({
  currentTime,
  duration,
  onSeek,
  track,
}) => {
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverX, setHoverX] = useState<number>(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragTime, setDragTime] = useState<number | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  const totalDuration = duration > 0 ? duration : (track?.duration_ms ? track.duration_ms / 1000 : 180);
  const safeTime = Math.max(0, Math.min(currentTime, totalDuration));
  const displayTime = isDragging && dragTime !== null ? dragTime : safeTime;
  const progressPct = totalDuration > 0 ? Math.min(100, Math.max(0, (displayTime / totalDuration) * 100)) : 0;

  const bpm = Number(track?.bpm || 128);
  const secPerBeat = 60.0 / Math.max(60, bpm);
  const secPerBar = secPerBeat * 4;
  const totalBars = Math.max(1, Math.round(totalDuration / secPerBar));

  // Mix-Out recommended position (16 bars before end)
  const mixOutBars = 16;
  const mixOutSec = Math.max(15, totalDuration - (mixOutBars * secPerBar));
  const mixOutPct = Math.min(95, Math.max(50, (mixOutSec / totalDuration) * 100));

  // Generate 140 High-Density Symmetrical 3-Band Waveform Bars
  const waveformBars = useMemo(() => {
    const total = 140;
    const items = [];
    const titleStr = track?.title || 'Track';
    let seed = 0;
    for (let c = 0; c < titleStr.length; c++) seed += titleStr.charCodeAt(c);
    seed += Number(track?.bpm || 128);

    for (let i = 0; i < total; i++) {
      const pos = i / total;
      let lowH = 30;
      let midH = 30;
      let highH = 20;

      const waveVar = Math.sin(i * 0.45 + seed) * 12 + Math.cos(i * 0.28 + seed * 0.4) * 8;

      if (pos < 0.12) {
        lowH = 48 + waveVar * 0.4;
        midH = 22 + waveVar * 0.2;
        highH = 20 + waveVar * 0.2;
      } else if (pos < 0.36) {
        lowH = 35 + waveVar * 0.3;
        midH = 75 + waveVar * 0.7;
        highH = 35 + waveVar * 0.3;
      } else if (pos < 0.45) {
        const ramp = (pos - 0.36) / 0.09;
        lowH = 30 + ramp * 35;
        midH = 45 + ramp * 35;
        highH = 35 + ramp * 55;
      } else if (pos < 0.72) {
        lowH = 92 + waveVar * 0.6;
        midH = 65 + waveVar * 0.5;
        highH = 70 + waveVar * 0.6;
      } else if (pos < 0.84) {
        lowH = 22 + waveVar * 0.2;
        midH = 82 + waveVar * 0.8;
        highH = 30 + waveVar * 0.3;
      } else {
        const decay = Math.max(0.15, 1.0 - (pos - 0.84) / 0.16);
        lowH = (50 * decay) + waveVar * 0.3;
        midH = (25 * decay) + waveVar * 0.2;
        highH = (28 * decay) + waveVar * 0.2;
      }

      const totalH = Math.max(16, Math.min(96, (lowH + midH + highH) / 1.7));
      items.push({
        idx: i,
        pos,
        totalH,
        lowRatio: lowH / (lowH + midH + highH),
        midRatio: midH / (lowH + midH + highH),
        highRatio: highH / (lowH + midH + highH),
      });
    }
    return items;
  }, [track?.title, track?.bpm]);

  const getTimeFromEvent = (e: React.PointerEvent | PointerEvent) => {
    if (!barRef.current) return 0;
    const rect = barRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    return (x / rect.width) * totalDuration;
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!barRef.current) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    setIsDragging(true);
    const newTime = getTimeFromEvent(e);
    setDragTime(newTime);
    onSeek(newTime);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!barRef.current) return;
    const rect = barRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const time = (x / rect.width) * totalDuration;
    setHoverTime(time);
    setHoverX(x);

    if (isDragging) {
      setDragTime(time);
      onSeek(time);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDragging) {
      setIsDragging(false);
      setDragTime(null);
      const newTime = getTimeFromEvent(e);
      onSeek(newTime);
    }
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
  };

  const getSectionInfo = (timeSec: number) => {
    const p = timeSec / totalDuration;
    const beatAtTime = Math.max(1, Math.floor(timeSec / secPerBeat) + 1);
    const barAtTime = Math.min(totalBars, Math.floor((beatAtTime - 1) / 4) + 1);
    const beatInBarAtTime = ((beatAtTime - 1) % 4) + 1;
    const phraseAtTime = Math.floor((barAtTime - 1) / 8) + 1;

    let label = '🔵 Outro (ท่อนออก)';
    if (p < 0.12) label = '🟢 Intro (ท่อนเข้า 32-Beat)';
    else if (p < 0.36) label = '🟠 Vocals / Verse (เนื้อร้อง)';
    else if (p < 0.45) label = '🟣 Build-Up (ส่งพลัง)';
    else if (p < 0.72) label = '🟢 Main Drop / Bass (ดรอปหนัก)';
    else if (p < 0.84) label = '🟠 Breakdown / Vocals (ท่อนร้อง)';

    return { label, barStr: `Bar ${barAtTime}.${beatInBarAtTime}`, phraseStr: `Phrase ${phraseAtTime}` };
  };

  return (
    <div
      ref={barRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={() => { if (!isDragging) setHoverTime(null); }}
      className="relative w-full h-11 flex items-center cursor-pointer select-none px-1 group touch-none"
    >
      {/* Symmetrical Waveform with 3-Band Rekordbox Frequency Colors */}
      <div className="w-full h-full flex items-center justify-between gap-[1px]">
        {waveformBars.map((b) => {
          const isPassed = (b.pos * 100) <= progressPct;

          return (
            <div
              key={b.idx}
              style={{ height: `${b.totalH}%` }}
              className="flex-1 min-w-[1px] flex flex-col justify-between items-center rounded-full overflow-hidden"
            >
              {/* Top High Frequency Tip */}
              <div
                style={{ height: `${b.highRatio * 50}%` }}
                className={`w-full rounded-t-full ${
                  isPassed
                    ? 'bg-cyan-200'
                    : 'bg-cyan-500/25 group-hover:bg-cyan-400/40'
                }`}
              />
              {/* Mid Vocals / Melody Layer */}
              <div
                style={{ height: `${b.midRatio * 100}%` }}
                className={`w-full ${
                  isPassed
                    ? 'bg-amber-400'
                    : 'bg-amber-500/30 group-hover:bg-amber-400/45'
                }`}
              />
              {/* Low Center Bass / Kick Core */}
              <div
                style={{ height: `${b.lowRatio * 100}%` }}
                className={`w-full ${
                  isPassed
                    ? 'bg-blue-500'
                    : 'bg-blue-600/35 group-hover:bg-blue-500/50'
                }`}
              />
              {/* Bottom High Frequency Tip */}
              <div
                style={{ height: `${b.highRatio * 50}%` }}
                className={`w-full rounded-b-full ${
                  isPassed
                    ? 'bg-cyan-200'
                    : 'bg-cyan-500/25 group-hover:bg-cyan-400/40'
                }`}
              />
            </div>
          );
        })}
      </div>

      {/* Recommended Mix-In / Out & Hot Cue Flags */}
      <div className="absolute inset-0 pointer-events-none">
        {/* Intro Mix-In Marker (🟢 In) */}
        <div className="absolute left-[1%] top-0 flex items-center gap-0.5" title="Mix-In (Intro 32-Beat)">
          <span className="w-1.5 h-1.5 bg-emerald-400 rounded-b-sm shadow-[0_0_4px_#34d399]" />
        </div>

        {/* Vocals Marker (🎤 Vocals) */}
        <div className="absolute left-[18%] top-0" title="Vocals (เนื้อร้อง)">
          <span className="w-1.5 h-1.5 bg-amber-400 rounded-b-sm shadow-[0_0_4px_#fbbf24]" />
        </div>

        {/* Drop Marker (⚡ Drop) */}
        <div className="absolute left-[48%] top-0" title="Main Drop / Bass">
          <span className="w-1.5 h-1.5 bg-sky-400 rounded-b-sm shadow-[0_0_4px_#38bdf8]" />
        </div>

        {/* Outro Mix-Out Marker (🔴 Out) */}
        <div style={{ left: `${mixOutPct}%` }} className="absolute top-0 flex items-center gap-0.5" title="Mix-Out (Outro)">
          <span className="w-1.5 h-1.5 bg-rose-500 rounded-b-sm shadow-[0_0_4px_#f43f5e]" />
        </div>
      </div>

      {/* Beatport White Playhead Needle */}
      <div
        style={{ left: `${progressPct}%`, transform: 'translateX(-50%)' }}
        className="absolute top-0 bottom-0 w-[2px] bg-white shadow-[0_0_8px_#ffffff,0_0_15px_#38bdf8] pointer-events-none z-10 will-change-transform"
      >
        <div className="w-3 h-3 bg-white rounded-full -ml-[5px] -top-1 absolute shadow-[0_0_8px_#ffffff] border border-sky-400" />
      </div>

      {/* Hover Time, Bar & Section Tooltip */}
      {hoverTime !== null && (() => {
        const info = getSectionInfo(hoverTime);
        return (
          <div
            style={{ left: `${Math.max(10, Math.min(hoverX - 90, (barRef.current?.clientWidth || 200) - 210))}px` }}
            className="absolute -top-8 pointer-events-none bg-[#111115]/95 backdrop-blur-md border border-white/20 text-white text-[10px] font-mono px-2.5 py-0.5 rounded shadow-2xl z-50 flex items-center gap-1.5 whitespace-nowrap animate-in fade-in duration-75"
          >
            <span className="font-bold text-sky-400">{Math.floor(hoverTime / 60)}:{Math.floor(hoverTime % 60) < 10 ? '0' : ''}{Math.floor(hoverTime % 60)}</span>
            <span className="text-indigo-400 font-bold bg-indigo-500/20 px-1 rounded text-[9px]">{info.barStr}</span>
            <span className="text-zinc-500">•</span>
            <span className="font-semibold text-zinc-200">{info.label}</span>
          </div>
        );
      })()}
    </div>
  );
};

  const smartRecommendations = useMemo(() => {
    if (!activeTrack || libraryTracks.length === 0) return [];
    const currentKey = activeTrack.camelot || '8A';
    const currentBpm = Number(activeTrack.bpm || 128);

    const CAMELOT_COMPATIBLE: Record<string, string[]> = {
      '1A': ['1A', '2A', '12A', '1B', '3A'],
      '2A': ['2A', '3A', '1A', '2B', '4A'],
      '3A': ['3A', '4A', '2A', '3B', '5A'],
      '4A': ['4A', '5A', '3A', '4B', '6A'],
      '5A': ['5A', '6A', '4A', '5B', '7A'],
      '6A': ['6A', '7A', '5A', '6B', '8A'],
      '7A': ['7A', '8A', '6A', '7B', '9A'],
      '8A': ['8A', '9A', '7A', '8B', '10A'],
      '9A': ['9A', '10A', '8A', '9B', '11A'],
      '10A': ['10A', '11A', '9A', '10B', '12A'],
      '11A': ['11A', '12A', '10A', '11B', '1A'],
      '12A': ['12A', '1A', '11A', '12B', '2A'],
      '1B': ['1B', '2B', '12B', '1A', '3B'],
      '2B': ['2B', '3B', '1B', '2A', '4B'],
      '3B': ['3B', '4B', '2B', '3A', '5B'],
      '4B': ['4B', '5B', '3B', '4A', '6B'],
      '5B': ['5B', '6B', '4B', '5A', '7B'],
      '6B': ['6B', '7B', '5B', '6A', '8B'],
      '7B': ['7B', '8B', '6B', '7A', '9B'],
      '8B': ['8B', '9B', '7B', '8A', '10B'],
      '9B': ['9B', '10B', '8B', '9A', '11B'],
      '10B': ['10B', '11B', '9B', '10A', '12B'],
      '11B': ['11B', '12B', '10B', '11A', '1B'],
      '12B': ['12B', '1B', '11B', '12A', '2B'],
    };

    const compatibleKeys = CAMELOT_COMPATIBLE[currentKey] || [currentKey];

    const scored = libraryTracks
      .filter((t) => t.filepath !== activeTrack.filepath)
      .map((t) => {
        const tKey = t.camelot || '8A';
        const tBpm = Number(t.bpm || 128);
        const bpmDiff = Math.abs(currentBpm - tBpm);

        let keyScore = 0;
        let matchLabel = '';
        if (tKey === currentKey) {
          keyScore = 50;
          matchLabel = '🎯 Same Key Blend';
        } else if (compatibleKeys[3] === tKey) {
          keyScore = 45;
          matchLabel = '✨ Relative Key';
        } else if (compatibleKeys.slice(1, 3).includes(tKey)) {
          keyScore = 40;
          matchLabel = '🌊 Smooth Harmonic';
        } else if (compatibleKeys[4] === tKey) {
          keyScore = 35;
          matchLabel = '⚡ +2 Energy Lift';
        } else {
          keyScore = 10;
          matchLabel = '🎛️ Groove Match';
        }

        let bpmScore = Math.max(0, 50 - bpmDiff * 4);
        const totalScore = Math.min(100, Math.round(keyScore + bpmScore));

        return { track: t, totalScore, matchLabel, bpmDiff: Math.round(bpmDiff * 10) / 10 };
      })
      .filter((item) => item.totalScore >= 60)
      .sort((a, b) => b.totalScore - a.totalScore);

    return scored.slice(0, 8);
  }, [activeTrack, libraryTracks]);

  const handleAddToQueue = (track: Track, playNextImmediately: boolean = false) => {
    if (playNextImmediately) {
      setPlayQueue((prev) => [track, ...prev]);
      showToast(`Added "${track.title}" to play next!`, 'success');
    } else {
      setPlayQueue((prev) => [...prev, track]);
      showToast(`Added "${track.title}" to Up Next Queue!`, 'success');
    }
  };

  const handleRemoveFromQueue = (index: number) => {
    setPlayQueue((prev) => prev.filter((_, i) => i !== index));
  };

  const handleClearQueue = () => {
    setPlayQueue([]);
    showToast('Up Next Queue cleared', 'info');
  };

  const handleAddMultipleToQueue = (tracksToAdd: Track[], playImmediately: boolean = false) => {
    if (!tracksToAdd || tracksToAdd.length === 0) {
      showToast('กรุณาเลือกเพลงก่อน', 'info');
      return;
    }
    if (playImmediately) {
      const [first, ...rest] = tracksToAdd;
      playTrack(first, tracksToAdd, false);
      if (rest.length > 0) {
        setPlayQueue((prev) => [...prev, ...rest]);
      }
      showToast(`▶ เริ่มเล่น "${first.title}" และเพิ่มอีก ${rest.length} เพลงลงคิวแล้ว!`, 'success');
    } else {
      setPlayQueue((prev) => [...prev, ...tracksToAdd]);
      showToast(`📑 เพิ่ม ${tracksToAdd.length} เพลงลงในคิวเล่นต่อ (Up Next Queue) แล้ว!`, 'success');
    }
  };

  const handleAddAllMixtapeToQueue = (playImmediately: boolean = false) => {
    if (mixtapeTracks.length === 0) {
      showToast('Smart Mixtape is empty. Generate a set first!', 'info');
      return;
    }
    handleAddMultipleToQueue(mixtapeTracks, playImmediately);
  };

  const isSameTrack = (a?: Track | null, b?: Track | null) => {
    if (!a || !b) return false;
    if (a.filepath && b.filepath && a.filepath.toLowerCase() === b.filepath.toLowerCase()) return true;
    if (a.id && b.id && a.id === b.id) return true;
    if (a.title && b.title && a.title.toLowerCase().trim() === b.title.toLowerCase().trim()) {
      if (!a.artist || !b.artist || a.artist.toLowerCase().trim() === b.artist.toLowerCase().trim()) return true;
    }
    return false;
  };

  const playTrack = async (t: Track, playlistContext?: Track[], forceSmooth: boolean = false) => {
    setIsAuditioningMix(false);

    if (playlistContext && playlistContext.length > 0) {
      setActivePlaybackList(playlistContext);
    }

    const currentDeck = getCurrentDeck();
    const standbyDeck = getStandbyDeck();
    const effectiveVol = getEffectiveVolume();

    // If tapping on currently active song, toggle pause
    if (isSameTrack(activeTrackRef.current, t) && isPlayingRef.current && !isCrossfadingRef.current) {
      currentDeck.pause();
      setIsPlaying(false);
      return;
    }

    if (!t.filepath) {
      showToast('Download track first to preview audio', 'info');
      return;
    }

    const dataUrl = await invokeBackend('get_audio_data_url', { filepath: t.filepath });
    if (!dataUrl) {
      showToast('Cannot load audio file', 'info');
      return;
    }

    // 1. Dual-Deck Smooth Equal-Power DJ Crossfade (Only when forceSmooth is true, e.g. Auto-DJ at song end)
    if (isPlayingRef.current && forceSmooth && currentDeck.src && !currentDeck.paused && currentDeck.currentTime > 0.5) {
      stopCrossfade();

      const oldDeck = currentDeck;
      const newDeck = standbyDeck;
      // Immediately switch active deck to the new incoming deck
      activeDeckRef.current = activeDeckRef.current === 'A' ? 'B' : 'A';

      newDeck.src = dataUrl;
      newDeck.currentTime = 0;
      newDeck.volume = 0;

      try {
        await newDeck.play();
      } catch (err) {
        console.error("Audio playback error", err);
      }

      setCurrentTime(0);
      setDuration(t.duration_ms ? t.duration_ms / 1000 : (newDeck.duration || 0));
      setActiveTrack(t);
      setIsPlaying(true);
      isCrossfadingRef.current = true;

      const startTime = performance.now();
      const durMs = CROSSFADE_TIME * 1000;

      crossfadeTimerRef.current = setInterval(() => {
        const elapsed = performance.now() - startTime;
        const progress = Math.min(1.0, elapsed / durMs);

        const currentTargetVol = getEffectiveVolume();
        const volOut = currentTargetVol * Math.cos(progress * 0.5 * Math.PI);
        const volIn = currentTargetVol * Math.sin(progress * 0.5 * Math.PI);

        oldDeck.volume = Math.max(0, Math.min(1, volOut));
        newDeck.volume = Math.max(0, Math.min(1, volIn));

        if (progress >= 1.0) {
          stopCrossfade();
          oldDeck.pause();
          oldDeck.currentTime = 0;
          oldDeck.volume = 0;
          newDeck.volume = getEffectiveVolume();
        }
      }, 40);

      return;
    }

    // 2. Direct Start Playback (Instant switch for manual clicks / Next / Prev)
    stopCrossfade();
    currentDeck.pause();
    currentDeck.currentTime = 0;
    standbyDeck.pause();
    standbyDeck.currentTime = 0;
    standbyDeck.volume = 0;

    currentDeck.src = dataUrl;
    currentDeck.currentTime = 0;
    currentDeck.volume = effectiveVol;
    setCurrentTime(0);
    setDuration(t.duration_ms ? t.duration_ms / 1000 : 0);
    setActiveTrack(t);
    setIsPlaying(true);

    try {
      await currentDeck.play();
    } catch (e) {
      console.error("Direct playback error", e);
    }
  };

  const togglePlay = () => {
    setIsAuditioningMix(false);
    const cur = getCurrentDeck();

    if (!activeTrack) {
      if (tracks.length > 0) playTrack(tracks[0], tracks, false);
      else if (libraryTracks.length > 0) playTrack(libraryTracks[0], libraryTracks, false);
      return;
    }
    if (isPlaying) {
      cur.pause();
      setIsPlaying(false);
    } else {
      cur.play();
      setIsPlaying(true);
    }
  };

  // Continuous DJ Mix Preview Engine (auditions outro-to-intro transitions)
  const handleToggleContinuousMix = async () => {
    if (mixtapeTracks.length < 2) {
      showToast('Need at least 2 tracks in Mixtape to preview transitions', 'info');
      return;
    }

    const cur = getCurrentDeck();
    if (isAuditioningMix) {
      cur.pause();
      setIsPlaying(false);
      setIsAuditioningMix(false);
      return;
    }

    setIsAuditioningMix(true);
    setAuditionIndex(0);
    playTransitionAudition(0);
  };

  const playTransitionAudition = async (index: number) => {
    if (index >= mixtapeTracks.length) {
      setIsAuditioningMix(false);
      setIsPlaying(false);
      showToast('Finished DJ Set transition preview!', 'success');
      return;
    }

    const t = mixtapeTracks[index];
    setAuditionIndex(index);
    if (!t.filepath) {
      showToast(`Track #${index + 1} (${t.title}) needs download to audition`, 'info');
      if (index + 1 < mixtapeTracks.length) {
        setTimeout(() => playTransitionAudition(index + 1), 3000);
      } else {
        setIsAuditioningMix(false);
      }
      return;
    }

    const dataUrl = await invokeBackend('get_audio_data_url', { filepath: t.filepath });
    if (dataUrl) {
      const cur = getCurrentDeck();
      cur.src = dataUrl;
      setActiveTrack(t);
      setIsPlaying(true);

      const onMeta = () => {
        const dur = cur.duration || 180;
        // Jump to 10s before end for seamless transition preview
        cur.currentTime = Math.max(0, dur - 10);
        cur.play();
        cur.removeEventListener('loadedmetadata', onMeta);
      };
      cur.addEventListener('loadedmetadata', onMeta);
    }
  };

  const handleSeek = (newTime: number) => {
    const cur = getCurrentDeck();
    cur.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const handlePlayNext = (smooth: boolean | React.MouseEvent = false) => {
    const isSmooth = typeof smooth === 'boolean' ? smooth : false;

    // 1. Repeat Single Track Mode
    if (repeatModeRef.current === 'one' && activeTrackRef.current) {
      const cur = getCurrentDeck();
      cur.currentTime = 0;
      cur.play();
      setIsPlaying(true);
      return;
    }

    // 2. Priority 1: User's Manual Up Next Queue (เล่นตามคิวที่ผู้ใช้เพิ่มไว้ก่อนเสมอแบบเรียงลำดับ)
    if (playQueueRef.current.length > 0) {
      const nextTrack = playQueueRef.current[0];
      setPlayQueue((prev) => prev.slice(1));
      playTrack(nextTrack, undefined, isSmooth);
      return;
    }

    // 3. Priority 2: Active Playlist / Folder / Mixtape (เล่นเรียงตามลำดับในโฟลเดอร์/เพลย์ลิสต์)
    let list = activePlaybackListRef.current.length > 0
      ? activePlaybackListRef.current
      : (mixtapeTracks.length > 0 ? mixtapeTracks : (libraryTracksRef.current.length > 0 ? libraryTracksRef.current : tracksRef.current));

    let curIdx = list.findIndex(t => isSameTrack(t, activeTrackRef.current));
    if (curIdx === -1) {
      if (libraryTracksRef.current.length > 0) {
        list = libraryTracksRef.current;
        curIdx = list.findIndex(t => isSameTrack(t, activeTrackRef.current));
      }
    }

    if (list.length === 0) return;

    // If Shuffle mode is explicitly enabled
    if (isShuffleRef.current) {
      let randomIdx = Math.floor(Math.random() * list.length);
      if (list.length > 1 && randomIdx === curIdx) {
        randomIdx = (randomIdx + 1) % list.length;
      }
      playTrack(list[randomIdx], list, isSmooth);
      return;
    }

    // Normal Sequential Playback: Play Next Track in order (เพลง 1 -> 2 -> 3 -> 4...)
    if (curIdx >= 0 && curIdx < list.length - 1) {
      playTrack(list[curIdx + 1], list, isSmooth);
      return;
    }

    // 4. End of Playlist Reached: Check Repeat All or Auto-DJ Transition
    if (repeatModeRef.current === 'all') {
      playTrack(list[0], list, isSmooth);
      return;
    }

    if (isAutoDjEnabledRef.current && smartRecommendations.length > 0 && isSmooth) {
      const nextHarmonic = smartRecommendations[0].track;
      playTrack(nextHarmonic, undefined, isSmooth);
      showToast(`🤖 Auto-DJ mixed into "${nextHarmonic.title}" (${nextHarmonic.camelot} • ${Math.round(nextHarmonic.bpm || 128)} BPM)`, 'success');
      return;
    }

    // Default loop to beginning of list
    playTrack(list[0], list, isSmooth);
  };

  const handlePlayPrev = () => {
    const cur = getCurrentDeck();
    if (cur.currentTime > 3) {
      cur.currentTime = 0;
      setCurrentTime(0);
      return;
    }

    let list = activePlaybackListRef.current.length > 0
      ? activePlaybackListRef.current
      : (mixtapeTracks.length > 0 ? mixtapeTracks : (libraryTracksRef.current.length > 0 ? libraryTracksRef.current : tracksRef.current));

    let curIdx = list.findIndex(t => isSameTrack(t, activeTrackRef.current));
    if (curIdx === -1) {
      if (libraryTracksRef.current.length > 0) {
        list = libraryTracksRef.current;
        curIdx = list.findIndex(t => isSameTrack(t, activeTrackRef.current));
      }
    }

    if (list.length === 0) return;
    const prevIdx = curIdx > 0 ? curIdx - 1 : list.length - 1;
    playTrack(list[prevIdx], list, false);
  };

  const applyVolume = (val: number) => {
    const clamped = Math.max(0, Math.min(1, val));
    setVolume(clamped);
    volumeRef.current = clamped;
    if (clamped > 0) {
      setIsMuted(false);
      isMutedRef.current = false;
      setPrevVolume(clamped);
    } else {
      setIsMuted(true);
      isMutedRef.current = true;
    }
    if (!isCrossfadingRef.current) {
      deckARef.current.volume = activeDeckRef.current === 'A' ? clamped : 0;
      deckBRef.current.volume = activeDeckRef.current === 'B' ? clamped : 0;
    }
  };

  const handleVolume = (e: React.ChangeEvent<HTMLInputElement>) => {
    applyVolume(parseFloat(e.target.value));
  };

  const toggleMute = () => {
    if (isMuted || volume === 0) {
      const restored = prevVolume > 0 ? prevVolume : 0.8;
      applyVolume(restored);
      showToast(`🔊 Volume restored to ${Math.round(restored * 100)}%`, 'info');
    } else {
      setPrevVolume(volume);
      applyVolume(0);
      showToast('🔇 Audio Muted', 'info');
    }
  };

  const changeVolumeStep = (delta: number) => {
    const next = Math.max(0, Math.min(1, Math.round((volume + delta) * 20) / 20));
    applyVolume(next);
  };

  const handleOpenContextMenu = (
    e: React.MouseEvent,
    track?: Track | null,
    source: 'queue' | 'library' | 'mixtape' | 'recommendation' | 'yt_extractor' | 'drawer' | 'player' | 'general' = 'general',
    index?: number,
    playlistContext?: Track[]
  ) => {
    e.preventDefault();
    e.stopPropagation();

    const menuWidth = 270;
    const menuHeight = track ? 420 : 280;

    let posX = e.clientX;
    let posY = e.clientY;

    if (posX + menuWidth > window.innerWidth) {
      posX = Math.max(10, window.innerWidth - menuWidth - 10);
    }
    if (posY + menuHeight > window.innerHeight) {
      posY = Math.max(10, window.innerHeight - menuHeight - 10);
    }

    setContextMenu({
      isOpen: true,
      x: posX,
      y: posY,
      track: track || null,
      source,
      index,
      playlistContext,
    });
  };

  const closeContextMenu = () => {
    setContextMenu((prev) => (prev.isOpen ? { ...prev, isOpen: false } : prev));
  };

  const handleRateFromContextMenu = async (stars: number) => {
    if (!contextMenu.track) return;
    const targetTrack = contextMenu.track;
    if (targetTrack.filepath) {
      await invokeBackend('batch_update_tracks', {
        filepaths: [targetTrack.filepath],
        updated_fields: { stars, rating_255: stars * 51 },
      });
      refreshLibrary();
    }
    showToast(`⭐ ให้คะแนน ${stars} ดาว สำหรับ "${targetTrack.title}"`, 'success');
    closeContextMenu();
  };

  useEffect(() => {
    const handleGlobalClick = () => {
      closeContextMenu();
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        setSmartSearchInitialQuery(url.trim() || libSearch.trim() || '');
        setShowSmartSearchModal(true);
        return;
      }

      if (e.key === 'Escape') {
        closeContextMenu();
      }
      const activeTag = (document.activeElement?.tagName || '').toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea') return;

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        changeVolumeStep(0.05);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        changeVolumeStep(-0.05);
      } else if (e.key === 'm' || e.key === 'M') {
        toggleMute();
      }
    };

    window.addEventListener('click', handleGlobalClick);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('click', handleGlobalClick);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [volume, isMuted, prevVolume]);

  const formatTime = (secs: number) => {
    if (!secs || isNaN(secs)) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setUrl(text.trim());
    } catch (e) {
      showToast('Clipboard empty', 'error');
    }
  };

  const handleAnalyze = async () => {
    if (!url.trim()) return;
    setIsAnalyzing(true);
    try {
      const fetched: Track[] = await invokeBackend('fetch_metadata', { url: url.trim() });
      if (fetched && fetched.length > 0) {
        setTracks((prev) => [...prev, ...fetched]);
        setUrl('');
        showToast(`Loaded ${fetched.length} track(s) into queue`, 'success');
      } else {
        showToast('No tracks found for this URL', 'error');
      }
    } catch (err: any) {
      showToast('Error analyzing: ' + err, 'error');
    } finally {
      setIsAnalyzing(false);
    }
  };

  
  const handleParseCustomTracklist = async () => {
    if (!rawTracklistText.trim()) return;
    setIsParsingTracklist(true);
    const lines = rawTracklistText.split('\n');
    const queries: string[] = [];
    const tsRegex = /(?:\[|\()?\b(\d{1,2}:\d{2}(?::\d{2})?)\b(?:\]|\))?\s*[-–—:]?\s*(.+)/;

    lines.forEach((line) => {
      const clean = line.trim();
      if (!clean) return;
      let title = clean;
      const match = tsRegex.exec(clean);
      if (match) {
        title = match[2].trim();
      }
      // Remove leading numbers, brackets, bullets, dashes (e.g. "01.", "1 -", "- ")
      title = title.replace(/^(?:\d+[\.\)\-]\s*|\s*[-–—•:]\s*)+/, '').trim();
      if (title && title.length > 1 && !['intro', 'outro', 'start', 'end'].includes(title.toLowerCase())) {
        queries.push(title);
      }
    });

    if (queries.length === 0) {
      showToast('No valid tracks found in text', 'error');
      setIsParsingTracklist(false);
      return;
    }

    // Prepare immediate fallback tracks so user NEVER experiences empty queue
    const immediateTracks: Track[] = queries.map((q, idx) => {
      let artist = '';
      let title = q;
      if (q.includes(' - ')) {
        const parts = q.split(' - ');
        artist = parts[0].trim();
        title = parts.slice(1).join(' - ').trim();
      } else if (q.includes(' – ')) {
        const parts = q.split(' – ');
        artist = parts[0].trim();
        title = parts.slice(1).join(' – ').trim();
      } else if (q.includes(' — ')) {
        const parts = q.split(' — ');
        artist = parts[0].trim();
        title = parts.slice(1).join(' — ').trim();
      }
      return {
        id: `tracklist_${Date.now()}_${idx + 1}`,
        title: title || q,
        artist: artist,
        album: 'DJ Tracklist',
        source: 'DJ Tracklist',
        duration_ms: 0,
        track_number: idx + 1,
        search_query: q
      };
    });

    showToast(`Matching & importing ${queries.length} tracks...`, 'info');
    try {
      const res: Track[] = await invokeBackend('search_spotify_tracks', { queries });
      const finalTracks = (res && Array.isArray(res) && res.length > 0) ? res : immediateTracks;
      
      setTracks((prev) => [...prev, ...finalTracks]);
      if (activeTab === 'yt_extractor') {
        setYtExtractedTracks(finalTracks);
      }
      setShowTracklistModal(false);
      setRawTracklistText('');
      setActiveTab('queue');
      showToast(`Added ${finalTracks.length} tracks to Download Queue!`, 'success');
    } catch (e) {
      console.warn('Backend search fallback:', e);
      setTracks((prev) => [...prev, ...immediateTracks]);
      if (activeTab === 'yt_extractor') {
        setYtExtractedTracks(immediateTracks);
      }
      setShowTracklistModal(false);
      setRawTracklistText('');
      setActiveTab('queue');
      showToast(`Added ${immediateTracks.length} tracks to Download Queue!`, 'success');
    } finally {
      setIsParsingTracklist(false);
    }
  };

  const handleExtractYouTubeMixtape = async () => {
    if (!ytUrl.trim()) return;
    setIsExtractingYt(true);
    try {
      const fetched: Track[] = await invokeBackend('fetch_metadata', { url: ytUrl.trim() });
      if (fetched && fetched.length > 0) {
        setYtExtractedTracks(fetched);
        if (fetched.length === 1) {
          showToast(`Loaded Full DJ Live Set (${formatTime(fetched[0].duration_ms ? fetched[0].duration_ms / 1000 : 0)})`, 'success');
        } else {
          showToast(`Extracted ${fetched.length} songs from YouTube DJ Set!`, 'success');
        }
      } else {
        showToast('Could not load YouTube video stream', 'error');
      }
    } catch (e) {
      showToast('Error extracting YouTube set', 'error');
    } finally {
      setIsExtractingYt(false);
    }
  };

  const handleScanYouTubeShazam = async () => {
    if (!ytUrl.trim()) return;
    setIsScanningShazam(true);
    showToast('🎙️ Scanning audio with Shazam AI Fingerprinting (3-min interval)...', 'info');
    try {
      const fetched: Track[] = await invokeBackend('scan_youtube_shazam', { url: ytUrl.trim() });
      if (fetched && fetched.length > 0) {
        setYtExtractedTracks(fetched);
        showToast(`🎙️ Shazam AI discovered ${fetched.length} songs from live mix!`, 'success');
      } else {
        showToast('No tracks identified by Shazam in this audio', 'error');
      }
    } catch (e) {
      showToast('Shazam scan error: ' + e, 'error');
    } finally {
      setIsScanningShazam(false);
    }
  };

  const handleAddYtTracksToQueue = () => {
    if (ytExtractedTracks.length === 0) return;
    setTracks((prev) => [...prev, ...ytExtractedTracks]);
    setActiveTab('queue');
    showToast(`Added ${ytExtractedTracks.length} YouTube songs to Download Queue!`, 'success');
  };

  const handleGenerateAiPlaylist = async (customPrompt?: string) => {
    const promptToUse = (customPrompt || aiPrompt).trim();
    if (!promptToUse) {
      showToast('กรุณาระบุบรรยากาศร้านหรือแนวเพลงที่ต้องการ', 'warning');
      return;
    }
    if (customPrompt) {
      setAiPrompt(customPrompt);
    }
    setIsGeneratingAi(true);
    try {
      if (aiApiKey) {
        localStorage.setItem('ai_dj_api_key', aiApiKey);
      }
      localStorage.setItem('ai_dj_provider', aiProvider);

      console.log('[AI] Requesting playlist generation for:', promptToUse, 'Languages:', aiLanguages, 'MixtapeMode:', aiMixtapeMode);
      const res: any = await invokeBackend('generate_ai_playlist', {
        prompt: promptToUse,
        count: aiTrackCount,
        api_key: aiApiKey || '',
        apiKey: aiApiKey || '',
        provider: aiProvider,
        languages: aiLanguages,
        mixtape_mode: aiMixtapeMode,
        mixtapeMode: aiMixtapeMode
      });

      console.log('[AI] Result received:', res);
      if (res && res.tracks && res.tracks.length > 0) {
        setAiCuratedResult(res);
        setAiPlaylistTitle(res.setlist_title || 'AI Smart Mixtape');
        setAiSeparateFolder(true);
        showToast(`AI จัดเซ็ต Smart Mixtape เรียบร้อยแล้ว (${res.tracks.length} เพลง)`, 'success');
      } else {
        showToast('ไม่สามารถสร้างเซ็ตเพลงได้ กรุณาลองใหม่อีกครั้ง', 'error');
      }
    } catch (err: any) {
      console.error('[AI] Generation Error:', err);
      showToast(`AI Error: ${err?.message || err}`, 'error');
    } finally {
      setIsGeneratingAi(false);
    }
  };

  const handleTransferAiToMixtapeTab = () => {
    if (!aiCuratedResult || !aiCuratedResult.tracks || aiCuratedResult.tracks.length === 0) return;
    const effectiveName = aiSeparateFolder ? (aiPlaylistTitle.trim() || aiCuratedResult.setlist_title || 'AI Smart Mixtape') : '';
    const effectiveFolderMode = aiSeparateFolder ? 'playlist' : 'single';
    const processedTracks = aiCuratedResult.tracks.map((t) => ({
      ...t,
      playlist_name: effectiveName,
      folder_mode: effectiveFolderMode,
    }));
    setMixtapeTracks(processedTracks);
    setActiveTab('mixtape');
    setShowAiModal(false);
    showToast(`🎛️ นำ ${aiCuratedResult.tracks.length} เพลงเข้าสู่แท็บ Smart Mixtape เรียบร้อย!`, 'success');
  };

  const handleAddAiTracksToQueue = (andDownload: boolean = false) => {
    if (!aiCuratedResult || !aiCuratedResult.tracks || aiCuratedResult.tracks.length === 0) return;
    const effectiveName = aiSeparateFolder ? (aiPlaylistTitle.trim() || aiCuratedResult.setlist_title || 'AI Smart Mixtape') : '';
    const effectiveFolderMode = aiSeparateFolder ? 'playlist' : 'single';
    const processedTracks = aiCuratedResult.tracks.map((t) => ({
      ...t,
      playlist_name: effectiveName,
      folder_mode: effectiveFolderMode,
    }));
    setTracks((prev) => [...prev, ...processedTracks]);
    setActiveTab('queue');
    setShowAiModal(false);
    showToast(`เพิ่ม ${processedTracks.length} เพลงจาก AI เข้าสู่คิวเรียบร้อย! ${aiSeparateFolder ? `(โฟลเดอร์: ${effectiveName})` : ''}`, 'success');
    if (andDownload) {
      setTimeout(() => {
        handleConvertAll();
      }, 400);
    }
  };

  const convertSingle = async (index: number) => {
    const target = tracks[index];
    if (!target) return;
    updateTrackStatus(index, 45, 'Downloading 320k audio...');

    const effectiveFolderMode = target.folder_mode || folderMode;

    try {
      const res = await invokeBackend('download_single', {
        track: target,
        audio_format: format,
        quality: quality,
        stem_type: stemType,
        folder_mode: effectiveFolderMode,
        normalize_audio: normalizeAudio,
        target_lufs: targetLufs,
      });
      if (res && res.success) {
        setTracks((prev) => {
          const next = [...prev];
          next[index] = {
            ...next[index],
            ...res.track,
            progress: 100,
            statusText: `${res.track.camelot || '8A'} • ${Math.round(res.track.bpm || 128)} BPM`,
            done: true,
          };
          return next;
        });
      } else {
        updateTrackStatus(index, 0, 'Failed');
        showToast(`Failed downloading: ${target.title}`, 'error');
      }
    } catch (e) {
      updateTrackStatus(index, 0, 'Failed');
      showToast(`Error: ${e}`, 'error');
    }
  };

  const updateTrackStatus = (idx: number, pct: number, text: string) => {
    setTracks((prev) => {
      const next = [...prev];
      if (next[idx]) {
        next[idx] = { ...next[idx], progress: pct, statusText: text };
      }
      return next;
    });
  };

  const toggleSelectTrack = (index: number) => {
    setSelectedIndices((prev) =>
      prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index]
    );
  };

  const toggleSelectAll = () => {
    if (selectedIndices.length === tracks.length) {
      setSelectedIndices([]);
    } else {
      setSelectedIndices(tracks.map((_, idx) => idx));
    }
  };

  const handleConvertSelected = async () => {
    const toConvert = selectedIndices.filter((idx) => tracks[idx] && !tracks[idx].done);
    if (toConvert.length === 0) {
      showToast('No pending tracks selected to download', 'info');
      return;
    }
    setIsConvertingAll(true);
    for (const idx of toConvert) {
      await convertSingle(idx);
    }
    setIsConvertingAll(false);
    refreshLibrary();
    showToast(`Completed downloading ${toConvert.length} selected tracks!`, 'success');
  };

  const handleRemoveSelected = () => {
    if (selectedIndices.length === 0) return;
    setTracks((prev) => prev.filter((_, idx) => !selectedIndices.includes(idx)));
    setSelectedIndices([]);
    showToast('Removed selected tracks from queue', 'info');
  };

  const handleConvertAll = async () => {
    if (tracks.length === 0 || isConvertingAll) return;
    setIsConvertingAll(true);
    for (let i = 0; i < tracks.length; i++) {
      if (!tracks[i].done) {
        await convertSingle(i);
      }
    }
    setIsConvertingAll(false);
    refreshLibrary();
    showToast('Queue completed! Ready for rekordbox export.', 'success');
  };

  const handleBuildMixtape = async (overrideParams?: {
    mode?: any;
    genre?: string;
    bpm?: string;
    count?: number;
    source?: 'library' | 'queue';
  } | React.MouseEvent) => {
    const isEvent = overrideParams && 'nativeEvent' in overrideParams;
    const opts = isEvent ? undefined : overrideParams as any;
    const src = opts?.source || mixtapeSource;
    const mode = opts?.mode || mixtapeMode;
    const genre = opts?.genre !== undefined ? opts.genre : mixtapeGenre;
    const bpmRange = opts?.bpm !== undefined ? opts.bpm : mixtapeBpmRange;
    const count = opts?.count !== undefined ? opts.count : mixtapeCount;

    const sourceTracks = src === 'library' && libraryTracks.length > 0 ? libraryTracks : tracks;
    if (sourceTracks.length === 0) {
      showToast('No tracks available in selected source to sequence', 'error');
      return;
    }
    setIsBuildingMixtape(true);

    let minBpm: number | undefined = undefined;
    let maxBpm: number | undefined = undefined;
    if (bpmRange === '70-95') { minBpm = 65; maxBpm = 95; }
    else if (bpmRange === '95-115') { minBpm = 95; maxBpm = 115; }
    else if (bpmRange === '115-128') { minBpm = 115; maxBpm = 128; }
    else if (bpmRange === '128-138') { minBpm = 128; maxBpm = 138; }
    else if (bpmRange === '140-175') { minBpm = 138; maxBpm = 180; }

    try {
      const sorted: Track[] = await invokeBackend('build_smart_mixtape', {
        tracks: sourceTracks,
        mode: mode,
        genre_filter: genre,
        min_bpm: minBpm,
        max_bpm: maxBpm,
        target_count: count > 0 ? count : undefined,
      });
      let finalSet = sorted || [];
      if (finalSet.length > 0) {
        if (count > 0 && finalSet.length > count) {
          finalSet = finalSet.slice(0, count);
        }
        setMixtapeTracks(finalSet);
        showToast(`🎧 AI DJ created Set with ${finalSet.length} tracks (${genre === 'ALL' ? mode : genre})!`, 'success');
      } else {
        setMixtapeTracks([]);
        showToast(`No tracks matched "${genre}" in selected library`, 'info');
      }
    } catch (e) {
      showToast('Error building mixtape: ' + e, 'error');
    } finally {
      setIsBuildingMixtape(false);
    }
  };

  const handleMoveMixtapeTrack = (idx: number, direction: 'up' | 'down') => {
    setMixtapeTracks((prev) => {
      const next = [...prev];
      const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= next.length) return prev;
      const temp = next[idx];
      next[idx] = next[targetIdx];
      next[targetIdx] = temp;
      return next;
    });
  };

  const handleRemoveMixtapeTrack = (idx: number) => {
    setMixtapeTracks((prev) => prev.filter((_, i) => i !== idx));
    showToast('Removed track from set', 'info');
  };

  const handleClearMixtape = () => {
    setMixtapeTracks([]);
    showToast('Cleared mixtape set list', 'info');
  };

  const handleExportMixtapeFolderPackage = async () => {
    if (mixtapeTracks.length === 0) {
      showToast('Mixtape set is empty', 'error');
      return;
    }
    setIsExportingPackage(true);
    try {
      const res: any = await invokeBackend('export_smart_mixtape_package', {
        tracks: mixtapeTracks,
        title: mixtapeTitle.trim() || 'Smart_Mixtape_DJ_Set',
        copy_audio: exportSetCopyAudio,
      });
      if (res && res.success) {
        if (exportSetCopyAudio) {
          showToast(`✓ Exported ${res.count} songs into standalone DJ folder with audio files & XML!`, 'success');
        } else {
          showToast(`✓ Created Smart DJ Playlist & XML (0 MB Storage used)!`, 'success');
        }
        setShowExportSetModal(false);
      } else {
        showToast('Export failed', 'error');
      }
    } catch (e) {
      showToast('Export error: ' + e, 'error');
    } finally {
      setIsExportingPackage(false);
    }
  };

  const handleExportRekordbox = async (customTracks?: Track[]) => {
    const target = customTracks || (activeTab === 'mixtape' ? mixtapeTracks : (tracks.length > 0 ? tracks : libraryTracks));
    if (target.length === 0) return showToast('No tracks to export', 'error');
    const res = await invokeBackend('export_rekordbox', { tracks: target });
    if (res) showToast(`rekordbox XML exported with 1-5 Stars & Hot Cues!`, 'success');
  };

  const handleExportM3U8 = async (customTracks?: Track[]) => {
    const target = customTracks || (activeTab === 'mixtape' ? mixtapeTracks : (tracks.length > 0 ? tracks : libraryTracks));
    if (target.length === 0) return showToast('No tracks to export', 'error');
    const res = await invokeBackend('export_m3u8', { tracks: target });
    if (res) showToast(`M3U8 Playlist exported!`, 'success');
  };

  const generateTracklistOutput = (tracksList: Track[], format: 'youtube' | 'numbered' | 'pro_dj' | 'plain', title: string) => {
    let cumSec = 0;
    const header = `🎵 ${title}\n==============================\n`;
    const lines = tracksList.map((t, idx) => {
      const artist = (t.artist || 'Unknown Artist').trim();
      const titleName = (t.title || 'Unknown Title').trim();
      const durSec = t.duration_ms ? Math.floor(t.duration_ms / 1000) : 180;
      const m = Math.floor(cumSec / 60);
      const s = cumSec % 60;
      const ts = m < 60 ? `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}` : `${Math.floor(m / 60)}:${m % 60 < 10 ? '0' : ''}${m % 60}:${s < 10 ? '0' : ''}${s}`;
      cumSec += durSec;

      if (format === 'youtube') {
        return `${ts} ${artist} - ${titleName}`;
      } else if (format === 'pro_dj') {
        const extra = (t.bpm || t.camelot) ? ` [${t.bpm ? Math.round(t.bpm) + ' BPM' : ''}${t.camelot ? ' | ' + t.camelot : ''}]` : '';
        return `${idx < 9 ? '0' : ''}${idx + 1}. ${artist} - ${titleName}${extra}`;
      } else if (format === 'plain') {
        return `${artist} - ${titleName}`;
      } else {
        return `${idx + 1}. ${artist} - ${titleName}`;
      }
    });
    return header + lines.join('\n');
  };

  const handleOpenYoutubeExport = (tracksToExport: Track[], title: string = 'DJ Mix Tracklist') => {
    const list = tracksToExport.length > 0 ? tracksToExport : (libraryTracks.length > 0 ? libraryTracks : tracks);
    if (list.length === 0) {
      showToast('ไม่มีเพลงในรายการสำหรับ Export Tracklist', 'warning');
      return;
    }
    setYoutubeExportTracks(list);
    setYoutubeExportTitle(title);
    setYoutubeExportText(generateTracklistOutput(list, youtubeExportFormat, title));
    setShowYoutubeExportModal(true);
  };

  const handleFormatChange = (fmt: 'youtube' | 'numbered' | 'pro_dj' | 'plain') => {
    setYoutubeExportFormat(fmt);
    setYoutubeExportText(generateTracklistOutput(youtubeExportTracks, fmt, youtubeExportTitle));
  };

  const handleCopyTracklistToClipboard = () => {
    if (!youtubeExportText) return;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(youtubeExportText);
      } else {
        const ta = document.createElement('textarea');
        ta.value = youtubeExportText;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      showToast('📋 คัดลอก Tracklist เรียบร้อย! นำไปวางใน YouTube ได้ทันที', 'success');
    } catch (e) {
      showToast('กรุณากดเลือกและคัดลอกจากกล่องข้อความโดยตรง', 'info');
    }
  };

  const handleSaveTracklistTxtFile = async () => {
    try {
      await invokeBackend('export_tracklist_txt', {
        tracks: youtubeExportTracks,
        title: youtubeExportTitle,
        format_mode: youtubeExportFormat,
      });
      const blob = new Blob([youtubeExportText], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${youtubeExportTitle.replace(/[\\/*?:"<>|]/g, '_')}_tracklist.txt`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('💾 บันทึกไฟล์ .txt เรียบร้อยแล้ว!', 'success');
    } catch (err) {
      const blob = new Blob([youtubeExportText], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${youtubeExportTitle.replace(/[\\/*?:"<>|]/g, '_')}_tracklist.txt`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('💾 บันทึกไฟล์ .txt เรียบร้อยแล้ว!', 'success');
    }
  };

  const handleOpenTrackFolder = async (track: Track, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    try {
      let folderPath = '';
      if (track.filepath) {
        const lastSlash = Math.max(track.filepath.lastIndexOf('/'), track.filepath.lastIndexOf('\\'));
        if (lastSlash > 0) {
          folderPath = track.filepath.substring(0, lastSlash);
        } else {
          folderPath = track.filepath;
        }
      }
      const pName = getTrackFolderName(track);
      await invokeBackend('open_folder', {
        path: folderPath,
        playlist_name: pName !== 'Singles' ? pName : '',
        playlistName: pName !== 'Singles' ? pName : '',
      });
      showToast(`📁 เปิดโฟลเดอร์ "${pName || 'Downloads'}" ในเครื่องแล้ว`, 'info');
    } catch (err) {
      console.error('Error opening folder:', err);
    }
  };

  const handleToggleSelectLibTrack = (index: number) => {
    setSelectedLibIndices((prev) =>
      prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index]
    );
  };

  const handleToggleSelectAllLib = () => {
    if (selectedLibIndices.length === filteredLibrary.length) {
      setSelectedLibIndices([]);
    } else {
      setSelectedLibIndices(filteredLibrary.map((_, idx) => idx));
    }
  };

  const handleSendSelectedLibToMixtape = () => {
    const selected = selectedLibIndices.map((i) => filteredLibrary[i]).filter(Boolean);
    if (selected.length === 0) return showToast('No tracks selected in Library', 'info');
    setMixtapeTracks(selected);
    setSelectedLibIndices([]);
    setActiveTab('mixtape');
    showToast(`Loaded ${selected.length} selected tracks into Smart Mixtape Studio`, 'success');
  };

  const handleAddSelectedLibToQueue = () => {
    const selected = selectedLibIndices.map((i) => filteredLibrary[i]).filter(Boolean);
    if (selected.length === 0) return showToast('No tracks selected in Library', 'info');
    setTracks((prev) => [...prev, ...selected]);
    setSelectedLibIndices([]);
    setActiveTab('queue');
    showToast(`Added ${selected.length} tracks to Download Queue`, 'success');
  };

  const handleRescanFolder = async () => {
    try {
      showToast('🔄 กำลังสแกนโฟลเดอร์และซิงค์ตำแหน่งไฟล์เพลง...', 'info');
      const synced = await invokeBackend('sync_library');
      if (Array.isArray(synced)) {
        setLibraryTracks(synced);
      } else {
        await refreshLibrary();
      }
      showToast('✅ ซิงค์โฟลเดอร์ อัปเดตแท็ก และตำแหน่งเพลงในเครื่องเรียบร้อยแล้ว!', 'success');
    } catch (err) {
      await refreshLibrary();
      showToast('✅ ซิงค์เสร็จสิ้น', 'success');
    }
  };

  // Batch Operations for Selected Library Tracks
  const handleBatchNormalize = async (useSelected: boolean = false) => {
    const targetTracks = (useSelected && selectedLibIndices.length > 0)
      ? selectedLibIndices.map((i) => filteredLibrary[i]).filter(Boolean)
      : filteredLibrary;
    const filepaths = targetTracks.map(t => t.filepath).filter(Boolean) as string[];
    if (filepaths.length === 0) {
      showToast('No audio files found to balance volume', 'warning');
      return;
    }
    setIsNormalizingBatch(true);
    showToast(`Balancing loudness for ${filepaths.length} tracks (${targetLufs} LUFS)...`, 'info');
    try {
      const res: any = await invokeBackend('batch_normalize_tracks', {
        filepaths,
        target_lufs: targetLufs,
      });
      if (res && res.success) {
        showToast(`Balanced & normalized ${res.normalized_count || filepaths.length} songs to ${targetLufs} LUFS!`, 'success');
        refreshLibrary();
      } else {
        showToast('Volume balancing finished', 'info');
      }
    } catch (e: any) {
      showToast(`Normalization error: ${e}`, 'error');
    } finally {
      setIsNormalizingBatch(false);
    }
  };

  const handleBatchSetRating = async (stars: number) => {
    const selectedTracks = selectedLibIndices.map((i) => filteredLibrary[i]).filter(Boolean);
    const filepaths = selectedTracks.map(t => t.filepath).filter(Boolean) as string[];
    if (filepaths.length === 0) return;
    await invokeBackend('batch_update_tracks', {
      filepaths,
      updated_fields: { stars, rating_255: stars * 51 }
    });
    refreshLibrary();
    showToast(`Updated rating to ${stars} ⭐ for ${filepaths.length} tracks!`, 'success');
  };

  const handleBatchSetGenre = async (genre: string) => {
    const selectedTracks = selectedLibIndices.map((i) => filteredLibrary[i]).filter(Boolean);
    const filepaths = selectedTracks.map(t => t.filepath).filter(Boolean) as string[];
    if (filepaths.length === 0) return;
    await invokeBackend('batch_update_tracks', {
      filepaths,
      updated_fields: { genre }
    });
    refreshLibrary();
    showToast(`Updated genre to "${genre}" for ${filepaths.length} tracks!`, 'success');
  };

  const handleBatchDelete = async (deleteFromDisk: boolean = false) => {
    const selectedTracks = selectedLibIndices.map((i) => filteredLibrary[i]).filter(Boolean);
    const filepaths = selectedTracks.map(t => t.filepath).filter(Boolean) as string[];
    if (filepaths.length === 0) return;
    if (!confirm(`Are you sure you want to delete ${filepaths.length} tracks ${deleteFromDisk ? 'from library and disk' : 'from library'}?`)) return;
    await invokeBackend('batch_delete_tracks', {
      filepaths,
      delete_files: deleteFromDisk
    });
    setSelectedLibIndices([]);
    refreshLibrary();
    showToast(`Deleted ${filepaths.length} tracks`, 'info');
  };

  // Helper to reliably extract folder name from playlist_name, filepath, or source
  const getTrackFolderName = (t?: Track | null): string => {
    if (!t) return 'Singles';
    if (t.playlist_name && t.playlist_name.trim() && !['singles', 'all', 'library', 'playlist'].includes(t.playlist_name.trim().toLowerCase())) {
      return t.playlist_name.trim();
    }
    if (t.filepath) {
      const normalized = t.filepath.replace(/\\/g, '/');
      const parts = normalized.split('/');
      if (parts.length >= 2) {
        const folderName = parts[parts.length - 2]?.trim();
        if (folderName && !['downloads', 'music convertor', 'dj_usb_export', 'dj_gig_storage', 'scratch'].includes(folderName.toLowerCase())) {
          return folderName;
        }
      }
    }
    if (t.source && !['Library', 'Playlist', 'Singles', 'All'].includes(t.source)) {
      return t.source;
    }
    return 'Singles';
  };

  // Direct USB / DJ Drive Export
  const [exportSourceMode, setExportSourceMode] = useState<string>('all');
  const [exportStructureMode, setExportStructureMode] = useState<'by_playlist' | 'by_gig_crates' | 'direct'>('by_playlist');

  const uniquePlaylistsWithCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    libraryTracks.forEach(t => {
      const p = getTrackFolderName(t);
      counts[p] = (counts[p] || 0) + 1;
    });
    return Object.entries(counts).map(([name, count]) => ({ name, count }));
  }, [libraryTracks]);

  const handleOpenUsbModal = async () => {
    try {
      const drives: any[] = await invokeBackend('get_removable_drives');
      setAvailableDrives(drives || []);
      if (drives && drives.length > 0) {
        const fDrive = drives.find((d: any) => d.letter === 'F') || drives[0];
        const djMusicSub = fDrive.subfolders?.find((s: any) => s.name.toLowerCase() === 'dj music');
        if (djMusicSub) {
          setSelectedDrivePath(djMusicSub.path);
        } else {
          setSelectedDrivePath(fDrive.path);
        }
      } else {
        setSelectedDrivePath('F:\\DJ Music');
      }
    } catch (e) {
      setSelectedDrivePath('F:\\DJ Music');
    }
    setExportSourceMode(libFilterPlaylist !== 'ALL' ? libFilterPlaylist : (selectedLibIndices.length > 0 ? 'selected' : 'all'));
    setShowUsbModal(true);
  };

  const handleBrowseExportFolder = async () => {
    try {
      const chosen = await invokeBackend('browse_directory', { initial_dir: selectedDrivePath });
      if (chosen && typeof chosen === 'string' && chosen.trim()) {
        setSelectedDrivePath(chosen.trim());
      }
    } catch (e) {
      console.error('Browse directory error:', e);
    }
  };

  const handleConfirmUsbExport = async () => {
    let target: Track[] = [];
    let structMode = exportStructureMode;
    let exportTitle = 'USB DJ Collection';

    if (exportSourceMode === 'selected') {
      target = selectedLibIndices.map(i => filteredLibrary[i]).filter(Boolean);
      exportTitle = 'Selected Tracks';
    } else if (exportSourceMode === 'crates') {
      target = libraryTracks;
      structMode = 'by_gig_crates';
      exportTitle = '10 Pro DJ Crates';
    } else if (exportSourceMode === 'all') {
      target = activeTab === 'mixtape' && mixtapeTracks.length > 0 ? mixtapeTracks : libraryTracks;
      exportTitle = 'All Playlists';
    } else {
      // Specific playlist name
      target = libraryTracks.filter(t => getTrackFolderName(t) === exportSourceMode);
      exportTitle = exportSourceMode;
    }

    if (target.length === 0) {
      showToast('No tracks found to export', 'error');
      return;
    }

    if (!selectedDrivePath.trim()) {
      showToast('Please select a destination folder / drive', 'error');
      return;
    }

    setIsExportingUsb(true);
    try {
      const res: any = await invokeBackend('export_to_dj_drive', {
        tracks: target,
        target_dir: selectedDrivePath.trim(),
        structure_mode: structMode,
        playlist_name: exportTitle
      });
      if (res && res.success) {
        setShowUsbModal(false);
        showToast(`⚡ Exported ${res.total_tracks || res.exported_count || target.length} tracks to ${selectedDrivePath}!`, 'success');
      } else {
        showToast('USB Export failed', 'error');
      }
    } catch (e) {
      showToast('USB Export error: ' + e, 'error');
    } finally {
      setIsExportingUsb(false);
    }
  };

  const handleDeleteLibraryTrack = async (filepath: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Delete track from Library & Disk?')) return;
    await invokeBackend('delete_history_track', { filepath, delete_file: true });
    refreshLibrary();
    showToast('Track deleted', 'info');
  };

  const handleAddAllLibraryToMixtape = () => {
    const list = mixtapeCount > 0 && libraryTracks.length > mixtapeCount ? libraryTracks.slice(0, mixtapeCount) : [...libraryTracks];
    setMixtapeTracks(list);
    setActiveTab('mixtape');
    showToast(`Loaded ${list.length} tracks into Smart Mixtape Studio`, 'success');
  };

  const handleAddTrackToMixtape = (t: Track, e: React.MouseEvent) => {
    e.stopPropagation();
    setMixtapeTracks((prev) => [...prev, t]);
    showToast(`Added "${t.title}" to Mixtape`, 'success');
  };

  const handleBrowseDir = async () => {
    try {
      const res = await invokeBackend('browse_folder');
      const selectedPath = typeof res === 'string' ? res : (res?.result || res?.path);
      if (selectedPath) {
        setOutputDir(selectedPath);
        showToast(`เปลี่ยนโฟลเดอร์เพลงเป็น: ${selectedPath}`, 'success');
        refreshLibrary();
      }
    } catch (e: any) {
      showToast('ไม่สามารถเลือกโฟลเดอร์ได้', 'error');
    }
  };

  const handleOpenFolder = () => {
    invokeBackend('open_folder', { path: outputDir });
  };

  const saveEditedTags = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTrack) return;
    const { source, index, ...trackData } = editingTrack;

    if (source === 'queue') {
      setTracks((prev) => {
        const next = [...prev];
        next[index] = { ...next[index], ...trackData };
        return next;
      });
    } else if (source === 'library') {
      setLibraryTracks((prev) => {
        const next = [...prev];
        next[index] = { ...next[index], ...trackData };
        return next;
      });
    } else if (source === 'mixtape') {
      setMixtapeTracks((prev) => {
        const next = [...prev];
        next[index] = { ...next[index], ...trackData };
        return next;
      });
    }

    await invokeBackend('save_tags', { track: trackData });
    refreshLibrary();
    setEditingTrack(null);
    showToast('Tags updated!', 'success');
  };

  const uniquePlaylists = useMemo(() => {
    const set = new Set<string>();
    libraryTracks.forEach((t) => {
      const p = getTrackFolderName(t);
      if (p && p !== 'Singles') set.add(p);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [libraryTracks]);

  const playlistDetailedList = useMemo(() => {
    const map: Record<string, {
      tracks: Track[];
      count: number;
      durationMs: number;
      genres: Record<string, number>;
      bpms: number[];
      keys: Set<string>;
      totalStars: number;
      sampleCover?: string;
    }> = {};

    libraryTracks.forEach((t) => {
      const p = getTrackFolderName(t);
      if (!map[p]) {
        map[p] = {
          tracks: [],
          count: 0,
          durationMs: 0,
          genres: {},
          bpms: [],
          keys: new Set(),
          totalStars: 0,
          sampleCover: t.cover_url,
        };
      }
      map[p].tracks.push(t);
      map[p].count += 1;
      map[p].durationMs += (t.duration_ms || 180000);
      if (t.genre) {
        map[p].genres[t.genre] = (map[p].genres[t.genre] || 0) + 1;
      }
      if (t.bpm && t.bpm > 0) {
        map[p].bpms.push(Math.round(t.bpm));
      }
      if (t.camelot) {
        map[p].keys.add(t.camelot);
      }
      map[p].totalStars += (t.stars || 3);
      if (!map[p].sampleCover && t.cover_url) {
        map[p].sampleCover = t.cover_url;
      }
    });

    return Object.entries(map).map(([name, data]) => {
      const sortedGenres = Object.entries(data.genres)
        .sort((a, b) => b[1] - a[1])
        .map(([g]) => g)
        .slice(0, 2);

      let minBpm = 0;
      let maxBpm = 0;
      let bpmStr = '--';
      if (data.bpms.length > 0) {
        minBpm = Math.min(...data.bpms);
        maxBpm = Math.max(...data.bpms);
        bpmStr = minBpm === maxBpm ? `${minBpm} BPM` : `${minBpm}-${maxBpm} BPM`;
      }

      const totalMins = Math.round(data.durationMs / 60000);
      const hrs = Math.floor(totalMins / 60);
      const mins = totalMins % 60;
      const durFormatted = hrs > 0 ? `${hrs} ชม. ${mins} นาที` : `${mins} นาที`;

      return {
        name,
        count: data.count,
        durationMs: data.durationMs,
        durationMin: totalMins,
        durationFormatted: durFormatted,
        topGenres: sortedGenres.length > 0 ? sortedGenres : ['DJ Tracks'],
        minBpm,
        maxBpm,
        bpmRange: bpmStr,
        keysCount: data.keys.size,
        avgStars: data.count > 0 ? (data.totalStars / data.count).toFixed(1) : '3.0',
        sampleCover: data.sampleCover,
        tracks: data.tracks,
      };
    });
  }, [libraryTracks]);

  const handleFolderSort = (col: 'name' | 'count' | 'duration' | 'bpm' | 'rating') => {
    if (folderSortColumn === col) {
      setFolderSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setFolderSortColumn(col);
      setFolderSortDirection(col === 'name' ? 'asc' : 'desc');
    }
  };

  const sortedAndFilteredPlaylists = useMemo(() => {
    let result = [...playlistDetailedList];
    if (folderSearchQuery.trim()) {
      const q = folderSearchQuery.toLowerCase();
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.topGenres.some((g) => g.toLowerCase().includes(q)) ||
          p.bpmRange.toLowerCase().includes(q)
      );
    }

    result.sort((a, b) => {
      let diff = 0;
      if (folderSortColumn === 'name') {
        diff = a.name.localeCompare(b.name);
      } else if (folderSortColumn === 'count') {
        diff = a.count - b.count;
      } else if (folderSortColumn === 'duration') {
        diff = a.durationMs - b.durationMs;
      } else if (folderSortColumn === 'bpm') {
        diff = a.minBpm - b.minBpm;
      } else if (folderSortColumn === 'rating') {
        diff = parseFloat(a.avgStars) - parseFloat(b.avgStars);
      }
      return folderSortDirection === 'asc' ? diff : -diff;
    });

    return result;
  }, [playlistDetailedList, folderSearchQuery, folderSortColumn, folderSortDirection]);

  // Backward compatibility alias for pills bar
  const sortedPlaylists = useMemo(() => {
    return [...playlistDetailedList].sort((a, b) => b.count - a.count);
  }, [playlistDetailedList]);

  const filteredLibrary = useMemo(() => {
    return libraryTracks.filter((t) => {
      let matchSearch = true;
      if (libSearch.trim()) {
        const qRaw = libSearch.toLowerCase().trim();
        const qNorm = normalizeThaiString(libSearch);
        const tokensRaw = qRaw.split(/\s+/).filter(Boolean);
        const tokensNorm = qNorm ? qNorm.split(/\s+/).filter(Boolean) : [];

        const combined = `${t.title || ''} ${t.artist || ''} ${t.album || ''} ${t.playlist_name || ''} ${t.genre || ''} ${t.camelot || ''} ${t.bpm || ''} ${t.year || ''}`;
        const combRaw = combined.toLowerCase();
        const combNorm = normalizeThaiString(combined);

        if (combRaw.includes(qRaw) || (qNorm && combNorm.includes(qNorm))) {
          matchSearch = true;
        } else if (tokensRaw.length > 1) {
          matchSearch = tokensRaw.every((tok, i) => {
            const tokN = tokensNorm[i] || normalizeThaiString(tok);
            return combRaw.includes(tok) || (tokN && combNorm.includes(tokN));
          });
        } else {
          matchSearch = false;
        }
      }
      const matchKey = libFilterKey === 'ALL' || t.camelot === libFilterKey;
      const matchStars = libFilterStars === 'ALL' || t.stars === libFilterStars;
      const matchGenre = libFilterGenre === 'ALL' || (t.genre || '').toLowerCase().includes(libFilterGenre.toLowerCase());
      
      const trackFolder = getTrackFolderName(t);
      const matchPlaylist =
        libFilterPlaylist === 'ALL' ||
        trackFolder.toLowerCase() === libFilterPlaylist.trim().toLowerCase() ||
        (t.playlist_name && t.playlist_name.trim().toLowerCase() === libFilterPlaylist.trim().toLowerCase());

      return matchSearch && matchKey && matchStars && matchGenre && matchPlaylist;
    });
  }, [libraryTracks, libSearch, libFilterKey, libFilterStars, libFilterGenre, libFilterPlaylist]);

  const renderStars = (stars: number = 3, onRate?: (n: number) => void) => {
    return (
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((i) => (
          <span
            key={i}
            onClick={(e) => {
              if (onRate) {
                e.stopPropagation();
                onRate(i);
              }
            }}
            className={`text-xs ${i <= stars ? 'text-amber-400' : 'text-zinc-700'} ${
              onRate ? 'cursor-pointer hover:scale-125 transition' : ''
            }`}
          >
            ★
          </span>
        ))}
      </div>
    );
  };

  return (
    <div
      onContextMenu={(e) => handleOpenContextMenu(e, null, 'general')}
      className="flex h-screen w-screen bg-[#0e0e11] text-zinc-200 select-none overflow-hidden font-sans"
    >
      
      {/* ================= LEFT SIDEBAR (Workly / macOS Style) ================= */}
      <aside className="w-64 bg-[#141417] border-r border-white/5 flex flex-col p-4 flex-shrink-0 z-20">
        
        {/* macOS Traffic Lights + Brand Header */}
        <div className="flex items-center justify-between pb-5 pt-1 px-1">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 mr-1">
              <span className="w-3 h-3 rounded-full bg-[#ff5f56] inline-block"></span>
              <span className="w-3 h-3 rounded-full bg-[#ffbd2e] inline-block"></span>
              <span className="w-3 h-3 rounded-full bg-[#27c93f] inline-block"></span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-sm tracking-tight text-white">DJ Studio</span>
            </div>
          </div>
          <button onClick={handleOpenFolder} title="Open Output Folder" className="text-zinc-500 hover:text-white p-1 text-xs">
            ↗
          </button>
        </div>

        {/* Global Search Bar */}
        <div className="relative mb-3">
          <div className="absolute left-3 top-2.5 text-zinc-500">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
            </svg>
          </div>
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const val = url.trim();
                const isUrl = val.startsWith('http://') || val.startsWith('https://') || val.startsWith('spotify:');
                if (isUrl) {
                  handleAnalyze();
                } else if (val) {
                  setSmartSearchInitialQuery(val);
                  setShowSmartSearchModal(true);
                }
              }
            }}
            placeholder="ค้นหาเพลง / URL..."
            className="w-full bg-[#1b1b1f] hover:bg-[#202024] focus:bg-[#1b1b1f] text-xs text-white pl-8 pr-12 py-2 rounded-xl border border-white/5 focus:border-indigo-500/50 focus:outline-none transition shadow-inner font-medium placeholder:text-zinc-500"
          />
          <button
            onClick={() => {
              setSmartSearchInitialQuery(url.trim());
              setShowSmartSearchModal(true);
            }}
            className="absolute right-2 top-2 flex items-center gap-1 cursor-pointer hover:opacity-80 transition"
            title="กดเพื่อเปิดค้นหาเพลงอัจฉริยะ (Ctrl+F)"
          >
            <span className="text-[10px] font-mono bg-[#28282d] hover:bg-indigo-600/40 hover:text-indigo-200 text-zinc-400 px-1.5 py-0.5 rounded border border-white/5 transition">
              ⌘ F
            </span>
          </button>
        </div>

        {/* Dedicated Smart Search Button */}
        <div
          onClick={() => {
            setSmartSearchInitialQuery(url.trim());
            setShowSmartSearchModal(true);
          }}
          className="flex items-center justify-between px-3 py-2 rounded-xl cursor-pointer bg-gradient-to-r from-indigo-500/15 via-purple-500/10 to-transparent hover:from-indigo-500/25 hover:via-purple-500/20 text-indigo-300 hover:text-white border border-indigo-500/30 transition shadow-sm mb-4"
        >
          <div className="flex items-center gap-2.5 text-xs font-bold">
            <span className="text-sm">🔍</span>
            <span>Smart Search (ค้นหาเพลง)</span>
          </div>
          <span className="text-[9px] font-mono font-bold bg-indigo-500/30 text-indigo-200 px-1.5 py-0.5 rounded">
            เพลงในเครื่อง / โหลดเพิ่ม
          </span>
        </div>

        {/* Navigation Items */}
        <div className="space-y-1 text-xs font-semibold">
          {/* Tab 1: Studio & Queue */}
          <div
            onClick={() => setActiveTab('queue')}
            className={`relative flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer transition ${
              activeTab === 'queue'
                ? 'bg-gradient-to-r from-indigo-500/15 via-purple-500/10 to-transparent text-white font-bold border border-indigo-500/30'
                : 'text-zinc-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <div className="flex items-center gap-3">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/>
              </svg>
              <span>Spotify / Beatport Queue</span>
            </div>
            {activeTab === 'queue' && (
              <span className="w-1.5 h-4 rounded-full bg-indigo-500 shadow-[0_0_10px_#6366f1]"></span>
            )}
            {tracks.length > 0 && activeTab !== 'queue' && (
              <span className="text-[10px] font-mono bg-white/10 px-1.5 py-0.5 rounded text-zinc-300">
                {tracks.length}
              </span>
            )}
          </div>

          {/* Tab 2: YouTube DJ Mixtape Extractor (DEDICATED SEPARATE TAB) */}
          <div
            onClick={() => setActiveTab('yt_extractor')}
            className={`relative flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer transition ${
              activeTab === 'yt_extractor'
                ? 'bg-gradient-to-r from-red-500/15 via-rose-500/10 to-transparent text-white font-bold border border-red-500/30'
                : 'text-zinc-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <div className="flex items-center gap-3">
              <span className="text-red-500 text-sm">▶</span>
              <span>YouTube DJ Extractor</span>
            </div>
            {activeTab === 'yt_extractor' && (
              <span className="w-1.5 h-4 rounded-full bg-red-500 shadow-[0_0_10px_#ef4444]"></span>
            )}
          </div>

          {/* Tab 3: Track Library */}
          <div
            onClick={() => {
              setActiveTab('library');
              refreshLibrary();
            }}
            className={`relative flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer transition ${
              activeTab === 'library'
                ? 'bg-gradient-to-r from-indigo-500/15 via-purple-500/10 to-transparent text-white font-bold border border-indigo-500/30'
                : 'text-zinc-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <div className="flex items-center gap-3">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/>
              </svg>
              <span>Track Library</span>
            </div>
            {activeTab === 'library' && (
              <span className="w-1.5 h-4 rounded-full bg-indigo-500 shadow-[0_0_10px_#6366f1]"></span>
            )}
            {libraryTracks.length > 0 && activeTab !== 'library' && (
              <span className="text-[10px] font-mono bg-white/10 px-1.5 py-0.5 rounded text-zinc-300">
                {libraryTracks.length}
              </span>
            )}
          </div>

          {/* Tab 4: AI DJ Gig Crates & Storage */}
          <div
            onClick={() => {
              setActiveTab('crates');
              handleFetchGigCrates();
            }}
            className={`relative flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer transition ${
              activeTab === 'crates'
                ? 'bg-gradient-to-r from-emerald-500/15 via-teal-500/10 to-transparent text-white font-bold border border-emerald-500/30'
                : 'text-zinc-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <div className="flex items-center gap-3">
              <span className="text-emerald-400 text-sm">🤖</span>
              <span>AI Gig Crates & Storage</span>
            </div>
            {activeTab === 'crates' && (
              <span className="w-1.5 h-4 rounded-full bg-emerald-500 shadow-[0_0_10px_#10b981]"></span>
            )}
          </div>

          {/* Tab 4: Smart Mixtape */}
          <div
            onClick={() => setActiveTab('mixtape')}
            className={`relative flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer transition ${
              activeTab === 'mixtape'
                ? 'bg-gradient-to-r from-indigo-500/15 via-purple-500/10 to-transparent text-white font-bold border border-indigo-500/30'
                : 'text-zinc-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <div className="flex items-center gap-3">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
              </svg>
              <span>Smart Mixtape</span>
            </div>
            {activeTab === 'mixtape' && (
              <span className="w-1.5 h-4 rounded-full bg-indigo-500 shadow-[0_0_10px_#6366f1]"></span>
            )}
          </div>

          {/* Tab 5: AI Mashup Matcher */}
          <div
            onClick={() => {
              setActiveTab('mashups');
              handleFetchMashups();
            }}
            className={`relative flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer transition ${
              activeTab === 'mashups'
                ? 'bg-gradient-to-r from-amber-500/15 via-rose-500/10 to-transparent text-white font-bold border border-amber-500/30'
                : 'text-zinc-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <div className="flex items-center gap-3">
              <span className="text-amber-400 text-sm">🔥</span>
              <span>AI Mashup Matcher</span>
            </div>
            {activeTab === 'mashups' && (
              <span className="w-1.5 h-4 rounded-full bg-amber-500 shadow-[0_0_10px_#f59e0b]"></span>
            )}
          </div>

          {/* Camelot Wheel */}
          <div
            onClick={() => setShowCamelotModal(true)}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-zinc-400 hover:text-white hover:bg-white/5 cursor-pointer transition"
          >
            <svg className="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="9" strokeWidth="2"/>
              <path strokeLinecap="round" strokeWidth="2" d="M12 3v18M3 12h18"/>
            </svg>
            <span>Camelot Wheel</span>
          </div>

          {/* AI DJ Vibe Curator */}
          <div
            onClick={() => setShowAiModal(true)}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-purple-300 hover:text-white hover:bg-purple-500/10 cursor-pointer transition border border-purple-500/20 shadow-sm"
          >
            <span className="text-sm">🤖</span>
            <span className="font-bold">AI DJ Vibe Curator</span>
          </div>
        </div>

        {/* Categories / DJ Crates */}
        <div className="mt-6 pt-4 border-t border-white/5">
          <div className="flex items-center justify-between px-3 mb-2 text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
            <span>DJ CRATES & EXPORT</span>
          </div>
          <div className="space-y-0.5 text-xs text-zinc-400 font-medium">
            <div onClick={() => handleExportRekordbox()} className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg hover:bg-white/5 hover:text-white cursor-pointer transition">
              <span className="text-purple-400">📦</span>
              <span>rekordbox XML (1-5★)</span>
            </div>
            <div onClick={() => handleExportM3U8()} className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg hover:bg-white/5 hover:text-white cursor-pointer transition">
              <span className="text-emerald-400">🎵</span>
              <span>M3U8 Playlist</span>
            </div>
            <div onClick={handleBrowseDir} className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg hover:bg-white/5 hover:text-white cursor-pointer transition">
              <span className="text-amber-400">📁</span>
              <span>Set Save Folder</span>
            </div>
          </div>
        </div>

        {/* Boost with AI / Harmonic Card */}
        <div className="mt-auto pt-3">
          <div className="p-3.5 rounded-2xl bg-[#1b1b20] border border-white/5 space-y-2.5 shadow-lg">
            <div className="flex items-center gap-2 text-xs font-bold text-white">
              <span className="text-indigo-400">✨</span>
              <span>Harmonic AI Studio</span>
            </div>
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              Auto Camelot Key, BPM & 1-5 Stars rating ready for rekordbox.
            </p>
            <button
              onClick={() => {
                setActiveTab('mixtape');
                handleBuildMixtape();
              }}
              className="w-full py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold text-xs shadow-md transition active:scale-95"
            >
              Auto-Mix Mixtape
            </button>
          </div>
        </div>

        {/* Bottom Profile / Storage Card */}
        <div className="mt-3 pt-3 border-t border-white/5 flex items-center justify-between px-1">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-cyan-500 to-indigo-600 flex items-center justify-center text-xs font-bold text-white shadow">
              🎧
            </div>
            <div>
              <p className="text-xs font-bold text-white leading-none">DJ Pro User</p>
              <p className="text-[10px] text-zinc-500 font-mono mt-0.5">{libraryTracks.length} tracks in library</p>
            </div>
          </div>
        </div>

      </aside>

      {/* ================= RIGHT MAIN STAGE ================= */}
      <div className="flex-1 flex flex-col min-w-0 bg-[#0e0e11] overflow-hidden">
        
        {/* Main Stage Header */}
        <div className="px-8 pt-6 pb-4 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-2xl font-black text-white tracking-tight">
              {activeTab === 'queue'
                ? 'Spotify & Download Queue'
                : activeTab === 'yt_extractor'
                ? 'YouTube DJ Set & Mixtape Extractor'
                : activeTab === 'library'
                ? 'Track Knowledgebase'
                : activeTab === 'crates'
                ? 'AI DJ Gig Crates & Smart Storage'
                : activeTab === 'mashups'
                ? 'AI DJ Mashup Matcher & Synergy Engine'
                : 'Smart Mixtape Sequencer'}
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              {activeTab === 'queue'
                ? 'Convert Spotify tracks/playlists to 320kbps Lossless, analyze Key/BPM & auto-tag for DJing'
                : activeTab === 'yt_extractor'
                ? 'Extract individual tracklists from YouTube DJ Live Sets, Boiler Rooms, and Mixtapes'
                : activeTab === 'library'
                ? 'Manage converted tracks, filter by Camelot Key, rating, and preview audio'
                : activeTab === 'crates'
                ? 'Auto-classify and structure library into professional Gig Profiles & Rekordbox Storage folders'
                : activeTab === 'mashups'
                ? 'Discovers 100% harmonic compatible pairs, layers vocal hooks on heavy drops, and calculates tempo sync'
                : 'Automatically sequence tracks using harmonic key transitions and energy curve'}
            </p>
          </div>

          {/* Settings Dropdowns */}
          <div className="flex items-center gap-2">
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value)}
              className="bg-[#18181c] text-white text-xs font-semibold px-3 py-1.5 rounded-xl border border-white/10 focus:outline-none cursor-pointer"
            >
              <option value="MP3">MP3 320k</option>
              <option value="FLAC">FLAC Lossless</option>
              <option value="M4A">M4A / AAC</option>
              <option value="WAV">WAV</option>
            </select>

            <select
              value={stemType}
              onChange={(e) => setStemType(e.target.value)}
              className="bg-[#18181c] text-white text-xs font-semibold px-3 py-1.5 rounded-xl border border-white/10 focus:outline-none cursor-pointer"
            >
              <option value="full">🎵 Full Track</option>
              <option value="acapella">🎤 Acapella (Vocal)</option>
              <option value="instrumental">🎹 Instrumental (Beat)</option>
            </select>

            <select
              value={folderMode}
              onChange={(e) => setFolderMode(e.target.value)}
              className="bg-[#18181c] text-white text-xs font-semibold px-3 py-1.5 rounded-xl border border-white/10 focus:outline-none cursor-pointer"
            >
              <option value="playlist">📁 By Playlist / Chart (แยกตาม Playlist + .m3u8)</option>
              <option value="single">📁 Single Folder (โฟลเดอร์รวม ไม่แยก)</option>
              <option value="artist_album">👤 Artist / Album</option>
              <option value="camelot_key">🎛️ Camelot Key</option>
            </select>

            {/* Auto-Gain Volume Normalization */}
            <select
              value={normalizeAudio ? `${targetLufs}` : 'off'}
              onChange={(e) => {
                if (e.target.value === 'off') {
                  setNormalizeAudio(false);
                } else {
                  setNormalizeAudio(true);
                  setTargetLufs(parseFloat(e.target.value));
                }
              }}
              className={`text-xs font-semibold px-3 py-1.5 rounded-xl border transition cursor-pointer ${
                normalizeAudio
                  ? 'bg-teal-500/10 border-teal-500/40 text-teal-300 font-bold'
                  : 'bg-[#18181c] border-white/10 text-zinc-400'
              }`}
              title="EBU R128 Auto-Gain Volume Normalization across all tracks"
            >
              <option value="-14">⚖️ Auto-Gain (-14 LUFS DJ Std)</option>
              <option value="-12">🔊 Club Boost (-12 LUFS Loud)</option>
              <option value="-16">🎧 Streaming (-16 LUFS Soft)</option>
              <option value="off">🚫 No Normalization (Original Volume)</option>
            </select>
          </div>
        </div>

        {/* Content View Container */}
        <div className="flex-1 flex flex-col min-h-0 px-8 pb-4 overflow-hidden">
          
          {/* ================= VIEW 1: SPOTIFY & QUEUE ================= */}
          {activeTab === 'queue' && (
            <div className="flex-1 flex flex-col min-h-0 bg-[#141417] rounded-3xl border border-white/5 overflow-hidden shadow-2xl">
              
              {/* Input Action Bar */}
              <div className="p-4 border-b border-white/5 bg-[#18181c]/50 flex items-center justify-between gap-4">
                <div className="flex-1 max-w-xl flex items-center gap-2">
                  <input
                    type="text"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const val = url.trim();
                        const isUrl = val.startsWith('http://') || val.startsWith('https://') || val.startsWith('spotify:');
                        if (isUrl) {
                          handleAnalyze();
                        } else if (val) {
                          setSmartSearchInitialQuery(val);
                          setShowSmartSearchModal(true);
                        }
                      }
                    }}
                    placeholder="วางลิงก์ YouTube / Spotify / Beatport หรือพิมพ์ชื่อเพลงไทย-สากลเพื่อค้นหา..."
                    className="flex-1 bg-[#101013] text-white text-xs px-4 py-2.5 rounded-xl border border-white/10 focus:border-indigo-500/50 focus:outline-none transition shadow-inner font-medium placeholder:text-zinc-500"
                  />
                  <button
                    onClick={handlePaste}
                    className="px-3 py-2.5 bg-[#202026] hover:bg-[#282830] text-zinc-300 hover:text-white rounded-xl text-xs font-semibold transition"
                  >
                    Paste
                  </button>
                  <button
                    onClick={() => {
                      setSmartSearchInitialQuery(url.trim());
                      setShowSmartSearchModal(true);
                    }}
                    className="px-3.5 py-2.5 bg-gradient-to-r from-indigo-600/30 to-purple-600/30 hover:from-indigo-600/50 hover:to-purple-600/50 text-indigo-200 hover:text-white border border-indigo-500/30 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-lg active:scale-95 whitespace-nowrap"
                    title="ค้นหาเพลงในเครื่องและออนไลน์ (Ctrl+F)"
                  >
                    <span>🔍</span>
                    <span>ค้นหาเพลง</span>
                  </button>
                  <button
                    disabled={isAnalyzing}
                    onClick={handleAnalyze}
                    className="px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold text-xs rounded-xl shadow transition disabled:opacity-50 flex items-center gap-2"
                  >
                    {isAnalyzing && <span className="animate-spin text-xs">↻</span>}
                    <span>{isAnalyzing ? 'Analyzing...' : 'Add'}</span>
                  </button>

                  <button
                    onClick={() => setShowAiModal(true)}
                    className="px-3.5 py-2.5 bg-gradient-to-r from-purple-600/30 to-pink-600/30 hover:from-purple-600/50 hover:to-pink-600/50 text-purple-200 hover:text-white border border-purple-500/30 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-lg active:scale-95 whitespace-nowrap"
                    title="ให้ AI ช่วยเลือกเพลงตามบรรยากาศร้านและลูกค้า"
                  >
                    <span>🤖</span>
                    <span>AI DJ Curator</span>
                  </button>
                </div>

                <div className="flex items-center gap-2.5">
                  {selectedIndices.length > 0 && (
                    <>
                      <button
                        onClick={() => handleAddMultipleToQueue(selectedIndices.map(i => tracks[i]).filter(Boolean), false)}
                        className="px-3.5 py-2 rounded-xl bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300 hover:text-white border border-indigo-500/40 font-bold text-xs shadow transition flex items-center gap-1.5 active:scale-95"
                        title="เพิ่มเพลงที่เลือกลงในเครื่องเล่น (Up Next Queue)"
                      >
                        <span>📑 + ลงคิว ({selectedIndices.length})</span>
                      </button>

                      <button
                        disabled={isConvertingAll}
                        onClick={handleConvertSelected}
                        className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 active:scale-95 text-white font-bold text-xs shadow-lg transition flex items-center gap-1.5"
                      >
                        {isConvertingAll ? <span className="animate-spin text-xs">↻</span> : <span>↓</span>}
                        <span>Download Selected ({selectedIndices.length})</span>
                      </button>
                      <button
                        onClick={handleRemoveSelected}
                        className="px-3 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 font-semibold text-xs border border-rose-500/20 transition"
                        title="Remove Selected"
                      >
                        ✕ Remove
                      </button>
                    </>
                  )}

                  <button
                    disabled={tracks.length === 0 || isConvertingAll}
                    onClick={handleConvertAll}
                    className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white font-bold text-xs shadow-lg transition disabled:opacity-40 flex items-center gap-2"
                  >
                    {isConvertingAll ? <span className="animate-spin text-xs">↻</span> : <span>↓</span>}
                    <span>Convert All Queue</span>
                  </button>

                  <button
                    onClick={() => handleExportRekordbox(tracks)}
                    className="px-4 py-2 rounded-xl bg-[#202026] hover:bg-[#282830] text-zinc-200 text-xs font-semibold border border-white/5 transition"
                  >
                    rekordbox XML
                  </button>
                </div>
              </div>

              {/* Overall Queue Progress Bar */}
              {tracks.length > 0 && (
                <div className="px-6 py-2.5 bg-[#121215] border-b border-white/5 flex items-center justify-between gap-4 flex-shrink-0">
                  <div className="flex items-center gap-3 text-xs">
                    <span className="font-bold text-white flex items-center gap-1.5">
                      {isConvertingAll && <span className="animate-spin text-indigo-400">↻</span>}
                      <span>{isConvertingAll ? 'Converting Queue in progress...' : 'Queue Progress:'}</span>
                    </span>
                    <span className="font-mono font-bold text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-lg border border-indigo-500/20">
                      {tracks.filter(t => t.done).length} / {tracks.length} Completed ({tracks.length > 0 ? Math.round((tracks.filter(t => t.done).length / tracks.length) * 100) : 0}%)
                    </span>
                  </div>
                  <div className="flex-1 max-w-sm bg-zinc-800/80 h-2 rounded-full overflow-hidden border border-white/5">
                    <div
                      className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-emerald-400 transition-all duration-500 shadow-[0_0_12px_#6366f1]"
                      style={{ width: `${tracks.length > 0 ? (tracks.filter(t => t.done).length / tracks.length) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Table */}
              <div className="flex-1 overflow-y-auto px-6 py-2 pb-32">
                <div className="grid grid-cols-12 gap-4 px-4 py-3 border-b border-white/5 text-[11px] font-bold text-zinc-500 uppercase tracking-wider items-center">
                  <div className="col-span-1 text-center flex items-center justify-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={tracks.length > 0 && selectedIndices.length === tracks.length}
                      onChange={toggleSelectAll}
                      className="rounded accent-indigo-500 cursor-pointer w-3.5 h-3.5"
                      title="Select All"
                    />
                    <span>#</span>
                  </div>
                  <div className="col-span-4">Track Title</div>
                  <div className="col-span-2">Genre / Style</div>
                  <div className="col-span-1 text-center font-mono">Key</div>
                  <div className="col-span-1 text-center font-mono">BPM</div>
                  <div className="col-span-1 text-center">Stars</div>
                  <div className="col-span-2 text-right">Actions</div>
                </div>

                <div className="py-2 space-y-1">
                  {tracks.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-28 text-zinc-600">
                      <p className="font-bold text-zinc-400 text-sm">Queue is empty</p>
                      <p className="text-xs text-zinc-600 mt-1">Paste a Spotify or Beatport URL (Track, Release, Chart, Top 100) to load songs</p>
                    </div>
                  ) : (
                    <AnimatePresence>
                      {tracks.map((t, idx) => (
                        <motion.div
                          key={t.id || idx}
                          layout
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          onContextMenu={(e) => handleOpenContextMenu(e, t, 'queue', idx, tracks)}
                          className={`grid grid-cols-12 gap-4 items-center px-4 py-2.5 rounded-2xl hover:bg-white/[0.04] border border-transparent hover:border-white/5 transition ${
                            isSameTrack(activeTrack, t) ? 'bg-indigo-500/10 border-indigo-500/30' : ''
                          }`}
                        >
                          <div className="col-span-1 text-center text-xs font-mono text-zinc-400 font-bold flex items-center justify-center gap-1.5">
                            <input
                              type="checkbox"
                              checked={selectedIndices.includes(idx)}
                              onChange={() => toggleSelectTrack(idx)}
                              className="rounded accent-indigo-500 cursor-pointer w-3.5 h-3.5"
                            />
                            <span className="w-5 text-right font-bold text-zinc-400">#{idx + 1}</span>
                            <button onClick={() => playTrack(t, tracks, false)} className="text-zinc-400 hover:text-indigo-400 transition p-0.5">
                              {activeTrack && isSameTrack(activeTrack, t) && isPlaying ? '⏸' : '▶'}
                            </button>
                          </div>

                          <div className="col-span-4 flex items-center gap-3.5 min-w-0">
                            <div className="w-10 h-10 rounded-xl bg-[#202026] flex-shrink-0 overflow-hidden shadow border border-white/5">
                              {t.cover_url ? (
                                <img src={t.cover_url} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-xs text-zinc-400">🎵</div>
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className={`text-sm font-semibold truncate leading-snug ${t.done ? 'text-emerald-400' : 'text-white'}`}>{t.title}</p>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <p className="text-xs text-zinc-400 font-medium truncate max-w-[140px]">{t.artist || 'Unknown Artist'}</p>
                                {t.playlist_name && (
                                  <span
                                    onClick={(e) => handleOpenTrackFolder(t, e)}
                                    className="text-[9px] font-medium text-indigo-300 hover:text-white bg-indigo-500/15 hover:bg-indigo-500/35 border border-indigo-500/25 hover:border-indigo-400 px-1.5 py-0.5 rounded-md truncate max-w-[140px] cursor-pointer transition flex items-center gap-1 shadow-sm active:scale-95 group"
                                    title={`คลิกเพื่อเปิดโฟลเดอร์ "${t.playlist_name}" ในคอมพิวเตอร์ (Open in Explorer)`}
                                  >
                                    <span className="group-hover:scale-110 transition-transform">📁</span>
                                    <span className="truncate">{t.playlist_name}</span>
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="col-span-2 flex flex-col justify-center min-w-0">
                            <span className="inline-flex items-center w-fit px-2 py-0.5 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-[10px] font-bold truncate">
                              {t.genre || 'Electronic / Dance'}
                            </span>
                            <span className="text-[10px] text-zinc-400 font-mono truncate mt-0.5">
                              {t.source || 'Online'}
                            </span>
                          </div>

                          <div className="col-span-1 text-center">
                            <span
                              onClick={() => {
                                setSelectedKeyForWheel(t.camelot || '8A');
                                setShowCamelotModal(true);
                              }}
                              className="text-xs font-mono font-bold px-2 py-0.5 rounded-lg bg-[#202026] text-zinc-200 border border-white/5 cursor-pointer hover:border-indigo-400 transition"
                            >
                              {t.camelot || '--'}
                            </span>
                          </div>

                          <div className="col-span-1 text-center">
                            <span className="text-xs font-mono font-semibold text-zinc-300">{t.bpm ? Math.round(t.bpm) : '—'}</span>
                          </div>

                          <div className="col-span-1 flex justify-center">{renderStars(t.stars || 3)}</div>

                          <div className="col-span-2 flex items-center justify-end gap-2 text-xs">
                            {t.progress && t.progress > 0 && !t.done ? (
                              <div className="flex items-center gap-2 bg-[#1b1b22] px-3 py-1.5 rounded-xl border border-indigo-500/30 shadow">
                                <div className="w-14 bg-zinc-800 h-1.5 rounded-full overflow-hidden relative">
                                  <div className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 animate-pulse w-full" />
                                </div>
                                <span className="text-[10px] font-mono font-bold text-indigo-400 animate-pulse">Downloading...</span>
                              </div>
                            ) : (
                              <button
                                disabled={t.done}
                                onClick={() => convertSingle(idx)}
                                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition active:scale-95 flex items-center gap-1.5 shadow ${
                                  t.done
                                    ? 'text-emerald-400 bg-emerald-500/15 border border-emerald-500/30'
                                    : 'text-white bg-indigo-600 hover:bg-indigo-500 hover:scale-105'
                                }`}
                              >
                                {t.done ? (
                                  <>
                                    <span>✓</span>
                                    <span>320k</span>
                                  </>
                                ) : (
                                  <>
                                    <span>↓</span>
                                    <span>Download</span>
                                  </>
                                )}
                              </button>
                            )}

                            <button onClick={() => setEditingTrack({ ...t, index: idx, source: 'queue' })} className="text-zinc-500 hover:text-white p-1" title="Edit Tags">
                              ✏️
                            </button>
                            <button onClick={() => setTracks((prev) => prev.filter((_, i) => i !== idx))} className="text-zinc-600 hover:text-rose-400 p-1" title="Remove">
                              ✕
                            </button>
                          </div>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  )}
                </div>
              </div>

            </div>
          )}

          {/* ================= VIEW 2: YOUTUBE DJ EXTRACTOR (DEDICATED TAB) ================= */}
          {activeTab === 'yt_extractor' && (
            <div className="flex-1 flex flex-col min-h-0 bg-[#141417] rounded-3xl border border-white/5 overflow-hidden shadow-2xl">
              
              {/* YouTube Input Action Bar */}
              <div className="p-4 border-b border-white/5 bg-[#18181c]/50 flex items-center justify-between gap-4">
                <div className="flex-1 max-w-2xl flex items-center gap-2">
                  <input
                    type="text"
                    value={ytUrl}
                    onChange={(e) => setYtUrl(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleExtractYouTubeMixtape()}
                    placeholder="Paste YouTube DJ Set, Live Mix, or Boiler Room URL (e.g. https://www.youtube.com/watch?v=...)..."
                    className="flex-1 bg-[#101013] text-white text-xs px-4 py-2.5 rounded-xl border border-white/10 focus:border-red-500/50 focus:outline-none transition shadow-inner"
                  />
                  <button
                    onClick={async () => {
                      try {
                        const text = await navigator.clipboard.readText();
                        setYtUrl(text.trim());
                      } catch (e) {
                        showToast('Clipboard empty', 'error');
                      }
                    }}
                    className="px-3 py-2.5 bg-[#202026] hover:bg-[#282830] text-zinc-300 hover:text-white rounded-xl text-xs font-semibold transition"
                  >
                    Paste
                  </button>
                  <button
                    disabled={isExtractingYt || isScanningShazam}
                    onClick={handleExtractYouTubeMixtape}
                    className="px-5 py-2.5 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white font-bold text-xs rounded-xl shadow transition disabled:opacity-50 flex items-center gap-2"
                  >
                    {isExtractingYt && <span className="animate-spin text-xs">↻</span>}
                    <span>{isExtractingYt ? 'Extracting Set...' : 'Extract Tracklist'}</span>
                  </button>
                  <button
                    disabled={isScanningShazam || isExtractingYt}
                    onClick={handleScanYouTubeShazam}
                    className="px-4 py-2.5 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-bold rounded-xl text-xs shadow transition disabled:opacity-50 flex items-center gap-1.5"
                    title="Scan audio directly with Shazam AI recognition"
                  >
                    {isScanningShazam ? <span className="animate-spin text-xs">↻</span> : <span>🎙️</span>}
                    <span>{isScanningShazam ? 'Scanning Shazam...' : 'Scan with Shazam AI'}</span>
                  </button>
                  <button
                    onClick={() => setShowTracklistModal(true)}
                    className="px-4 py-2.5 bg-[#202026] hover:bg-[#282830] text-indigo-400 font-bold rounded-xl text-xs border border-white/5 transition flex items-center gap-1.5"
                  >
                    <span>📝 Paste Tracklist Text</span>
                  </button>
                </div>

                {ytExtractedTracks.length > 0 && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleAddYtTracksToQueue}
                      className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold text-xs shadow-lg active:scale-95 transition flex items-center gap-2"
                    >
                      <span>⚡ Add All {ytExtractedTracks.length} Songs to Download Queue</span>
                    </button>
                    <button
                      onClick={() => {
                        setYtExtractedTracks([]);
                        showToast('Cleared YouTube tracklist', 'info');
                      }}
                      className="px-3.5 py-2.5 rounded-xl bg-[#202026] hover:bg-rose-500/20 text-zinc-400 hover:text-rose-400 border border-white/10 hover:border-rose-500/30 text-xs font-bold transition flex items-center gap-1.5 active:scale-95"
                      title="Clear Extracted Tracklist"
                    >
                      <span>🗑️</span>
                      <span>Clear List</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Extracted Songs Table */}
              <div className="flex-1 overflow-y-auto px-6 py-2 pb-32">
                <div className="grid grid-cols-12 gap-4 px-4 py-3 border-b border-white/5 text-[11px] font-bold text-zinc-500 uppercase tracking-wider items-center">
                  <div className="col-span-1 text-center font-mono font-bold text-red-400">#</div>
                  <div className="col-span-5">Song Title</div>
                  <div className="col-span-3">Artist / Album</div>
                  <div className="col-span-3 text-right">Action</div>
                </div>

                <div className="py-2 space-y-1">
                  {ytExtractedTracks.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-28 text-zinc-600">
                      <span className="text-3xl mb-2">📼</span>
                      <p className="font-bold text-zinc-400 text-sm">No YouTube DJ Set extracted</p>
                      <p className="text-xs text-zinc-600 mt-1">Paste a YouTube DJ Mixtape URL above to automatically extract chapters and tracklist</p>
                    </div>
                  ) : (
                    ytExtractedTracks.map((t, idx) => (
                      <div
                        key={t.id || idx}
                        onContextMenu={(e) => handleOpenContextMenu(e, t, 'yt_extractor', idx, ytExtractedTracks)}
                        className="grid grid-cols-12 gap-4 items-center px-4 py-2.5 rounded-2xl hover:bg-white/[0.04] border border-transparent hover:border-white/5 transition"
                      >
                        <div className="col-span-1 text-center text-xs font-mono font-bold text-red-400">
                          #{idx + 1}
                        </div>

                        <div className="col-span-5 flex items-center gap-3.5 min-w-0">
                          <div className="w-10 h-10 rounded-xl bg-[#202026] flex-shrink-0 overflow-hidden flex items-center justify-center text-sm text-red-400 border border-white/5">
                            🎵
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-white truncate leading-snug">{t.title}</p>
                            <p className="text-xs text-zinc-400 font-medium truncate mt-0.5">{t.artist || 'YouTube Mix'}</p>
                          </div>
                        </div>

                        <div className="col-span-3 text-xs text-zinc-300 font-medium truncate">
                          {t.album || '—'}
                        </div>

                        <div className="col-span-3 flex items-center justify-end gap-2">
                          <button
                            onClick={() => {
                              setTracks((prev) => [...prev, t]);
                              showToast(`Added "${t.title}" to Queue`, 'success');
                            }}
                            className="px-3 py-1 rounded-xl bg-[#202026] hover:bg-[#282830] text-indigo-400 text-xs font-bold border border-white/5 transition"
                          >
                            + Add to Queue
                          </button>
                          <button
                            onClick={() => {
                              setYtExtractedTracks((prev) => prev.filter((_, i) => i !== idx));
                              showToast('Removed track from list', 'info');
                            }}
                            className="w-7 h-7 flex items-center justify-center text-zinc-500 hover:text-rose-400 rounded-lg hover:bg-rose-500/10 text-xs transition"
                            title="Remove track"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

            </div>
          )}

          {/* ================= VIEW 3: LIBRARY ================= */}
          {activeTab === 'library' && (
            <div className="flex-1 flex flex-col min-h-0 bg-[#141417] rounded-3xl border border-white/5 overflow-hidden shadow-2xl">
              
              {/* Filter & Action Toolbar */}
              <div className="p-4 border-b border-white/5 bg-[#18181c]/50 flex items-center justify-between gap-4 flex-wrap">
                <div className="flex-1 min-w-[200px] max-w-md relative flex items-center">
                  <input
                    type="text"
                    value={libSearch}
                    onChange={(e) => setLibSearch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && libSearch.trim()) {
                        setSmartSearchInitialQuery(libSearch.trim());
                        setShowSmartSearchModal(true);
                      }
                    }}
                    placeholder={`ค้นหาในคลังเพลง (${libraryTracks.length} เพลง)...`}
                    className="w-full bg-[#101013] text-white text-xs pl-4 pr-24 py-2 rounded-xl border border-white/10 focus:outline-none focus:border-indigo-500 transition"
                  />
                  <div className="absolute right-2 flex items-center gap-1">
                    {libSearch && (
                      <button onClick={() => setLibSearch('')} className="text-zinc-500 hover:text-white text-xs px-1">✕</button>
                    )}
                    <button
                      onClick={() => {
                        setSmartSearchInitialQuery(libSearch.trim());
                        setShowSmartSearchModal(true);
                      }}
                      className="text-[10px] font-bold bg-indigo-500/20 hover:bg-indigo-500/40 text-indigo-300 px-2 py-0.5 rounded-lg border border-indigo-500/30 transition shadow-sm"
                      title="ค้นหาออนไลน์เพื่อดาวน์โหลดเพลงใหม่ (Smart Search)"
                    >
                      🌐 ค้นหาออนไลน์
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <select
                    value={libFilterGenre}
                    onChange={(e) => setLibFilterGenre(e.target.value)}
                    className="bg-[#18181c] text-white text-xs font-semibold px-2.5 py-1.5 rounded-xl border border-white/10 focus:outline-none"
                  >
                    <option value="ALL">All Genres</option>
                    <option value="House">House / Dance</option>
                    <option value="Techno">Techno / Big Room</option>
                    <option value="Hip-Hop">Hip-Hop / R&B</option>
                    <option value="Pop">Pop / Nu-Disco</option>
                    <option value="Trap">Trap / Jersey</option>
                    <option value="Drum & Bass">Drum & Bass</option>
                  </select>

                  <select
                    value={libFilterKey}
                    onChange={(e) => setLibFilterKey(e.target.value)}
                    className="bg-[#18181c] text-white text-xs font-semibold px-2.5 py-1.5 rounded-xl border border-white/10 focus:outline-none"
                  >
                    <option value="ALL">All Keys</option>
                    {CAMELOT_WHEEL.map((cw) => (
                      <option key={cw.key} value={cw.key}>{cw.key} ({cw.musical})</option>
                    ))}
                  </select>

                  {/* Playlist / Chart Folder Filter */}
                  {uniquePlaylists.length > 0 && (
                    <select
                      value={libFilterPlaylist}
                      onChange={(e) => setLibFilterPlaylist(e.target.value)}
                      className="bg-[#18181c] text-white text-xs font-semibold px-2.5 py-1.5 rounded-xl border border-white/10 focus:outline-none"
                    >
                      <option value="ALL">📁 All Playlists / Folders ({libraryTracks.length})</option>
                      {uniquePlaylists.map((p) => {
                        const count = libraryTracks.filter((t) => getTrackFolderName(t) === p).length;
                        return (
                          <option key={p} value={p}>
                            📁 {p} ({count})
                          </option>
                        );
                      })}
                    </select>
                  )}

                  <select
                    value={libFilterStars}
                    onChange={(e) => setLibFilterStars(e.target.value === 'ALL' ? 'ALL' : parseInt(e.target.value))}
                    className="bg-[#18181c] text-white text-xs font-semibold px-2.5 py-1.5 rounded-xl border border-white/10 focus:outline-none"
                  >
                    <option value="ALL">All Ratings</option>
                    <option value="5">⭐⭐⭐⭐⭐ (5 Stars)</option>
                    <option value="4">⭐⭐⭐⭐ (4 Stars)</option>
                    <option value="3">⭐⭐⭐ (3 Stars)</option>
                  </select>

                  {/* Batch Action Buttons & USB Export */}
                  {selectedLibIndices.length > 0 ? (
                    <div className="flex items-center gap-1.5 bg-indigo-500/10 border border-indigo-500/30 px-2.5 py-1 rounded-2xl">
                      <span className="text-xs font-bold text-indigo-300 mr-1">
                        Selected ({selectedLibIndices.length}):
                      </span>

                      {/* Bulk Rating */}
                      <select
                        onChange={(e) => {
                          if (e.target.value) {
                            handleBatchSetRating(parseInt(e.target.value));
                            e.target.value = '';
                          }
                        }}
                        defaultValue=""
                        className="bg-[#202026] text-amber-300 text-xs font-semibold px-2 py-1 rounded-lg border border-white/10 focus:outline-none cursor-pointer"
                      >
                        <option value="" disabled>⭐ Set Stars</option>
                        <option value="5">⭐⭐⭐⭐⭐ (5)</option>
                        <option value="4">⭐⭐⭐⭐ (4)</option>
                        <option value="3">⭐⭐⭐ (3)</option>
                        <option value="2">⭐⭐ (2)</option>
                        <option value="1">⭐ (1)</option>
                      </select>

                      {/* Bulk Genre */}
                      <select
                        onChange={(e) => {
                          if (e.target.value) {
                            handleBatchSetGenre(e.target.value);
                            e.target.value = '';
                          }
                        }}
                        defaultValue=""
                        className="bg-[#202026] text-indigo-300 text-xs font-semibold px-2 py-1 rounded-lg border border-white/10 focus:outline-none cursor-pointer"
                      >
                        <option value="" disabled>🏷️ Set Genre</option>
                        <option value="House">House</option>
                        <option value="Tech House">Tech House</option>
                        <option value="Deep House">Deep House</option>
                        <option value="Techno">Techno</option>
                        <option value="Afro House">Afro House</option>
                        <option value="Pop / Nu-Disco">Pop / Nu-Disco</option>
                        <option value="Hip-Hop / R&B">Hip-Hop / R&B</option>
                        <option value="Drum & Bass">Drum & Bass</option>
                        <option value="Trance">Trance</option>
                      </select>

                      <button
                        onClick={() => handleAddMultipleToQueue(selectedLibIndices.map(i => filteredLibrary[i]).filter(Boolean), true)}
                        className="px-2.5 py-1 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow transition flex items-center gap-1 active:scale-95"
                        title="เล่นเพลงแรกที่เลือกทันทีและเพิ่มเพลงที่เหลือลงในคิวเล่นต่อ"
                      >
                        <span>▶ เล่นที่เลือก</span>
                      </button>

                      <button
                        onClick={() => handleAddMultipleToQueue(selectedLibIndices.map(i => filteredLibrary[i]).filter(Boolean), false)}
                        className="px-2.5 py-1 rounded-lg bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300 hover:text-white font-bold text-xs border border-indigo-500/40 shadow transition flex items-center gap-1 active:scale-95"
                        title="เพิ่มเพลงที่เลือกทั้งหมดลงในคิวเล่นต่อ (Up Next Queue)"
                      >
                        <span>📑 + ลงคิว ({selectedLibIndices.length})</span>
                      </button>

                      <button
                        disabled={isNormalizingBatch}
                        onClick={() => handleBatchNormalize(true)}
                        className="px-2.5 py-1 rounded-lg bg-teal-600/30 hover:bg-teal-600/50 text-teal-300 font-bold text-xs border border-teal-500/30 shadow transition flex items-center gap-1 disabled:opacity-50"
                        title="Balance volume of selected tracks to target LUFS (-14 LUFS standard)"
                      >
                        <span>⚖️</span>
                        <span>{isNormalizingBatch ? 'Normalizing...' : 'Balance Volume'}</span>
                      </button>

                      <button
                        onClick={() => handleOpenYoutubeExport(selectedLibIndices.map(i => filteredLibrary[i]).filter(Boolean), 'Selected Tracks Tracklist')}
                        className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow transition flex items-center gap-1"
                        title="Export selected tracks as YouTube / TXT Tracklist"
                      >
                        <span>📋 TXT / YouTube</span>
                      </button>

                      <button
                        onClick={handleSendSelectedLibToMixtape}
                        className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow transition flex items-center gap-1"
                        title="Send selected to Mixtape"
                      >
                        <span>🎧 Mixtape</span>
                      </button>

                      <button
                        onClick={handleOpenUsbModal}
                        className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow transition flex items-center gap-1"
                        title="Export selected tracks directly to USB / DJ Drive"
                      >
                        <span>⚡ USB Export</span>
                      </button>

                      <button
                        onClick={() => handleBatchDelete(false)}
                        className="px-2 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/40 text-rose-300 font-semibold text-xs border border-rose-500/30 transition"
                        title="Remove from Library"
                      >
                        ✕ Remove
                      </button>
                    </div>
                  ) : (
                    <>
                      <button
                        onClick={() => handleAddMultipleToQueue(filteredLibrary, false)}
                        className="px-3 py-1.5 rounded-xl bg-indigo-600/25 hover:bg-indigo-600/40 text-indigo-300 hover:text-white font-bold text-xs border border-indigo-500/30 shadow transition flex items-center gap-1.5"
                        title="เพิ่มเพลงทั้งหมดในหน้านี้ลงในคิวเล่นต่อ"
                      >
                        <span>📑 + ลงคิวทั้งหมด ({filteredLibrary.length})</span>
                      </button>
                      <button
                        disabled={isNormalizingBatch}
                        onClick={() => handleBatchNormalize(false)}
                        className="px-3 py-1.5 rounded-xl bg-teal-500/15 hover:bg-teal-500/25 text-teal-300 font-bold text-xs border border-teal-500/30 transition flex items-center gap-1.5 disabled:opacity-50"
                        title="Balance volume of all songs in library to -14 LUFS"
                      >
                        <span>⚖️</span>
                        <span>{isNormalizingBatch ? 'Normalizing...' : 'Balance All Volume'}</span>
                      </button>
                      <button
                        onClick={() => handleOpenYoutubeExport(filteredLibrary, libFilterPlaylist !== 'ALL' ? libFilterPlaylist : 'Full Library Tracklist')}
                        className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white font-bold text-xs shadow transition flex items-center gap-1.5"
                        title="Export current tracklist for YouTube Description / Chapters / .txt"
                      >
                        <span>📋 YouTube / TXT</span>
                      </button>
                      <button
                        onClick={handleAddAllLibraryToMixtape}
                        className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold text-xs shadow hover:opacity-90 transition flex items-center gap-1.5"
                      >
                        <span>⚡ Send All to Mixtape</span>
                      </button>
                      <button
                        onClick={handleOpenUsbModal}
                        className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow transition flex items-center gap-1.5"
                        title="Export library tracks to USB Flash Drive"
                      >
                        <span>⚡ USB Export</span>
                      </button>
                    </>
                  )}

                  <button
                    onClick={() => handleExportRekordbox(libraryTracks)}
                    className="px-3 py-1.5 rounded-xl bg-[#202026] hover:bg-[#282830] text-zinc-300 font-semibold text-xs border border-white/5 transition"
                    title="Export all library to Rekordbox XML"
                  >
                    rekordbox XML
                  </button>

                  <button
                    onClick={handleOpenCleanerModal}
                    className="px-3 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 font-semibold text-xs border border-amber-500/30 transition flex items-center gap-1.5"
                    title="Clean duplicates and inspect audio quality"
                  >
                    <span>🧹 Clean Dupes</span>
                  </button>

                  <button
                    onClick={handleBrowseDir}
                    className="px-2.5 py-1.5 rounded-xl bg-[#202026] hover:bg-[#282830] text-amber-300 hover:text-amber-200 text-xs border border-amber-500/20 hover:border-amber-500/40 transition flex items-center gap-1.5 shadow-sm"
                    title={`โฟลเดอร์เก็บเพลงปัจจุบัน: ${outputDir} (คลิกเพื่อเลือกโฟลเดอร์ในเครื่อง)`}
                  >
                    <span>📁</span>
                    <span className="max-w-[130px] truncate font-medium">{outputDir.split(/[\\/]/).pop() || outputDir}</span>
                    <span className="text-[10px] text-amber-400 opacity-75">✏️</span>
                  </button>

                  <button
                    onClick={handleRescanFolder}
                    className="px-2.5 py-1.5 rounded-xl bg-[#202026] hover:bg-[#282830] text-zinc-400 hover:text-white text-xs border border-white/5 transition"
                    title="Rescan downloads folder for new songs"
                  >
                    🔄 Sync
                  </button>
                </div>
              </div>

              {/* Folder & Mix Explorer Quick-Bar */}
              {uniquePlaylists.length > 0 && (
                <div className="px-6 py-2.5 bg-[#121216] border-b border-white/5 flex items-center justify-between gap-3 select-none flex-wrap">
                  <div className="flex items-center gap-2 overflow-x-auto no-scrollbar flex-1 min-w-0 py-0.5">
                    <button
                      onClick={() => setShowFolderManagerModal(true)}
                      className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-purple-600/30 to-indigo-600/30 hover:from-purple-600/50 hover:to-indigo-600/50 text-purple-200 hover:text-white text-xs font-bold border border-purple-500/40 transition flex items-center gap-1.5 flex-shrink-0 shadow-sm"
                      title="เปิดหน้าต่างค้นหาและจัดการโฟลเดอร์ทั้งหมด"
                    >
                      <span>📂</span>
                      <span>จัดการโฟลเดอร์ ({uniquePlaylists.length}) 🔍</span>
                    </button>

                    <div className="h-4 w-[1px] bg-white/10 flex-shrink-0" />

                    <button
                      onClick={() => setLibFilterPlaylist('ALL')}
                      className={`px-3 py-1 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition flex-shrink-0 ${
                        libFilterPlaylist === 'ALL'
                          ? 'bg-indigo-600 text-white shadow'
                          : 'bg-[#1a1a22] text-zinc-400 hover:text-white hover:bg-[#22222e]'
                      }`}
                    >
                      <span>ทั้งหมด (All)</span>
                      <span className="text-[10px] opacity-75 font-mono">({libraryTracks.length})</span>
                    </button>

                    {/* Quick filter input if user wants to filter right on the bar */}
                    {uniquePlaylists.length > 6 && (
                      <div className="relative flex items-center flex-shrink-0 min-w-[130px] max-w-[170px]">
                        <input
                          type="text"
                          value={quickFolderFilter}
                          onChange={(e) => setQuickFolderFilter(e.target.value)}
                          placeholder="กรองโฟลเดอร์..."
                          className="w-full bg-[#181820] text-white text-[11px] pl-6 pr-6 py-1 rounded-lg border border-white/10 focus:outline-none focus:border-purple-500"
                        />
                        <span className="absolute left-2 text-[10px] text-zinc-500">🔍</span>
                        {quickFolderFilter && (
                          <button onClick={() => setQuickFolderFilter('')} className="absolute right-2 text-zinc-500 hover:text-white text-[10px]">✕</button>
                        )}
                      </div>
                    )}

                    {/* Visible folder pills (filtered if quick filter is active, otherwise top 8 or all) */}
                    {sortedPlaylists
                      .filter((p) => !quickFolderFilter.trim() || p.name.toLowerCase().includes(quickFolderFilter.toLowerCase()))
                      .slice(0, quickFolderFilter ? 20 : 7)
                      .map((p) => {
                        const isSelected = libFilterPlaylist === p.name;
                        return (
                          <button
                            key={p.name}
                            onClick={() => setLibFilterPlaylist(p.name)}
                            className={`px-3 py-1 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition flex-shrink-0 ${
                              isSelected
                                ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md border border-purple-400/40'
                                : 'bg-[#1a1a22] text-zinc-300 hover:text-white hover:bg-[#22222e] border border-white/5'
                            }`}
                          >
                            <span>📁 {p.name}</span>
                            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/30 font-mono font-bold">
                              {p.count}
                            </span>
                          </button>
                        );
                      })}

                    {sortedPlaylists.length > 7 && !quickFolderFilter && (
                      <button
                        onClick={() => setShowFolderManagerModal(true)}
                        className="px-2.5 py-1 rounded-xl bg-[#181820] hover:bg-[#22222e] text-purple-300 text-xs font-medium border border-purple-500/20 transition flex items-center gap-1 flex-shrink-0"
                      >
                        <span>＋ ดูอีก {sortedPlaylists.length - 7} โฟลเดอร์...</span>
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Active Mix Information Banner */}
              {libFilterPlaylist !== 'ALL' && (
                <div className="px-6 py-3 bg-gradient-to-r from-purple-950/40 via-indigo-950/30 to-black/40 border-b border-purple-500/20 flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center text-base text-purple-300">
                      📁
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white flex items-center gap-2">
                        <span>{libFilterPlaylist}</span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300">
                          {filteredLibrary.length} เพลง
                        </span>
                      </h3>
                      <p className="text-[11px] text-zinc-400">
                        โฟลเดอร์เซ็ตเพลงดาวน์โหลด • ความยาวประมาณ {Math.round(filteredLibrary.reduce((acc, t) => acc + (t.duration_ms || 180000), 0) / 60000)} นาที
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleAddMultipleToQueue(filteredLibrary, true)}
                      className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow transition flex items-center gap-1.5 active:scale-95"
                      title="เริ่มเล่นเพลงแรกของโฟลเดอร์นี้ทันที และเพิ่มเพลงที่เหลือทั้งหมดลงคิว"
                    >
                      <span>▶ เล่นทั้งโฟลเดอร์</span>
                    </button>

                    <button
                      onClick={() => handleAddMultipleToQueue(filteredLibrary, false)}
                      className="px-3 py-1.5 rounded-xl bg-purple-600/30 hover:bg-purple-600/50 text-purple-200 hover:text-white border border-purple-500/40 font-bold text-xs shadow transition flex items-center gap-1.5 active:scale-95"
                      title="เพิ่มเพลงทั้งหมดในโฟลเดอร์นี้ลงในคิวเล่นต่อ (Up Next Queue)"
                    >
                      <span>📑 + ลงคิว ({filteredLibrary.length})</span>
                    </button>

                    <button
                      onClick={() => handleOpenTrackFolder({ playlist_name: libFilterPlaylist } as Track)}
                      className="px-3 py-1.5 rounded-xl bg-purple-600/20 hover:bg-purple-600/35 text-purple-200 hover:text-white border border-purple-500/30 font-bold text-xs shadow transition flex items-center gap-1.5"
                      title="เปิดโฟลเดอร์ของ Mix นี้ใน File Explorer"
                    >
                      <span>📂 เปิดโฟลเดอร์</span>
                    </button>

                    <button
                      onClick={() => handleOpenYoutubeExport(filteredLibrary, libFilterPlaylist)}
                      className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow transition flex items-center gap-1.5"
                      title="Export YouTube Timestamps & Tracklist .txt for this mix"
                    >
                      <span>📋 Export Tracklist (.txt / YouTube)</span>
                    </button>

                    <button
                      onClick={() => {
                        setMixtapeTracks(filteredLibrary);
                        setActiveTab('mixtape');
                        showToast(`ส่ง ${filteredLibrary.length} เพลงจาก "${libFilterPlaylist}" เข้าแท็บ Mixtape แล้ว`, 'success');
                      }}
                      className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow transition flex items-center gap-1.5"
                      title="Open this mix in Smart Mixtape Sequencer"
                    >
                      <span>🎛️ เปิดใน Mixtape</span>
                    </button>

                    <button
                      onClick={() => setLibFilterPlaylist('ALL')}
                      className="px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white text-xs transition"
                      title="View all songs in library"
                    >
                      ✕ ดูทั้งหมด
                    </button>
                  </div>
                </div>
              )}

              {/* Table */}
              <div ref={libTableScrollRef} className="flex-1 overflow-y-auto px-6 py-2 pb-32">
                <div className="grid grid-cols-12 gap-4 px-4 py-3 border-b border-white/5 text-[11px] font-bold text-zinc-500 uppercase tracking-wider items-center">
                  <div className="col-span-1 text-center flex items-center justify-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={filteredLibrary.length > 0 && selectedLibIndices.length === filteredLibrary.length}
                      onChange={handleToggleSelectAllLib}
                      className="rounded accent-indigo-500 cursor-pointer w-3.5 h-3.5"
                      title="Select All"
                    />
                    <span className="font-mono font-bold text-indigo-400">#</span>
                  </div>
                  <div className="col-span-4">Track Title</div>
                  <div className="col-span-2">Genre / Playlist</div>
                  <div className="col-span-1 text-center font-mono">Key</div>
                  <div className="col-span-1 text-center font-mono">BPM</div>
                  <div className="col-span-1 text-center">Stars</div>
                  <div className="col-span-2 text-right">Actions</div>
                </div>

                <div className="py-2 space-y-1">
                  {filteredLibrary.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-zinc-500 space-y-3">
                      <span className="text-4xl">🔍</span>
                      <div className="text-center">
                        <p className="font-bold text-zinc-300 text-sm">
                          {libSearch ? `ไม่พบเพลงในเครื่องที่ตรงกับ "${libSearch}"` : 'ยังไม่มีเพลงในคลังเพลง'}
                        </p>
                        <p className="text-xs text-zinc-500 mt-1">
                          {libSearch
                            ? 'ต้องการค้นหาและดาวน์โหลดเพลงนี้จาก Apple Music / Deezer / YouTube หรือไม่?'
                            : 'กด 🔄 Sync ด้านบน หรือดาวน์โหลดเพลงใหม่เข้ามา'}
                        </p>
                      </div>
                      {libSearch && (
                        <button
                          onClick={() => {
                            setSmartSearchInitialQuery(libSearch.trim());
                            setShowSmartSearchModal(true);
                          }}
                          className="px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold text-xs rounded-xl shadow-lg transition flex items-center gap-2 active:scale-95"
                        >
                          <span>🌐</span>
                          <span>ค้นหาและดาวน์โหลดเพลง "{libSearch}" จากออนไลน์</span>
                        </button>
                      )}
                    </div>
                  ) : (
                    filteredLibrary.map((t, idx) => (
                      <div
                        key={t.id ? `lib_${t.id}_${idx}` : `lib_fp_${t.filepath || idx}`}
                        onContextMenu={(e) => handleOpenContextMenu(e, t, 'library', idx, filteredLibrary)}
                        className={`grid grid-cols-12 gap-4 items-center px-4 py-2.5 rounded-2xl hover:bg-white/[0.04] border border-transparent hover:border-white/5 transition ${
                          isSameTrack(activeTrack, t) ? 'bg-indigo-500/10 border-indigo-500/30' : ''
                        }`}
                      >
                        <div className="col-span-1 text-center text-xs font-mono text-zinc-400 font-bold flex items-center justify-center gap-1.5">
                          <input
                            type="checkbox"
                            checked={selectedLibIndices.includes(idx)}
                            onChange={() => handleToggleSelectLibTrack(idx)}
                            className="rounded accent-indigo-500 cursor-pointer w-3.5 h-3.5"
                          />
                          <span className="w-5 text-right font-bold text-zinc-400">#{idx + 1}</span>
                          <button onClick={() => playTrack(t, filteredLibrary, false)} className="text-zinc-400 hover:text-indigo-400 transition p-0.5">
                            {activeTrack && isSameTrack(activeTrack, t) && isPlaying ? '⏸' : '▶'}
                          </button>
                        </div>

                        <div className="col-span-4 flex items-center gap-3.5 min-w-0">
                          <div className="w-10 h-10 rounded-xl bg-[#202026] flex-shrink-0 overflow-hidden shadow border border-white/5">
                            {t.cover_url ? (
                              <img src={t.cover_url} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-xs text-zinc-400">🎵</div>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-white truncate leading-snug">{t.title}</p>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <p className="text-xs text-zinc-400 font-medium truncate max-w-[140px]">{t.artist || 'Unknown Artist'}</p>
                              {getTrackFolderName(t) !== 'Singles' && (
                                <span
                                  onClick={(e) => handleOpenTrackFolder(t, e)}
                                  className="text-[9px] font-medium text-indigo-300 hover:text-white bg-indigo-500/15 hover:bg-indigo-500/35 border border-indigo-500/25 hover:border-indigo-400 px-1.5 py-0.5 rounded-md truncate max-w-[140px] cursor-pointer transition flex items-center gap-1 shadow-sm active:scale-95 group"
                                  title={`คลิกเพื่อเปิดโฟลเดอร์ "${getTrackFolderName(t)}" ในคอมพิวเตอร์ (Open in Explorer)`}
                                >
                                  <span className="group-hover:scale-110 transition-transform">📁</span>
                                  <span className="truncate">{getTrackFolderName(t)}</span>
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="col-span-2 flex flex-col justify-center min-w-0">
                          <span className="inline-flex items-center w-fit px-2 py-0.5 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-[10px] font-bold truncate">
                            {t.genre || 'Electronic / Dance'}
                          </span>
                          <span className="text-[10px] text-zinc-400 font-mono truncate mt-0.5">
                            {t.source || 'Library'}
                          </span>
                        </div>

                        <div className="col-span-1 text-center">
                          <span
                            onClick={() => {
                              setSelectedKeyForWheel(t.camelot || '8A');
                              setShowCamelotModal(true);
                            }}
                            className="text-xs font-mono font-bold px-2 py-0.5 rounded-lg bg-[#202026] text-zinc-200 border border-white/5 cursor-pointer hover:border-indigo-400 transition"
                          >
                              {t.camelot || '--'}
                          </span>
                        </div>

                        <div className="col-span-1 text-center">
                          <span className="text-xs font-mono font-semibold text-zinc-300">{t.bpm ? Math.round(t.bpm) : '—'}</span>
                        </div>

                        <div className="col-span-1 flex justify-center">{renderStars(t.stars || 3)}</div>

                        <div className="col-span-2 flex items-center justify-end gap-2 text-xs">
                          <button onClick={(e) => handleAddTrackToMixtape(t, e)} className="px-2.5 py-1 rounded-xl bg-[#202026] hover:bg-[#282830] text-indigo-400 font-bold border border-white/5 transition" title="Add to Smart Mixtape DJ set">
                            + Mix
                          </button>
                          <button onClick={() => setEditingTrack({ ...t, index: idx, source: 'library' })} className="text-zinc-500 hover:text-white p-1">
                            ✏️
                          </button>
                          <button onClick={(e) => t.filepath && handleDeleteLibraryTrack(t.filepath, e)} className="text-zinc-600 hover:text-rose-400 p-1">
                            🗑️
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

            </div>
          )}

          {/* ================= VIEW 4: SMART MIXTAPE (AI DJ ENGINE) ================= */}
          {activeTab === 'mixtape' && (
            <div className="flex-1 flex flex-col min-h-0 bg-[#141417] rounded-3xl border border-white/5 overflow-hidden shadow-2xl">
              
              {/* Sleek Compact Pro DJ Deck (Ultra-clean & Maximizes Tracklist Space) */}
              <div className="bg-[#141417] border-b border-white/5 flex flex-col shrink-0">
                {/* Row 1: Unified Compact Action Bar */}
                <div className="px-5 py-2.5 flex items-center justify-between gap-3 flex-wrap">
                  {/* Left: Source, Style, Genre, Count */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex items-center gap-1 bg-[#0e0e11] p-0.5 rounded-lg border border-white/5 text-[11px] font-bold">
                      <button
                        onClick={() => {
                          setMixtapeSource('library');
                          handleBuildMixtape({ source: 'library' });
                        }}
                        className={`px-2.5 py-1 rounded-md transition ${
                          mixtapeSource === 'library' ? 'bg-indigo-600 text-white shadow' : 'text-zinc-400 hover:text-white'
                        }`}
                      >
                        📚 Library ({libraryTracks.length})
                      </button>
                      <button
                        onClick={() => {
                          setMixtapeSource('queue');
                          handleBuildMixtape({ source: 'queue' });
                        }}
                        className={`px-2.5 py-1 rounded-md transition ${
                          mixtapeSource === 'queue' ? 'bg-indigo-600 text-white shadow' : 'text-zinc-400 hover:text-white'
                        }`}
                      >
                        📥 Queue ({tracks.length})
                      </button>
                    </div>

                    {/* Style Select */}
                    <select
                      value={mixtapeMode}
                      onChange={(e) => {
                        const newMode = e.target.value as any;
                        setMixtapeMode(newMode);
                        handleBuildMixtape({ mode: newMode });
                      }}
                      className="bg-[#0e0e11] text-white text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-white/10 focus:outline-none cursor-pointer"
                      title="Mixing Style"
                    >
                      <option value="peak_climb">🚀 Peak-Time (1★➔5★)</option>
                      <option value="harmonic_flow">🎡 Harmonic Flow</option>
                      <option value="bpm_ramp">📈 BPM Ramp</option>
                      <option value="sunset_lounge">🌅 Sunset Lounge</option>
                    </select>

                    {/* Genre Select */}
                    <select
                      value={mixtapeGenre}
                      onChange={(e) => {
                        const newGenre = e.target.value;
                        setMixtapeGenre(newGenre);
                        handleBuildMixtape({ genre: newGenre });
                      }}
                      className="bg-[#0e0e11] text-white text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-white/10 focus:outline-none max-w-[160px] cursor-pointer"
                      title="Filter Genre"
                    >
                      <option value="ALL">All Genres (ทุกแนว)</option>
                      <option value="Thai All">🇹🇭 เพลงไทยทั้งหมด (Thai All)</option>
                      <option value="Thai Hip-Hop">🇹🇭 ไทยฮิปฮอป / แร็ป (Thai Hip-Hop)</option>
                      <option value="Thai Pop">🇹🇭 ไทยป๊อป / อินดี้ (Thai Pop & Indie)</option>
                      <option value="Thai Rock">🇹🇭 ไทยร็อค / ผับ (Thai Rock & Pub)</option>
                      <option value="Dance">🎧 Dance / Electronic / Club</option>
                      <option value="Hip-Hop">🎤 Global Hip-Hop / Rap</option>
                      <option value="Pop">✨ Pop / Dance-Pop</option>
                      <option value="Rock">🎸 Rock / Alternative</option>
                      <option value="Latin">🌴 Latin / Reggaeton</option>
                      <option value="Trap">⚡ Trap / Bass</option>
                      <option value="R&B">🎷 R&B / Soul</option>
                      <option value="K-Pop">🌸 K-Pop</option>
                      <option value="Drum & Bass">🥁 Drum & Bass</option>
                    </select>

                    {/* BPM Filter */}
                    <select
                      value={mixtapeBpmRange}
                      onChange={(e) => {
                        const newBpm = e.target.value;
                        setMixtapeBpmRange(newBpm);
                        handleBuildMixtape({ bpm: newBpm });
                      }}
                      className="bg-[#0e0e11] text-white text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-white/10 focus:outline-none cursor-pointer"
                      title="BPM Filter"
                    >
                      <option value="ALL">All BPM</option>
                      <option value="70-95">70 - 95 BPM</option>
                      <option value="95-115">95 - 115 BPM</option>
                      <option value="115-128">115 - 128 BPM</option>
                      <option value="128-138">128 - 138 BPM</option>
                      <option value="140-175">140 - 175 BPM</option>
                    </select>

                    {/* Track Count Select */}
                    <select
                      value={mixtapeCount}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        setMixtapeCount(val);
                        handleBuildMixtape({ count: val });
                      }}
                      className="bg-[#0e0e11] text-indigo-400 font-bold text-xs px-2.5 py-1.5 rounded-lg border border-white/10 focus:outline-none cursor-pointer"
                      title="Number of Tracks"
                    >
                      <option value={10}>10 Tracks</option>
                      <option value={15}>15 Tracks</option>
                      <option value={20}>20 Tracks</option>
                      <option value={30}>30 Tracks</option>
                      <option value={0}>All Tracks</option>
                    </select>
                  </div>

                  {/* Right Action Buttons */}
                  <div className="flex items-center gap-1.5">
                    <button
                      disabled={isBuildingMixtape}
                      onClick={() => handleBuildMixtape()}
                      className="px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 active:scale-95 text-white font-bold text-xs shadow transition flex items-center gap-1.5"
                      title="Generate AI Mixtape"
                    >
                      {isBuildingMixtape ? <span className="animate-spin text-xs">↻</span> : <span>⚡</span>}
                      <span>Generate</span>
                    </button>

                    <button
                      disabled={isBuildingMixtape}
                      onClick={() => handleBuildMixtape()}
                      className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 active:scale-95 text-black font-bold text-xs shadow transition flex items-center gap-1"
                      title="Reshuffle Random Set"
                    >
                      <span>🎲 Random</span>
                    </button>

                    {mixtapeTracks.length > 0 && (
                      <>
                        <button
                          onClick={() => handleAddAllMixtapeToQueue(true)}
                          className="px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow transition flex items-center gap-1.5 active:scale-95"
                          title="เริ่มเล่นเพลงแรกของ Mixtape Set ทันทีและเพิ่มเพลงที่เหลือลงคิว"
                        >
                          <span>▶ เล่นทั้ง Mixtape</span>
                        </button>

                        <button
                          onClick={() => handleAddAllMixtapeToQueue(false)}
                          className="px-3 py-1.5 rounded-lg bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300 hover:text-white font-bold text-xs border border-indigo-500/40 transition flex items-center gap-1.5 active:scale-95 shadow"
                          title="เพิ่มเพลงทั้งหมดใน Smart Mixtape Set นี้ลงในคิวเล่นต่อ (Up Next Queue)"
                        >
                          <span>📑</span>
                          <span>+ ลงคิวทั้ง Set ({mixtapeTracks.length})</span>
                        </button>

                        <button
                          onClick={handleToggleContinuousMix}
                          className={`px-3 py-1.5 rounded-lg font-bold text-xs shadow transition flex items-center gap-1 ${
                            isAuditioningMix ? 'bg-gradient-to-r from-rose-500 to-pink-600 text-white animate-pulse' : 'bg-[#202026] hover:bg-[#282830] text-cyan-400 border border-white/10'
                          }`}
                          title="Audition live outro-to-intro crossfades"
                        >
                          <span>{isAuditioningMix ? '⏸ Pause Mix' : '▶ Play Mix'}</span>
                        </button>

                        <button
                          onClick={() => handleOpenYoutubeExport(mixtapeTracks, mixtapeTitle.trim() || 'Smart_Mixtape_DJ_Set')}
                          className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 active:scale-95 text-white font-bold text-xs shadow transition flex items-center gap-1"
                          title="Export tracklist with YouTube timestamps / chapters"
                        >
                          <span>📋 YouTube TXT</span>
                        </button>

                        <button
                          disabled={isExportingPackage}
                          onClick={() => setShowExportSetModal(true)}
                          className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 active:scale-95 text-white font-bold text-xs shadow transition flex items-center gap-1 disabled:opacity-40"
                          title="Export Rekordbox, Serato, Traktor, VDJ Package"
                        >
                          {isExportingPackage ? <span className="animate-spin text-xs">↻</span> : <span>🎛️</span>}
                          <span>Export Set</span>
                        </button>

                        <button
                          onClick={handleClearMixtape}
                          className="px-2.5 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 font-bold text-xs border border-rose-500/20 transition active:scale-95"
                          title="Clear Set"
                        >
                          ✕
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Row 2: Slim Summary Bar (Only 26px high) */}
                {mixtapeTracks.length > 1 && (() => {
                  let totalScore = 0;
                  let totalDur = 0;
                  let totalBpm = 0;
                  let bpmCount = 0;
                  let warmupCount = 0;
                  let buildCount = 0;
                  let peakCount = 0;

                  for (let i = 0; i < mixtapeTracks.length; i++) {
                    const t = mixtapeTracks[i];
                    totalDur += (t.duration_ms || 180000) / 1000;
                    if (t.bpm) {
                      totalBpm += Number(t.bpm);
                      bpmCount++;
                    }
                    const stars = Number(t.stars || 3);
                    if (stars <= 2) warmupCount++;
                    else if (stars === 3) buildCount++;
                    else peakCount++;

                    if (i > 0) {
                      totalScore += getHarmonicTransition(mixtapeTracks[i - 1], t).score;
                    }
                  }

                  const avgScore = Math.round(totalScore / (mixtapeTracks.length - 1));
                  const avgBpm = bpmCount > 0 ? Math.round(totalBpm / bpmCount) : 124;
                  const durMin = Math.floor(totalDur / 60);

                  return (
                    <div className="px-5 py-1.5 bg-[#0e0e11] border-t border-white/5 flex items-center justify-between text-[11px] font-semibold text-zinc-400">
                      <div className="flex items-center gap-3">
                        <span className="text-emerald-400 font-bold flex items-center gap-1">
                          🎧 Mix Score: {avgScore}% ({avgScore >= 95 ? 'Grade A+' : 'Grade A'})
                        </span>
                        <span>•</span>
                        <span>⏱️ {durMin} mins ({mixtapeTracks.length} tracks)</span>
                        <span>•</span>
                        <span>⚡ Avg {avgBpm} BPM</span>
                      </div>

                      <div className="flex items-center gap-2 font-bold text-[10px]">
                        <span className="text-sky-400">🌅 Warm-Up ({warmupCount})</span>
                        <span className="text-amber-400">⚡ Build-Up ({buildCount})</span>
                        <span className="text-rose-400">🔥 Peak Drops ({peakCount})</span>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Table */}
              <div className="flex-1 overflow-y-auto px-6 py-2 pb-32">
                <div className="grid grid-cols-12 gap-4 px-4 py-3 border-b border-white/5 text-[11px] font-bold text-zinc-500 uppercase tracking-wider items-center">
                  <div className="col-span-1 text-center font-mono font-bold text-indigo-400">#</div>
                  <div className="col-span-4">Track Title</div>
                  <div className="col-span-2">Genre / Style</div>
                  <div className="col-span-1 text-center font-mono">Key</div>
                  <div className="col-span-1 text-center font-mono">BPM</div>
                  <div className="col-span-1 text-center">Energy</div>
                  <div className="col-span-2 text-right">Order & Actions</div>
                </div>

                <div className="py-2 space-y-2">
                  {mixtapeTracks.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-28 text-zinc-600">
                      <span className="text-4xl mb-3">🎧</span>
                      <p className="font-bold text-zinc-400 text-sm">No DJ Mixtape generated yet</p>
                      <p className="text-xs text-zinc-600 mt-1">Select Library ({libraryTracks.length}) above and click ⚡ Generate or 🎲 Random to auto-sequence your DJ set</p>
                      <button
                        onClick={handleBuildMixtape}
                        className="mt-4 px-5 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold text-xs shadow-lg transition"
                      >
                        ⚡ Generate Smart DJ Set
                      </button>
                    </div>
                  ) : (
                    <AnimatePresence>
                      {mixtapeTracks.map((t, idx) => {
                        const transition = idx > 0 ? getHarmonicTransition(mixtapeTracks[idx - 1], t) : null;

                        return (
                          <React.Fragment key={t.id || t.filepath || idx}>
                            {/* Harmonic Transition Connection Line between tracks */}
                            {transition && (
                              <div className="flex items-center gap-2.5 px-6 py-1 my-0.5">
                                <div className="h-4 w-0.5 bg-indigo-500/40 ml-3 rounded-full"></div>
                                <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-md border ${transition.color}`}>
                                  {transition.label}
                                </span>
                              </div>
                            )}

                            <motion.div
                              layout
                              initial={{ opacity: 0, y: 5 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0 }}
                              onContextMenu={(e) => handleOpenContextMenu(e, t, 'mixtape', idx, mixtapeTracks)}
                              className={`grid grid-cols-12 gap-4 items-center px-4 py-2.5 rounded-2xl hover:bg-white/[0.04] border border-transparent hover:border-white/5 transition ${
                                isSameTrack(activeTrack, t) ? 'bg-indigo-500/10 border-indigo-500/30 shadow' : ''
                              }`}
                            >
                              <div className="col-span-1 text-center text-xs font-mono text-zinc-400 font-bold flex items-center justify-center gap-2">
                                <span className="w-5 text-right font-bold text-indigo-400">#{idx + 1}</span>
                                <button onClick={() => playTrack(t, mixtapeTracks, false)} className="text-zinc-400 hover:text-indigo-400 transition p-0.5">
                                  {activeTrack && isSameTrack(activeTrack, t) && isPlaying ? '⏸' : '▶'}
                                </button>
                              </div>

                              <div className="col-span-4 flex items-center gap-3.5 min-w-0">
                                <div className="w-10 h-10 rounded-xl bg-[#202026] flex-shrink-0 overflow-hidden shadow border border-white/5">
                                  {t.cover_url ? (
                                    <img src={t.cover_url} alt="" className="w-full h-full object-cover" />
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center text-xs text-zinc-400">🎵</div>
                                  )}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-semibold text-white truncate leading-snug">{t.title}</p>
                                  <p className="text-xs text-zinc-400 font-medium truncate mt-0.5">{t.artist || 'Unknown Artist'}</p>
                                </div>
                              </div>

                              <div className="col-span-2 flex flex-col justify-center min-w-0">
                                <span className="inline-flex items-center w-fit px-2 py-0.5 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-[10px] font-bold truncate">
                                  {t.genre || 'Electronic / Dance'}
                                </span>
                                <span className="text-[11px] text-zinc-400 font-medium truncate mt-0.5">{t.artist || 'Unknown Artist'}</span>
                              </div>

                              <div className="col-span-1 text-center">
                                <span
                                  onClick={() => {
                                    setSelectedKeyForWheel(t.camelot || '8A');
                                    setShowCamelotModal(true);
                                  }}
                                  className="text-xs font-mono font-bold px-2 py-0.5 rounded-lg bg-[#202026] text-zinc-200 border border-white/5 cursor-pointer hover:border-indigo-400 transition"
                                >
                                  {t.camelot || '--'}
                                </span>
                              </div>

                              <div className="col-span-1 text-center">
                                <span className="text-xs font-mono font-semibold text-zinc-300">{t.bpm ? Math.round(t.bpm) : '—'}</span>
                              </div>

                              <div className="col-span-1 flex justify-center">{renderStars(t.stars || 3)}</div>

                              <div className="col-span-2 flex items-center justify-end gap-1.5 text-xs">
                                <button
                                  onClick={() => handleAddToQueue(t)}
                                  className="px-2 py-1 rounded-lg bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-300 font-bold text-[10px] border border-indigo-500/20 transition flex items-center gap-0.5 shadow active:scale-95"
                                  title="Add this track to Up Next Queue"
                                >
                                  ＋ Queue
                                </button>
                                <button
                                  disabled={idx === 0}
                                  onClick={() => handleMoveMixtapeTrack(idx, 'up')}
                                  className="p-1.5 rounded-lg bg-[#202026] hover:bg-[#282830] text-zinc-400 hover:text-white disabled:opacity-30 transition"
                                  title="Move Up"
                                >
                                  ▲
                                </button>
                                <button
                                  disabled={idx === mixtapeTracks.length - 1}
                                  onClick={() => handleMoveMixtapeTrack(idx, 'down')}
                                  className="p-1.5 rounded-lg bg-[#202026] hover:bg-[#282830] text-zinc-400 hover:text-white disabled:opacity-30 transition"
                                  title="Move Down"
                                >
                                  ▼
                                </button>
                                <button
                                  onClick={() => setEditingTrack({ ...t, index: idx, source: 'mixtape' })}
                                  className="text-zinc-500 hover:text-white p-1"
                                  title="Edit Tags"
                                >
                                  ✏️
                                </button>
                                <button
                                  onClick={() => handleRemoveMixtapeTrack(idx)}
                                  className="text-zinc-600 hover:text-rose-400 p-1"
                                  title="Remove from Set"
                                >
                                  ✕
                                </button>
                              </div>
                            </motion.div>
                          </React.Fragment>
                        );
                      })}
                    </AnimatePresence>
                  )}
                </div>
              </div>

            </div>
          )}

          {/* ================= VIEW 5: AI DJ GIG CRATES & STORAGE ================= */}
          {activeTab === 'crates' && (
            <div className="flex-1 flex flex-col min-h-0 bg-[#141417] rounded-3xl border border-white/5 overflow-hidden shadow-2xl">
              {/* Header Bar */}
              <div className="p-4 border-b border-white/5 bg-[#18181c]/50 flex items-center justify-between gap-4 flex-shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-xl shadow">
                    🤖
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <span>AI DJ Gig Crates & Storage</span>
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-[10px] font-mono border border-emerald-500/20">
                        {gigCrates.reduce((acc, c) => acc + (c.count || 0), 0)} Tracks Classified
                      </span>
                    </h3>
                    <p className="text-[11px] text-zinc-400">
                      Auto-sort library by Event Vibe & Set Time into physical profile storage + 1-click Rekordbox XML
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    disabled={isClassifyingCrates}
                    onClick={handleFetchGigCrates}
                    className="px-3.5 py-1.5 rounded-xl bg-[#202026] hover:bg-[#282830] text-zinc-300 hover:text-white text-xs font-semibold border border-white/5 transition flex items-center gap-1.5"
                  >
                    <span>🔄</span>
                    <span>{isClassifyingCrates ? 'Classifying...' : 'Re-Analyze'}</span>
                  </button>

                  <button
                    disabled={isBuildingStorage}
                    onClick={handleBuildGigStorage}
                    className="px-4 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold shadow-lg transition flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
                  >
                    {isBuildingStorage ? <span className="animate-spin text-xs">↻</span> : <span>⚡</span>}
                    <span>Build DJ Storage Folders</span>
                  </button>

                  <button
                    onClick={handleOpenStorageFolder}
                    className="px-3.5 py-1.5 rounded-xl bg-[#202026] hover:bg-[#282830] text-zinc-300 text-xs font-semibold border border-white/5 transition flex items-center gap-1.5"
                    title="Open Storage Folder in Explorer"
                  >
                    <span>📂 Open Storage</span>
                  </button>
                </div>
              </div>

              {/* Gig Profiles Horizontal Grid */}
              <div className="p-4 border-b border-white/5 bg-[#101013]/60 overflow-x-auto flex-shrink-0">
                <div className="flex items-center gap-3 min-w-max pb-1">
                  <div
                    onClick={() => setSelectedGigCrate('all')}
                    className={`px-4 py-3 rounded-2xl border cursor-pointer transition flex flex-col justify-between w-48 h-24 ${
                      selectedGigCrate === 'all'
                        ? 'bg-emerald-500/15 border-emerald-500/50 shadow-lg text-white'
                        : 'bg-[#18181c] border-white/5 text-zinc-400 hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-white">🌐 All Gig Crates</span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/10 text-emerald-400 font-bold">
                        {libraryTracks.length}
                      </span>
                    </div>
                    <p className="text-[10px] text-zinc-500">Master collection spanning all 7 DJ profiles</p>
                  </div>

                  {gigCrates.map((crate) => {
                    const isSelected = selectedGigCrate === crate.id;
                    return (
                      <div
                        key={crate.id}
                        onClick={() => setSelectedGigCrate(crate.id)}
                        className={`px-4 py-3 rounded-2xl border cursor-pointer transition flex flex-col justify-between w-52 h-24 relative overflow-hidden ${
                          isSelected
                            ? 'bg-emerald-500/15 border-emerald-500/50 shadow-lg text-white'
                            : 'bg-[#18181c] border-white/5 text-zinc-400 hover:border-white/20'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-xs text-white truncate max-w-[130px]">{crate.name}</span>
                          <span
                            className="text-[10px] font-mono px-1.5 py-0.5 rounded font-bold"
                            style={{ backgroundColor: `${crate.color}25`, color: crate.color }}
                          >
                            {crate.count || 0}
                          </span>
                        </div>
                        <p className="text-[10px] text-zinc-400 line-clamp-1">{crate.description}</p>
                        <div className="flex items-center justify-between text-[9px] font-mono text-zinc-500">
                          <span>{crate.bpm_range}</span>
                          <span className="text-zinc-400 font-semibold">{crate.folder}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Table of Tracks in Selected Gig Crate */}
              <div className="flex-1 overflow-y-auto px-6 py-2 pb-32">
                {(() => {
                  const displayTracks =
                    selectedGigCrate === 'all'
                      ? libraryTracks
                      : (gigCrates.find((c) => c.id === selectedGigCrate)?.tracks || []);

                  return (
                    <>
                      <div className="grid grid-cols-12 gap-4 px-4 py-3 border-b border-white/5 text-[11px] font-bold text-zinc-500 uppercase tracking-wider items-center">
                        <div className="col-span-1 text-center font-mono font-bold text-emerald-400">#</div>
                        <div className="col-span-4">Track Title</div>
                        <div className="col-span-2">Genre / Profile</div>
                        <div className="col-span-1 text-center font-mono">Key</div>
                        <div className="col-span-1 text-center font-mono">BPM</div>
                        <div className="col-span-1 text-center">Stars</div>
                        <div className="col-span-2 text-right">Actions</div>
                      </div>

                      <div className="py-2 space-y-1">
                        {displayTracks.length === 0 ? (
                          <div className="flex flex-col items-center justify-center py-28 text-zinc-600">
                            <span className="text-4xl mb-2">📁</span>
                            <p className="font-bold text-zinc-400 text-sm">No tracks in this Gig Crate yet</p>
                            <p className="text-xs text-zinc-600 mt-1">Download more songs or click 🔄 Re-Analyze to classify</p>
                          </div>
                        ) : (
                          displayTracks.map((t: Track, idx: number) => (
                            <div
                              key={t.filepath || idx}
                              onContextMenu={(e) => handleOpenContextMenu(e, t, 'library', idx, displayTracks)}
                              className={`grid grid-cols-12 gap-4 items-center px-4 py-2.5 rounded-2xl hover:bg-white/[0.04] border border-transparent hover:border-white/5 transition ${
                                isSameTrack(activeTrack, t) ? 'bg-emerald-500/10 border-emerald-500/30' : ''
                              }`}
                            >
                              <div className="col-span-1 text-center text-xs font-mono text-zinc-400 font-bold flex items-center justify-center gap-1.5">
                                <span className="w-5 text-right font-bold text-zinc-400">#{idx + 1}</span>
                                <button onClick={() => playTrack(t, displayTracks, false)} className="text-zinc-400 hover:text-emerald-400 transition p-0.5">
                                  {activeTrack && isSameTrack(activeTrack, t) && isPlaying ? '⏸' : '▶'}
                                </button>
                              </div>

                              <div className="col-span-4 flex items-center gap-3.5 min-w-0">
                                <div className="w-10 h-10 rounded-xl bg-[#202026] flex-shrink-0 overflow-hidden shadow border border-white/5">
                                  {t.cover_url ? (
                                    <img src={t.cover_url} alt="" className="w-full h-full object-cover" />
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center text-xs text-zinc-400">🎵</div>
                                  )}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-semibold text-white truncate leading-snug">{t.title}</p>
                                  <p className="text-xs text-zinc-400 font-medium truncate mt-0.5">{t.artist || 'Unknown Artist'}</p>
                                </div>
                              </div>

                              <div className="col-span-2 flex flex-col justify-center min-w-0">
                                <span className="inline-flex items-center w-fit px-2 py-0.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-bold truncate">
                                  {t.genre || 'DJ Track'}
                                </span>
                                <span
                                  onClick={(e) => handleOpenTrackFolder(t, e)}
                                  className="text-[10px] text-zinc-400 hover:text-white font-mono truncate mt-0.5 cursor-pointer transition flex items-center gap-1 hover:underline"
                                  title={`คลิกเพื่อเปิดโฟลเดอร์ "${t.playlist_name || 'Storage'}"`}
                                >
                                  <span>📁</span>
                                  <span>{t.playlist_name || 'Storage'}</span>
                                </span>
                              </div>

                              <div className="col-span-1 text-center">
                                <span
                                  onClick={() => {
                                    setSelectedKeyForWheel(t.camelot || '8A');
                                    setShowCamelotModal(true);
                                  }}
                                  className="text-xs font-mono font-bold px-2 py-0.5 rounded-lg bg-[#202026] text-zinc-200 border border-white/5 cursor-pointer hover:border-emerald-400 transition"
                                >
                                  {t.camelot || '--'}
                                </span>
                              </div>

                              <div className="col-span-1 text-center">
                                <span className="text-xs font-mono font-semibold text-zinc-300">{t.bpm ? Math.round(t.bpm) : '—'}</span>
                              </div>

                              <div className="col-span-1 flex justify-center">{renderStars(t.stars || 3)}</div>

                              <div className="col-span-2 flex items-center justify-end gap-2 text-xs">
                                <button
                                  onClick={() => handleAddTrackToMixtape(t, {} as any)}
                                  className="px-2.5 py-1 rounded-lg bg-[#202026] hover:bg-[#282830] text-emerald-300 hover:text-white font-medium border border-white/5 transition"
                                  title="Add to Mixtape"
                                >
                                  ＋ Mixtape
                                </button>
                                <button
                                  onClick={() => setEditingTrack({ ...t, index: idx, source: 'library' })}
                                  className="text-zinc-500 hover:text-white p-1"
                                  title="Edit Tags"
                                >
                                  ✏️
                                </button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
          )}

          {/* ================= VIEW 6: AI MASHUP MATCHER ================= */}
          {activeTab === 'mashups' && (
            <div className="flex-1 flex flex-col min-h-0 bg-[#141417] rounded-3xl border border-white/5 overflow-hidden shadow-2xl">
              {/* Header Bar */}
              <div className="p-4 border-b border-white/5 bg-[#18181c]/50 flex items-center justify-between gap-4 flex-shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-xl shadow">
                    🔥
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <span>AI DJ Mashup Matcher & Synergy Engine</span>
                      <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 text-[10px] font-mono border border-amber-500/20">
                        {mashupPairs.length} Mashup Combos Found
                      </span>
                    </h3>
                    <p className="text-[11px] text-zinc-400">
                      Discovers 100% harmonic compatible pairs, layers vocal hooks on heavy drops, and calculates tempo sync
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    disabled={isFindingMashups}
                    onClick={handleFetchMashups}
                    className="px-4 py-1.5 rounded-xl bg-gradient-to-r from-amber-600 to-rose-600 hover:from-amber-500 hover:to-rose-500 text-white text-xs font-bold shadow-lg transition flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
                  >
                    {isFindingMashups ? <span className="animate-spin text-xs">↻</span> : <span>🔄</span>}
                    <span>Scan Mashup Pairs</span>
                  </button>
                </div>
              </div>

              {/* Mashup Cards Grid */}
              <div className="flex-1 overflow-y-auto px-6 py-4 pb-32 space-y-3">
                {mashupPairs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-28 text-zinc-600">
                    <span className="text-4xl mb-2">🔥</span>
                    <p className="font-bold text-zinc-400 text-sm">No Mashup Pairs analyzed yet</p>
                    <p className="text-xs text-zinc-600 mt-1">Click Scan Mashup Pairs above to analyze harmonic synergy across your library</p>
                    <button
                      onClick={handleFetchMashups}
                      className="mt-4 px-5 py-2 rounded-xl bg-gradient-to-r from-amber-600 to-rose-600 text-white font-bold text-xs shadow-lg"
                    >
                      🔥 Discover Mashup Combos
                    </button>
                  </div>
                ) : (
                  mashupPairs.map((m, idx) => (
                    <div
                      key={idx}
                      className="p-4 rounded-3xl bg-[#16161a] border border-white/5 hover:border-amber-500/30 transition shadow-lg space-y-3"
                    >
                      {/* Top Bar: Synergy & Harmonic Rule */}
                      <div className="flex items-center justify-between border-b border-white/5 pb-2.5">
                        <div className="flex items-center gap-2">
                          <span className="px-2.5 py-0.5 rounded-full bg-gradient-to-r from-amber-500/20 to-rose-500/20 text-amber-300 border border-amber-500/30 text-xs font-extrabold font-mono shadow">
                            ⚡ {m.score}% SYNERGY
                          </span>
                          <span className="text-xs font-semibold text-zinc-300">
                            {m.harmonic_type}
                          </span>
                        </div>
                        <span className="text-[11px] font-mono text-zinc-400">
                          🎯 Target: {m.target_bpm} BPM • Key {m.target_key}
                        </span>
                      </div>

                      {/* Middle: 2-Track Mashup Dual Display */}
                      <div className="grid grid-cols-1 md:grid-cols-11 gap-3 items-center">
                        {/* Track 1: Vocal Hook */}
                        <div className="md:col-span-5 p-3 rounded-2xl bg-[#101013] border border-white/5 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <div className="w-11 h-11 rounded-xl bg-[#202026] flex-shrink-0 overflow-hidden shadow border border-white/5 relative">
                              {m.vocal_track.cover_url ? (
                                <img src={m.vocal_track.cover_url} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-xs">🎤</div>
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <span className="text-[10px] font-bold uppercase text-amber-400 font-mono tracking-wider">
                                🎤 Vocal Layer
                              </span>
                              <p className="text-xs font-bold text-white truncate leading-tight mt-0.5">{m.vocal_track.title}</p>
                              <p className="text-[11px] text-zinc-400 truncate mt-0.5">{m.vocal_track.artist || 'Artist'}</p>
                            </div>
                          </div>

                          <div className="flex flex-col items-end gap-1 flex-shrink-0">
                            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20">
                              {m.vocal_track.camelot || '8A'} • {Math.round(m.vocal_track.bpm || 124)} BPM
                            </span>
                            <button
                              onClick={() => playTrack(m.vocal_track)}
                              className="text-xs px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 text-zinc-300 transition"
                            >
                              ▶️ Audition
                            </button>
                          </div>
                        </div>

                        {/* Middle Fusion Icon */}
                        <div className="md:col-span-1 flex flex-col items-center justify-center text-zinc-500">
                          <span className="text-lg">✖</span>
                        </div>

                        {/* Track 2: Beat / Drop */}
                        <div className="md:col-span-5 p-3 rounded-2xl bg-[#101013] border border-white/5 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <div className="w-11 h-11 rounded-xl bg-[#202026] flex-shrink-0 overflow-hidden shadow border border-white/5 relative">
                              {m.beat_track.cover_url ? (
                                <img src={m.beat_track.cover_url} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-xs">🥁</div>
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <span className="text-[10px] font-bold uppercase text-emerald-400 font-mono tracking-wider">
                                🥁 Beat & Drop Bed
                              </span>
                              <p className="text-xs font-bold text-white truncate leading-tight mt-0.5">{m.beat_track.title}</p>
                              <p className="text-[11px] text-zinc-400 truncate mt-0.5">{m.beat_track.artist || 'Artist'}</p>
                            </div>
                          </div>

                          <div className="flex flex-col items-end gap-1 flex-shrink-0">
                            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                              {m.beat_track.camelot || '8A'} • {Math.round(m.beat_track.bpm || 124)} BPM
                            </span>
                            <button
                              onClick={() => playTrack(m.beat_track)}
                              className="text-xs px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 text-zinc-300 transition"
                            >
                              ▶️ Audition
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Recipe & Action */}
                      <div className="flex items-center justify-between pt-1 text-xs">
                        <p className="text-zinc-400 text-[11px] flex items-center gap-1.5 italic">
                          <span>💡 Recipe:</span>
                          <span className="text-zinc-200 not-italic">{m.recipe}</span>
                        </p>
                        <button
                          onClick={() => {
                            setMixtapeTracks([m.vocal_track, m.beat_track]);
                            setActiveTab('mixtape');
                            showToast(`Loaded "${m.vocal_track.title}" + "${m.beat_track.title}" into Mixtape!`, 'success');
                          }}
                          className="px-3 py-1 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold text-xs shadow transition flex items-center gap-1.5"
                        >
                          <span>🎧 Send to Mixtape</span>
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

        </div>

      </div>

      {/* Audio Preview Dock: Authentic Beatport Pro Player */}
      <footer
        onContextMenu={(e) => handleOpenContextMenu(e, activeTrack, 'player')}
        className="fixed bottom-0 left-0 right-0 h-16 bg-[#0a0a0c]/98 backdrop-blur-2xl border-t border-white/10 px-5 flex items-center justify-between text-white z-50 shadow-2xl"
      >
        {/* 1. Left: Cover Art + Title / Artist / Label (Clickable to expand) */}
        <div
          onClick={() => setShowExpandedPlayer(true)}
          className="flex items-center gap-3 w-[260px] min-w-[210px] flex-shrink-0 cursor-pointer group hover:opacity-95 transition"
          title="Click to open Fullscreen Apple Music / Spotify DJ Player"
        >
          <div className="w-11 h-11 rounded-md bg-[#16161a] overflow-hidden flex-shrink-0 shadow border border-white/10 relative">
            {activeTrack?.cover_url ? (
              <img src={activeTrack.cover_url} alt="" className="w-full h-full object-cover group-hover:scale-105 transition duration-300" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-xs">🎵</div>
            )}
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
              <span className="text-[10px] font-bold text-white">⛶ EXPAND</span>
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-white truncate leading-tight group-hover:text-emerald-400 transition">{activeTrack?.title || 'No track playing'}</p>
            <p className="text-[11px] text-zinc-400 truncate mt-0.5 leading-tight">{activeTrack?.artist || 'Select a track to start'}</p>
            <p className="text-[10px] text-zinc-500 truncate mt-0.5 leading-tight flex items-center gap-1.5">
              <span>{activeTrack?.label || activeTrack?.album || activeTrack?.genre || 'Beatport DJ'}</span>
              {isAutoDjEnabled && <span className="text-[9px] font-bold text-emerald-400 font-mono">● AUTO-DJ ON</span>}
            </p>
          </div>
        </div>

        {/* 2. Metadata: Time / BPM / Key */}
        <div className="flex flex-col justify-center text-right font-mono pr-4 pl-1 flex-shrink-0 select-none">
          <div className="text-xs font-bold">
            <span className="text-white">{formatTime(currentTime)}</span>
            <span className="text-zinc-500 font-normal"> / {formatTime(duration)}</span>
          </div>
          <div className="text-[10px] text-zinc-400 font-medium leading-tight mt-0.5">
            {activeTrack?.bpm ? `${Math.round(activeTrack.bpm)} bpm` : '128 bpm'}
          </div>
          <div className="text-[10px] text-zinc-400 font-medium leading-tight">
            {activeTrack?.key_name || activeTrack?.camelot || '8A'}
          </div>
        </div>

        {/* 3. Center: Beatport Symmetrical Waveform */}
        <div className="flex-1 min-w-[200px] px-2 flex items-center">
          <BeatportWaveform
            currentTime={currentTime}
            duration={duration}
            onSeek={handleSeek}
            track={activeTrack}
          />
        </div>

        {/* 4. Right Controls: DJ Auto-Mix, Queue, Shuffle, Prev, Play, Next, Repeat, Volume */}
        <div className="flex items-center gap-2.5 pl-3 flex-shrink-0">
          {/* Auto-DJ Toggle */}
          <button
            onClick={() => {
              const next = !isAutoDjEnabled;
              setIsAutoDjEnabled(next);
              showToast(next ? '🤖 Auto-DJ Mix Mode Enabled (Harmonic Continuous)' : 'Auto-DJ Disabled', 'info');
            }}
            className={`px-2.5 py-1 rounded-xl text-[11px] font-bold border transition flex items-center gap-1 ${
              isAutoDjEnabled
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-[0_0_12px_#10b98140]'
                : 'bg-[#18181c] text-zinc-500 border-white/5 hover:text-zinc-300'
            }`}
            title="Auto-DJ Mode: Automatically mixes harmonic songs continuously"
          >
            <span>🤖</span>
            <span>AUTO DJ</span>
          </button>

          {/* Shuffle Toggle */}
          <button
            onClick={() => {
              setIsShuffle(!isShuffle);
              showToast(!isShuffle ? 'Shuffle On' : 'Shuffle Off', 'info');
            }}
            className={`p-1.5 rounded-lg text-xs transition ${
              isShuffle ? 'text-emerald-400 bg-emerald-500/15 font-bold' : 'text-zinc-500 hover:text-white'
            }`}
            title={isShuffle ? 'Shuffle On' : 'Shuffle Off'}
          >
            🔀
          </button>

          {/* Previous Track */}
          <button
            onClick={handlePlayPrev}
            className="text-zinc-400 hover:text-white text-xs p-1.5 rounded-lg hover:bg-white/5 transition"
            title="Previous Track"
          >
            ⏮
          </button>

          {/* Big Circular Play/Pause Button */}
          <button
            onClick={togglePlay}
            className="w-10 h-10 rounded-full bg-gradient-to-tr from-zinc-800 to-zinc-700 hover:from-emerald-600 hover:to-teal-600 active:scale-95 text-white font-bold text-sm flex items-center justify-center shadow-lg border border-white/10 transition"
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? '⏸' : '▶'}
          </button>

          {/* Next Track */}
          <button
            onClick={handlePlayNext}
            className="text-zinc-400 hover:text-white text-xs p-1.5 rounded-lg hover:bg-white/5 transition"
            title="Next Track / Mix Next"
          >
            ⏭
          </button>

          {/* Repeat Toggle */}
          <button
            onClick={() => {
              const next = repeatMode === 'off' ? 'all' : repeatMode === 'all' ? 'one' : 'off';
              setRepeatMode(next);
              showToast(`Repeat: ${next.toUpperCase()}`, 'info');
            }}
            className={`p-1.5 rounded-lg text-xs transition relative ${
              repeatMode !== 'off' ? 'text-sky-400 bg-sky-500/15 font-bold' : 'text-zinc-500 hover:text-white'
            }`}
            title={`Repeat: ${repeatMode}`}
          >
            🔁{repeatMode === 'one' && <span className="text-[8px] font-mono font-bold absolute top-0.5 right-0.5 bg-sky-400 text-black rounded-full px-0.5">1</span>}
          </button>

          {/* Volume Slider & Controls */}
          <div
            className="flex items-center gap-1.5 px-2 py-1 bg-white/5 rounded-xl border border-white/5"
            onWheel={(e) => {
              e.preventDefault();
              changeVolumeStep(e.deltaY < 0 ? 0.05 : -0.05);
            }}
          >
            <button
              onClick={toggleMute}
              className="text-xs text-zinc-400 hover:text-white transition p-0.5"
              title={isMuted || volume === 0 ? 'Unmute (M)' : 'Mute (M)'}
            >
              {isMuted || volume === 0 ? '🔇' : volume < 0.35 ? '🔈' : volume < 0.7 ? '🔉' : '🔊'}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={isMuted ? 0 : volume}
              onChange={handleVolume}
              className="w-16 h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-emerald-400"
              title={`Volume: ${Math.round((isMuted ? 0 : volume) * 100)}% (Scroll to adjust, M to mute)`}
            />
            <span className="text-[10px] font-mono font-semibold text-emerald-400 w-7 text-right">
              {isMuted || volume === 0 ? '0%' : `${Math.round(volume * 100)}%`}
            </span>
          </div>

          {/* Up Next Queue Button with Badge */}
          <button
            onClick={() => setShowQueueDrawer(true)}
            className="relative px-2.5 py-1 rounded-xl bg-[#1e1e24] hover:bg-[#282830] text-zinc-300 font-semibold text-xs border border-white/5 transition flex items-center gap-1.5"
            title="Open Up Next Queue & Recommendations"
          >
            <span>📑 Queue</span>
            {playQueue.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-indigo-500 text-white font-mono text-[9px] font-bold shadow">
                {playQueue.length}
              </span>
            )}
          </button>

          {/* Fullscreen Expand Player */}
          <button
            onClick={() => setShowExpandedPlayer(true)}
            className="p-1.5 text-zinc-400 hover:text-white hover:bg-white/5 rounded-lg text-xs transition"
            title="Expand Fullscreen Apple Music / Spotify Player"
          >
            ⛶
          </button>
        </div>
      </footer>

      {/* Toast Notification */}
      <AnimatePresence>
        {notification && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className="fixed top-5 right-8 z-50 px-4 py-2.5 rounded-2xl bg-[#1b1b20] border border-white/10 text-xs font-semibold text-white shadow-2xl flex items-center gap-2.5"
          >
            <span className="w-2 h-2 rounded-full bg-indigo-500 shadow-[0_0_8px_#6366f1]"></span>
            <span>{notification.msg}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Camelot Wheel Modal */}
      {showCamelotModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <div className="bg-[#16161a] border border-white/10 rounded-3xl max-w-2xl w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <div>
                <h2 className="text-base font-bold text-white">Camelot Wheel Harmonic Visualizer</h2>
                <p className="text-xs text-zinc-400">Selected Key: <span className="text-indigo-400 font-bold">{selectedKeyForWheel}</span></p>
              </div>
              <button onClick={() => setShowCamelotModal(false)} className="text-zinc-500 hover:text-white">✕</button>
            </div>

            <div className="grid grid-cols-4 gap-2.5 max-h-96 overflow-y-auto p-1">
              {CAMELOT_WHEEL.map((cw) => {
                const isSelected = selectedKeyForWheel === cw.key;
                return (
                  <div
                    key={cw.key}
                    onClick={() => setSelectedKeyForWheel(cw.key)}
                    style={{ borderColor: isSelected ? '#818cf8' : 'rgba(255,255,255,0.06)' }}
                    className={`p-3 rounded-2xl border flex flex-col items-center justify-center cursor-pointer transition ${
                      isSelected ? 'bg-indigo-500/20 scale-105' : 'bg-[#101013] hover:bg-white/5'
                    }`}
                  >
                    <span className="text-sm font-bold font-mono" style={{ color: cw.color }}>{cw.key}</span>
                    <span className="text-[11px] text-zinc-400">{cw.musical}</span>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end pt-2 border-t border-white/5">
              <button onClick={() => setShowCamelotModal(false)} className="px-5 py-2 bg-white text-black font-bold rounded-xl text-xs">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quick Tag Editor Modal */}
      {editingTrack && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <form onSubmit={saveEditedTags} className="bg-[#16161a] border border-white/10 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <h2 className="text-sm font-bold text-white">Edit Track Tags & Rekordbox Rating</h2>
              <button type="button" onClick={() => setEditingTrack(null)} className="text-zinc-500 hover:text-white">✕</button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-zinc-400 block mb-1">Title</label>
                <input
                  type="text"
                  value={editingTrack.title || ''}
                  onChange={(e) => setEditingTrack({ ...editingTrack, title: e.target.value })}
                  className="w-full bg-[#101013] text-white px-3 py-2 rounded-xl border border-white/10 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-zinc-400 block mb-1">Artist</label>
                <input
                  type="text"
                  value={editingTrack.artist || ''}
                  onChange={(e) => setEditingTrack({ ...editingTrack, artist: e.target.value })}
                  className="w-full bg-[#101013] text-white px-3 py-2 rounded-xl border border-white/10 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-zinc-400 block mb-1">Camelot Key</label>
                  <input
                    type="text"
                    value={editingTrack.camelot || ''}
                    onChange={(e) => setEditingTrack({ ...editingTrack, camelot: e.target.value })}
                    className="w-full bg-[#101013] text-white px-3 py-2 rounded-xl border border-white/10 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-zinc-400 block mb-1">BPM</label>
                  <input
                    type="number"
                    step="0.1"
                    value={editingTrack.bpm || ''}
                    onChange={(e) => setEditingTrack({ ...editingTrack, bpm: parseFloat(e.target.value) })}
                    className="w-full bg-[#101013] text-white px-3 py-2 rounded-xl border border-white/10 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-zinc-400 block mb-1">rekordbox Star Rating (1 - 5 Stars)</label>
                <div className="p-2.5 bg-[#101013] rounded-xl border border-white/10 flex items-center justify-between">
                  {renderStars(editingTrack.stars || 3, (newStars) => {
                    setEditingTrack({ ...editingTrack, stars: newStars, rating_255: newStars * 51 });
                  })}
                  <span className="text-xs font-bold text-amber-400 font-mono">
                    {editingTrack.stars || 3} / 5 Stars
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-white/5">
              <button
                type="button"
                onClick={() => setEditingTrack(null)}
                className="px-4 py-2 bg-[#202026] hover:bg-[#282830] text-white rounded-xl text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold shadow"
              >
                Save Changes
              </button>
            </div>
          </form>
        </div>
      )}


      {/* Custom Tracklist Text Parser Modal */}
      {showTracklistModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <div className="bg-[#16161a] border border-white/10 rounded-3xl max-w-xl w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <div>
                <h2 className="text-base font-bold text-white">Paste DJ Set Tracklist / Timestamps</h2>
                <p className="text-xs text-zinc-400">Paste any timestamps, setlist lines, or song names to parse automatically</p>
              </div>
              <button onClick={() => setShowTracklistModal(false)} className="text-zinc-500 hover:text-white">✕</button>
            </div>

            <textarea
              rows={8}
              value={rawTracklistText}
              onChange={(e) => setRawTracklistText(e.target.value)}
              placeholder={`Example format:\n00:00 Fisher - Losing It\n03:45 Dom Dolla - Rhyme Dust\n07:20 Chris Lake - In The Yuma\nor plain song names list...`}
              className="w-full bg-[#101013] text-white text-xs font-mono p-3.5 rounded-2xl border border-white/10 focus:border-indigo-500/50 focus:outline-none transition leading-relaxed resize-none"
            />

            <div className="flex items-center justify-between pt-2 border-t border-white/5">
              <span className="text-[11px] text-zinc-500">
                {rawTracklistText.split('\n').filter(l => l.trim()).length} lines detected
              </span>
              <div className="flex items-center gap-2">
                <button
                  disabled={isParsingTracklist}
                  onClick={() => setShowTracklistModal(false)}
                  className="px-4 py-2 bg-[#202026] text-white rounded-xl text-xs font-semibold hover:bg-[#282830] transition disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  disabled={isParsingTracklist}
                  onClick={handleParseCustomTracklist}
                  className="px-5 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold rounded-xl text-xs shadow hover:opacity-90 transition disabled:opacity-50 flex items-center gap-1.5"
                >
                  {isParsingTracklist ? (
                    <>
                      <span className="animate-spin text-xs">↻</span>
                      <span>Matching Tracks...</span>
                    </>
                  ) : (
                    <>
                      <span>⚡</span>
                      <span>Convert to DJ Queue</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Direct USB / DJ Drive Export Modal */}
      {showUsbModal && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-6 animate-fade-in">
          <div className="bg-[#16161a] border border-white/10 rounded-3xl max-w-xl w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <div className="flex items-center gap-2.5">
                <span className="text-2xl">⚡</span>
                <div>
                  <h2 className="text-base font-bold text-white">Direct USB / DJ Drive Export</h2>
                  <p className="text-xs text-zinc-400">Export tracks, subfolders & Rekordbox XML with CDJ Hot Cues</p>
                </div>
              </div>
              <button onClick={() => setShowUsbModal(false)} className="text-zinc-500 hover:text-white text-lg">✕</button>
            </div>

            <div className="space-y-4 text-xs">
              {/* 1. Target Drive & Subfolder */}
              <div>
                <label className="text-zinc-300 font-semibold block mb-1.5 flex items-center justify-between">
                  <span>1. Select Target USB Drive / Destination Folder</span>
                  <span className="text-[10px] text-zinc-500">Auto-detected drives</span>
                </label>

                {availableDrives.length > 0 && (
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    {availableDrives.map((d) => (
                      <button
                        key={d.path}
                        type="button"
                        onClick={() => {
                          const djSub = d.subfolders?.find((s: any) => s.name.toLowerCase() === 'dj music');
                          setSelectedDrivePath(djSub ? djSub.path : d.path);
                        }}
                        className={`p-2.5 rounded-2xl border text-left transition flex items-center gap-2.5 ${
                          selectedDrivePath.startsWith(d.path)
                            ? 'bg-emerald-500/20 border-emerald-500/50 text-white font-bold'
                            : 'bg-[#101013] border-white/5 text-zinc-300 hover:border-white/20'
                        }`}
                      >
                        <span className="text-xl">💾</span>
                        <div className="min-w-0 flex-1">
                          <p className="font-bold truncate">{d.label}</p>
                          <p className="text-[10px] text-zinc-500 font-mono">{d.path}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {/* Subfolder Quick Chips for active drive */}
                {availableDrives.find(d => selectedDrivePath.startsWith(d.path))?.subfolders?.length > 0 && (
                  <div className="mb-2">
                    <span className="text-[10px] text-zinc-500 block mb-1">Quick Select Subfolder on Drive:</span>
                    <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto">
                      {(() => {
                        const curDrive = availableDrives.find(d => selectedDrivePath.startsWith(d.path));
                        if (!curDrive) return null;
                        return (
                          <button
                            key="root"
                            type="button"
                            onClick={() => setSelectedDrivePath(curDrive.path)}
                            className={`px-2 py-1 rounded-lg text-[10px] font-mono border transition ${
                              selectedDrivePath === curDrive.path
                                ? 'bg-emerald-500/30 text-emerald-300 border-emerald-500/60 font-bold'
                                : 'bg-[#18181e] text-zinc-400 border-white/5 hover:text-white'
                            }`}
                          >
                            📁 Root ({curDrive.letter}:\)
                          </button>
                        );
                      })()}
                      {availableDrives
                        .find(d => selectedDrivePath.startsWith(d.path))
                        ?.subfolders?.map((sub: any) => (
                          <button
                            key={sub.path}
                            type="button"
                            onClick={() => setSelectedDrivePath(sub.path)}
                            className={`px-2 py-1 rounded-lg text-[10px] font-mono border transition ${
                              selectedDrivePath === sub.path
                                ? 'bg-emerald-500/30 text-emerald-300 border-emerald-500/60 font-bold'
                                : 'bg-[#18181e] text-zinc-400 border-white/5 hover:text-white'
                            }`}
                          >
                            📁 {sub.name}
                          </button>
                        ))}
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={selectedDrivePath}
                    onChange={(e) => setSelectedDrivePath(e.target.value)}
                    placeholder="F:\DJ Music or custom folder path..."
                    className="flex-1 bg-[#101013] text-white px-3.5 py-2 rounded-xl border border-white/10 focus:border-emerald-500 focus:outline-none font-mono text-xs"
                  />
                  <button
                    type="button"
                    onClick={handleBrowseExportFolder}
                    className="px-3.5 py-2 bg-[#22222a] hover:bg-[#2c2c36] text-white rounded-xl text-xs font-semibold border border-white/10 flex items-center gap-1.5 transition flex-shrink-0"
                    title="Browse Directory on Computer"
                  >
                    <span>📂 Browse...</span>
                  </button>
                </div>
              </div>

              {/* 2. What to Export (Source Selection) */}
              <div>
                <label className="text-zinc-300 font-semibold block mb-1.5">2. What to Export (Source Playlist / Crates)</label>
                <div className="grid grid-cols-2 gap-1.5 max-h-32 overflow-y-auto pr-1">
                  <button
                    type="button"
                    onClick={() => setExportSourceMode('all')}
                    className={`px-3 py-2 rounded-xl border text-left text-xs transition flex items-center justify-between ${
                      exportSourceMode === 'all'
                        ? 'bg-emerald-500/20 border-emerald-500/50 text-white font-bold'
                        : 'bg-[#101013] border-white/5 text-zinc-400 hover:text-white'
                    }`}
                  >
                    <span>📁 All Library Playlists</span>
                    <span className="text-[10px] font-mono opacity-60">({libraryTracks.length})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setExportSourceMode('crates')}
                    className={`px-3 py-2 rounded-xl border text-left text-xs transition flex items-center justify-between ${
                      exportSourceMode === 'crates'
                        ? 'bg-purple-500/20 border-purple-500/50 text-white font-bold'
                        : 'bg-[#101013] border-white/5 text-zinc-400 hover:text-white'
                    }`}
                  >
                    <span>🎛️ 10 Pro DJ Gig Crates</span>
                    <span className="text-[10px] font-mono opacity-60">(10 Crates)</span>
                  </button>

                  {uniquePlaylistsWithCounts.map(p => (
                    <button
                      key={p.name}
                      type="button"
                      onClick={() => setExportSourceMode(p.name)}
                      className={`px-3 py-2 rounded-xl border text-left text-xs transition flex items-center justify-between ${
                        exportSourceMode === p.name
                          ? 'bg-sky-500/20 border-sky-500/50 text-white font-bold'
                          : 'bg-[#101013] border-white/5 text-zinc-400 hover:text-white'
                      }`}
                    >
                      <span className="truncate pr-1">📁 {p.name}</span>
                      <span className="text-[10px] font-mono opacity-60 flex-shrink-0">({p.count})</span>
                    </button>
                  ))}

                  {selectedLibIndices.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setExportSourceMode('selected')}
                      className={`px-3 py-2 rounded-xl border text-left text-xs transition flex items-center justify-between ${
                        exportSourceMode === 'selected'
                          ? 'bg-amber-500/20 border-amber-500/50 text-white font-bold'
                          : 'bg-[#101013] border-white/5 text-zinc-400 hover:text-white'
                      }`}
                    >
                      <span>⭐ Checked Selection</span>
                      <span className="text-[10px] font-mono opacity-60">({selectedLibIndices.length})</span>
                    </button>
                  )}
                </div>
              </div>

              {/* 3. Organization Structure */}
              <div>
                <label className="text-zinc-300 font-semibold block mb-1.5">3. Export Folder Structure</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setExportStructureMode('by_playlist')}
                    className={`p-2 rounded-xl border text-center text-xs transition ${
                      exportStructureMode === 'by_playlist'
                        ? 'bg-emerald-500/20 border-emerald-500/50 text-white font-bold'
                        : 'bg-[#101013] border-white/5 text-zinc-400 hover:text-white'
                    }`}
                  >
                    <p className="font-bold">📁 Subfolders</p>
                    <p className="text-[9px] text-zinc-500">By Playlist Name</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setExportStructureMode('by_gig_crates')}
                    className={`p-2 rounded-xl border text-center text-xs transition ${
                      exportStructureMode === 'by_gig_crates'
                        ? 'bg-purple-500/20 border-purple-500/50 text-white font-bold'
                        : 'bg-[#101013] border-white/5 text-zinc-400 hover:text-white'
                    }`}
                  >
                    <p className="font-bold">🎛️ 10 Pro Crates</p>
                    <p className="text-[9px] text-zinc-500">Mood / Set-Time</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setExportStructureMode('direct')}
                    className={`p-2 rounded-xl border text-center text-xs transition ${
                      exportStructureMode === 'direct'
                        ? 'bg-sky-500/20 border-sky-500/50 text-white font-bold'
                        : 'bg-[#101013] border-white/5 text-zinc-400 hover:text-white'
                    }`}
                  >
                    <p className="font-bold">📄 Direct Files</p>
                    <p className="text-[9px] text-zinc-500">Direct in Folder</p>
                  </button>
                </div>
              </div>

              {/* Status info */}
              <div className="p-2.5 bg-[#101013] rounded-2xl border border-white/5 space-y-1 text-zinc-400 text-[11px]">
                <div className="flex items-center gap-2 text-emerald-400 font-semibold">
                  <span>✓ Pioneer Rekordbox XML with CDJ Hot Cues & My Tags</span>
                </div>
                <div className="flex items-center gap-2 text-emerald-400 font-semibold">
                  <span>✓ Multi-format M3U8 Playlist ready for CDJ / Rekordbox Mac / Engine DJ</span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-white/5">
              <span className="text-xs text-zinc-400 font-mono">
                Target: {exportSourceMode === 'all'
                  ? `${libraryTracks.length} Tracks`
                  : exportSourceMode === 'crates'
                  ? `${libraryTracks.length} Tracks (10 Crates)`
                  : exportSourceMode === 'selected'
                  ? `${selectedLibIndices.length} Tracks`
                  : `${uniquePlaylistsWithCounts.find(p => p.name === exportSourceMode)?.count || 0} Tracks (${exportSourceMode})`}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowUsbModal(false)}
                  className="px-4 py-2 bg-[#202026] hover:bg-[#282830] text-white rounded-xl text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  disabled={isExportingUsb}
                  onClick={handleConfirmUsbExport}
                  className="px-5 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-bold shadow flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isExportingUsb && <span className="animate-spin text-xs">↻</span>}
                  <span>{isExportingUsb ? 'Exporting to USB...' : '⚡ Export to USB'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Mixtape Set Export Modal */}
      {showExportSetModal && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-6 animate-fade-in">
          <div className="bg-[#16161a] border border-white/10 rounded-3xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <div className="flex items-center gap-2.5">
                <span className="text-2xl">🎛️</span>
                <div>
                  <h2 className="text-base font-bold text-white">Export Smart Mixtape DJ Set</h2>
                  <p className="text-xs text-zinc-400">Rekordbox XML (8 Hot Cues), M3U8, Traktor NML & VDJ</p>
                </div>
              </div>
              <button onClick={() => setShowExportSetModal(false)} className="text-zinc-500 hover:text-white text-lg">✕</button>
            </div>

            <div className="space-y-4 text-xs">
              {/* Set Title */}
              <div>
                <label className="text-zinc-300 font-semibold block mb-1">Set / Playlist Name</label>
                <input
                  type="text"
                  value={mixtapeTitle}
                  onChange={(e) => setMixtapeTitle(e.target.value)}
                  placeholder="e.g. Saturday_Night_PeakTime_Set"
                  className="w-full bg-[#1c1c22] border border-white/10 rounded-xl px-3 py-2 text-white font-medium text-xs focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* Storage & Export Mode Selector */}
              <div>
                <label className="text-zinc-300 font-semibold block mb-2">Storage & Export Mode</label>
                <div className="space-y-2">
                  {/* Mode 1: Smart Playlist (0 MB) */}
                  <label
                    onClick={() => setExportSetCopyAudio(false)}
                    className={`p-3 rounded-2xl border flex items-start gap-3 cursor-pointer transition ${
                      !exportSetCopyAudio
                        ? 'bg-emerald-500/10 border-emerald-500/40 shadow-[0_0_15px_rgba(16,185,129,0.15)]'
                        : 'bg-[#1a1a20] border-white/5 hover:border-white/10'
                    }`}
                  >
                    <input
                      type="radio"
                      name="exportSetMode"
                      checked={!exportSetCopyAudio}
                      onChange={() => setExportSetCopyAudio(false)}
                      className="mt-0.5 accent-emerald-500"
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white text-xs">⚡ Smart DJ Playlist & XML</span>
                        <span className="bg-emerald-500/20 text-emerald-300 text-[10px] font-bold px-1.5 py-0.2 rounded">0 MB Storage (แนะนำ)</span>
                      </div>
                      <p className="text-[11px] text-zinc-400 mt-1 leading-relaxed">
                        สร้างไฟล์เพลย์ลิสต์ <span className="text-white font-mono">.m3u8</span> และ <span className="text-white font-mono">rekordbox.xml</span> (มี 8 Hot Cues A-H + Energy Rating) ชี้ไปยังเพลงเดิม <strong>ไม่ก๊อปปี้ไฟล์เพลงซ้ำ ไม่เปลืองพื้นที่ฮาร์ดดิสก์แม้แต่นิดเดียว!</strong>
                      </p>
                    </div>
                  </label>

                  {/* Mode 2: Standalone Folder Copy */}
                  <label
                    onClick={() => setExportSetCopyAudio(true)}
                    className={`p-3 rounded-2xl border flex items-start gap-3 cursor-pointer transition ${
                      exportSetCopyAudio
                        ? 'bg-indigo-500/10 border-indigo-500/40 shadow-[0_0_15px_rgba(99,102,241,0.15)]'
                        : 'bg-[#1a1a20] border-white/5 hover:border-white/10'
                    }`}
                  >
                    <input
                      type="radio"
                      name="exportSetMode"
                      checked={exportSetCopyAudio}
                      onChange={() => setExportSetCopyAudio(true)}
                      className="mt-0.5 accent-indigo-500"
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white text-xs">📁 Standalone Numbered Audio Folder</span>
                        <span className="bg-indigo-500/20 text-indigo-300 text-[10px] font-bold px-1.5 py-0.2 rounded">Copy Files</span>
                      </div>
                      <p className="text-[11px] text-zinc-400 mt-1 leading-relaxed">
                        คัดลอกไฟล์ MP3 เรียงเบอร์ <span className="text-white font-mono">01 - ...</span>, <span className="text-white font-mono">02 - ...</span> ลงโฟลเดอร์ใหม่ เหมาะสำหรับก๊อปปี้ไปใส่ Flash Drive แผ่นอื่นหรือแจกเพื่อน
                      </p>
                    </div>
                  </label>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between border-t border-white/5 pt-3">
              <span className="text-xs text-zinc-400 font-mono">
                {mixtapeTracks.length} Tracks in Set
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowExportSetModal(false)}
                  className="px-4 py-2 bg-[#202026] hover:bg-[#282830] text-white rounded-xl text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  disabled={isExportingPackage}
                  onClick={handleExportMixtapeFolderPackage}
                  className="px-5 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-bold shadow flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isExportingPackage && <span className="animate-spin text-xs">↻</span>}
                  <span>{isExportingPackage ? 'Exporting Set...' : 'Export DJ Set'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Duplicate Cleaner & Quality Upgrader Modal */}
      {showCleanerModal && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <div className="bg-[#16161a] border border-white/10 rounded-3xl max-w-4xl w-full p-6 space-y-4 shadow-2xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-white/5 pb-3 flex-shrink-0">
              <div className="flex items-center gap-2.5">
                <span className="text-2xl">🧹</span>
                <div>
                  <h2 className="text-base font-bold text-white">Duplicate Cleaner & Quality Upgrader</h2>
                  <p className="text-xs text-zinc-400">Safely eliminate duplicate files and inspect audio bitrates</p>
                </div>
              </div>
              <button onClick={() => setShowCleanerModal(false)} className="text-zinc-500 hover:text-white">✕</button>
            </div>

            {isScanningDuplicates ? (
              <div className="flex flex-col items-center justify-center py-20 text-zinc-400 space-y-3 flex-1">
                <span className="animate-spin text-3xl">↻</span>
                <p className="text-xs font-semibold">Scanning library files for duplicates and inspecting bitrates...</p>
              </div>
            ) : duplicateData ? (
              <div className="flex-1 overflow-y-auto space-y-4 pr-1">
                {/* Summary Banner */}
                <div className="grid grid-cols-3 gap-3 text-xs">
                  <div className="p-3 bg-[#101013] rounded-2xl border border-white/5 text-center">
                    <p className="text-[10px] text-zinc-500 uppercase font-bold">Duplicate Clusters</p>
                    <p className="text-lg font-black text-amber-400 mt-0.5">{duplicateData.clusters_count}</p>
                  </div>
                  <div className="p-3 bg-[#101013] rounded-2xl border border-white/5 text-center">
                    <p className="text-[10px] text-zinc-500 uppercase font-bold">Files to Remove</p>
                    <p className="text-lg font-black text-rose-400 mt-0.5">{duplicateData.total_duplicates_found}</p>
                  </div>
                  <div className="p-3 bg-[#101013] rounded-2xl border border-white/5 text-center">
                    <p className="text-[10px] text-zinc-500 uppercase font-bold">Low Bitrate Tracks</p>
                    <p className="text-lg font-black text-sky-400 mt-0.5">{duplicateData.low_quality_count}</p>
                  </div>
                </div>

            {/* Clusters List */}
                <div className="space-y-3">
                  {duplicateData.clusters.length === 0 ? (
                    <div className="p-10 text-center text-zinc-500 text-xs">
                      ✨ Great news! No duplicate files found in your library.
                    </div>
                  ) : (
                    duplicateData.clusters.map((c: any, cIdx: number) => (
                      <div key={cIdx} className="p-3.5 bg-[#101013] rounded-2xl border border-white/5 space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-bold text-white truncate">{c.title} • <span className="text-zinc-400 font-normal">{c.artist}</span></p>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 font-bold">
                            {c.count} copies
                          </span>
                        </div>

                        <div className="space-y-1.5 text-xs">
                          {c.tracks.map((t: any, tIdx: number) => {
                            const filename = t.filepath ? t.filepath.split(/[/\\]/).pop() : (t.title || 'Track');
                            const folderName = t.filepath ? t.filepath.split(/[/\\]/).slice(-2, -1)[0] : (t.playlist_name || '');

                            return (
                              <div
                                key={tIdx}
                                className={`p-2.5 rounded-xl border flex items-center justify-between gap-3 ${
                                  t.is_recommended_keep
                                    ? 'bg-emerald-500/10 border-emerald-500/30 text-white'
                                    : 'bg-[#18181c] border-white/5 text-zinc-400'
                                }`}
                              >
                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                  <span
                                    className="text-[10px] font-bold px-2 py-0.5 rounded font-mono flex-shrink-0"
                                    style={{
                                      backgroundColor: t.is_recommended_keep ? '#10b98125' : '#f43f5e20',
                                      color: t.is_recommended_keep ? '#10b981' : '#f43f5e'
                                    }}
                                  >
                                    {t.is_recommended_keep ? '✓ KEEP' : '✕ DUPE'}
                                  </span>

                                  {folderName && (
                                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-white/5 text-zinc-400 border border-white/5 flex-shrink-0 flex items-center gap-1">
                                      📁 {folderName}
                                    </span>
                                  )}

                                  <span
                                    className="text-xs font-semibold truncate text-zinc-200"
                                    title={t.filepath}
                                  >
                                    {filename}
                                  </span>
                                </div>

                                <div className="flex items-center gap-2 font-mono text-[10px] flex-shrink-0">
                                  <span className="px-1.5 py-0.5 rounded bg-white/10 text-zinc-200 font-bold">
                                    {t.bitrate_kbps} kbps
                                  </span>
                                  <span className="text-zinc-400">{t.size_mb} MB</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ) : null}

            <div className="flex items-center justify-between pt-3 border-t border-white/5 flex-shrink-0">
              <button
                type="button"
                onClick={() => setShowCleanerModal(false)}
                className="px-4 py-2 bg-[#202026] hover:bg-[#282830] text-white rounded-xl text-xs font-semibold"
              >
                Close
              </button>

              {duplicateData && duplicateData.total_duplicates_found > 0 && (
                <button
                  disabled={isCleaningDuplicates}
                  onClick={() => setShowCleanConfirmModal(true)}
                  className="px-5 py-2 bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white font-bold rounded-xl text-xs shadow flex items-center gap-1.5 disabled:opacity-50 active:scale-95 transition cursor-pointer"
                >
                  {isCleaningDuplicates && <span className="animate-spin text-xs">↻</span>}
                  <span>🧹 Clean {duplicateData.total_duplicates_found} Duplicates (Free Disk Space)</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Beautiful Custom Clean Duplicates Confirmation Modal */}
      {showCleanConfirmModal && duplicateData && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-[60] flex items-center justify-center p-6 animate-fade-in">
          <div className="bg-[#18181c] border border-amber-500/30 rounded-3xl max-w-md w-full p-6 space-y-5 shadow-[0_0_50px_rgba(245,158,11,0.2)] flex flex-col relative overflow-hidden">
            {/* Top Glow Accent */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-500 via-rose-500 to-amber-500"></div>

            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-2xl flex-shrink-0 shadow-lg">
                🧹
              </div>
              <div className="flex-1">
                <h3 className="text-base font-bold text-white leading-tight">
                  ยืนยันการล้างไฟล์เพลงซ้ำ
                </h3>
                <p className="text-xs text-zinc-400 mt-1">
                  Clean Duplicate Tracks & Free Disk Space
                </p>
              </div>
            </div>

            {/* Information Card */}
            <div className="bg-[#121215] border border-white/5 rounded-2xl p-4 space-y-2.5 text-xs">
              <div className="flex items-center justify-between text-zinc-300">
                <span>จำนวนไฟล์ที่จะถูกลบ:</span>
                <span className="font-bold text-rose-400 font-mono text-sm">
                  {duplicateData.total_duplicates_found} ไฟล์
                </span>
              </div>
              <div className="flex items-center justify-between text-zinc-300">
                <span>กลุ่มเพลงที่ซ้ำกัน:</span>
                <span className="font-bold text-amber-400 font-mono">
                  {duplicateData.clusters_count} กลุ่ม
                </span>
              </div>
              <div className="pt-2 border-t border-white/5 flex items-start gap-2 text-[11px] text-emerald-400 leading-relaxed">
                <span>🛡️</span>
                <span>
                  <strong>ปลอดภัย 100%:</strong> ระบบจะเก็บไฟล์เพลงคุณภาพสูงสุด <strong>(320kbps / Best Quality)</strong> ไว้ในเครื่องเสมอ และลบเฉพาะไฟล์สำเนาที่ซ้ำซ้อน
                </span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowCleanConfirmModal(false)}
                className="px-4 py-2 rounded-xl bg-[#202026] hover:bg-[#282830] text-zinc-300 hover:text-white text-xs font-semibold border border-white/5 transition"
              >
                ✕ ยกเลิก (Cancel)
              </button>

              <button
                type="button"
                onClick={handleConfirmCleanDuplicates}
                className="px-5 py-2 rounded-xl bg-gradient-to-r from-rose-600 via-amber-600 to-rose-600 hover:opacity-95 text-white text-xs font-bold shadow-lg shadow-rose-900/30 transition flex items-center gap-1.5 active:scale-95"
              >
                <span>🧹 ยืนยันลบ {duplicateData.total_duplicates_found} ไฟล์</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= APPLE MUSIC & SPOTIFY IMMERSIVE FULLSCREEN PLAYER ================= */}
      {showExpandedPlayer && activeTrack && (
        <div
          onContextMenu={(e) => handleOpenContextMenu(e, activeTrack, 'player')}
          className="fixed inset-0 bg-[#0a0a0e]/95 backdrop-blur-3xl z-50 flex flex-col justify-between p-8 text-white animate-fade-in select-none"
        >
          {/* Top Bar: Close / Collapse / Status */}
          <div className="flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowExpandedPlayer(false)}
                className="w-10 h-10 rounded-2xl bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white flex items-center justify-center text-lg transition border border-white/5"
                title="Minimize Player (Esc)"
              >
                ⌄
              </button>
              <div>
                <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-widest font-mono">
                  NOW PLAYING • {isAutoDjEnabled ? '🤖 AUTO-DJ MIXING' : 'MANUAL QUEUE'}
                </span>
                <p className="text-xs font-semibold text-zinc-300">
                  {activeTrack.playlist_name ? `From "${activeTrack.playlist_name}"` : 'From Master DJ Library'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  const next = !isAutoDjEnabled;
                  setIsAutoDjEnabled(next);
                  showToast(next ? '🤖 Auto-DJ Mix Mode Enabled' : 'Auto-DJ Disabled', 'info');
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition flex items-center gap-1.5 ${
                  isAutoDjEnabled
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-[0_0_15px_#10b98140]'
                    : 'bg-white/5 text-zinc-400 border-white/5 hover:text-white'
                }`}
              >
                <span>🤖</span>
                <span>Auto-DJ Mix: {isAutoDjEnabled ? 'ON' : 'OFF'}</span>
              </button>

              <button
                onClick={() => setShowExpandedPlayer(false)}
                className="w-10 h-10 rounded-2xl bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white flex items-center justify-center text-base transition border border-white/5"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Main Body: 2 Columns (Left: Giant Vinyl & Controls, Right: Queue & Recommendations) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center flex-1 my-6 overflow-hidden max-w-7xl mx-auto w-full">
            {/* Left Column: Huge Cover Art & DJ Stats */}
            <div className="lg:col-span-6 flex flex-col items-center justify-center text-center space-y-6">
              {/* Giant Glowing Artwork */}
              <div className="relative group">
                {/* Dynamic Ambient Key Glow */}
                <div
                  className="absolute -inset-4 rounded-3xl opacity-40 blur-3xl transition duration-700"
                  style={{ backgroundColor: activeTrack.color || '#6366f1' }}
                ></div>

                <div className="w-72 h-72 md:w-80 md:h-80 rounded-3xl overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.8)] border border-white/10 relative bg-[#18181c]">
                  {activeTrack.cover_url ? (
                    <img src={activeTrack.cover_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-5xl">🎵</div>
                  )}

                  {/* Play Overlay */}
                  <div
                    onClick={togglePlay}
                    className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition cursor-pointer"
                  >
                    <span className="text-4xl text-white drop-shadow-lg">{isPlaying ? '⏸' : '▶'}</span>
                  </div>
                </div>
              </div>

              {/* Title & Artist & Badges */}
              <div className="space-y-2 max-w-md w-full px-4">
                <h1 className="text-2xl md:text-3xl font-black text-white truncate tracking-tight">
                  {activeTrack.title}
                </h1>
                <p className="text-sm md:text-base font-semibold text-zinc-400 truncate">
                  {activeTrack.artist || 'Unknown Artist'}
                </p>

                {/* Key / BPM / Quality DJ Badges */}
                <div className="flex items-center justify-center gap-2 pt-2 flex-wrap">
                  <span
                    className="px-2.5 py-1 rounded-xl text-xs font-mono font-bold text-white border shadow"
                    style={{ backgroundColor: `${activeTrack.color || '#6366f1'}30`, borderColor: activeTrack.color || '#6366f1' }}
                  >
                    Key {activeTrack.camelot || '8A'} ({activeTrack.key_name || 'Db major'})
                  </span>
                  <span className="px-2.5 py-1 rounded-xl bg-white/10 text-zinc-200 text-xs font-mono font-bold border border-white/5">
                    {Math.round(activeTrack.bpm || 128)} BPM
                  </span>
                  <span className="px-2.5 py-1 rounded-xl bg-emerald-500/15 text-emerald-300 text-xs font-bold border border-emerald-500/30">
                    320k Lossless
                  </span>
                </div>
              </div>
            </div>

            {/* Right Column: Up Next Queue & AI DJ Recommendations */}
            <div className="lg:col-span-6 bg-[#121216]/80 border border-white/5 rounded-3xl p-6 h-[460px] flex flex-col justify-between shadow-2xl backdrop-blur-md">
              {/* Tab Header */}
              <div className="flex items-center justify-between border-b border-white/5 pb-3 flex-shrink-0">
                <div className="flex items-center gap-2">
                  <span className="text-lg">✨</span>
                  <h3 className="text-sm font-bold text-white">Recommended Harmonic Transitions</h3>
                </div>
                <span className="text-[10px] font-mono text-zinc-400 bg-white/5 px-2 py-0.5 rounded-full">
                  {smartRecommendations.length} AI Matches
                </span>
              </div>

              {/* Recommendation List */}
              <div className="flex-1 overflow-y-auto space-y-2.5 my-3 pr-1">
                {smartRecommendations.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-zinc-500 text-xs">
                    <span>🎵</span>
                    <p className="mt-1">Add more tracks to library for AI recommendations</p>
                  </div>
                ) : (
                  smartRecommendations.map(({ track: rec, totalScore, matchLabel, bpmDiff }, idx) => (
                    <div
                      key={idx}
                      onContextMenu={(e) => handleOpenContextMenu(e, rec, 'recommendation', idx)}
                      className="p-3 bg-[#18181c]/70 hover:bg-[#202026] border border-white/5 rounded-2xl flex items-center justify-between gap-3 transition group"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="w-10 h-10 rounded-xl bg-[#202026] overflow-hidden flex-shrink-0 relative">
                          {rec.cover_url ? (
                            <img src={rec.cover_url} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-xs">🎵</div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-white truncate leading-tight group-hover:text-emerald-400 transition">{rec.title}</p>
                          <p className="text-[11px] text-zinc-400 truncate mt-0.5">{rec.artist || 'Artist'}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-300 border border-amber-500/20">
                              {totalScore}% SYNERGY
                            </span>
                            <span className="text-[9px] text-zinc-400">
                              {matchLabel} ({rec.camelot} • {Math.round(rec.bpm || 128)} BPM)
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button
                          onClick={() => handleAddToQueue(rec, true)}
                          className="px-2.5 py-1 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-200 text-xs font-semibold border border-white/5 transition"
                          title="Play Next Immediately"
                        >
                          ＋ Next
                        </button>
                        <button
                          onClick={() => playTrack(rec)}
                          className="px-3 py-1 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold shadow transition"
                        >
                          ▶ Play
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Bottom Queue Status */}
              <div className="border-t border-white/5 pt-3 flex items-center justify-between text-xs text-zinc-400 flex-shrink-0">
                <span>Up Next Queue: <strong>{playQueue.length} tracks</strong></span>
                {playQueue.length > 0 && (
                  <button onClick={handleClearQueue} className="text-rose-400 hover:underline text-[11px]">
                    Clear Queue
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Bottom Controls Bar: Waveform & Mega DJ Controls */}
          <div className="space-y-4 max-w-5xl mx-auto w-full flex-shrink-0">
            {/* Beatport Waveform Player */}
            <div className="bg-[#121216]/60 border border-white/5 rounded-2xl p-3 backdrop-blur-md">
              <BeatportWaveform
                currentTime={currentTime}
                duration={duration}
                onSeek={handleSeek}
                track={activeTrack}
              />
              <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400 pt-1">
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>

            {/* Controls Row */}
            <div className="flex items-center justify-between px-6">
              {/* Left Group: Shuffle, Repeat, Auto-DJ */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setIsShuffle(!isShuffle);
                    showToast(!isShuffle ? 'Shuffle On' : 'Shuffle Off', 'info');
                  }}
                  className={`p-2 rounded-xl text-sm transition ${
                    isShuffle ? 'text-emerald-400 bg-emerald-500/15 font-bold' : 'text-zinc-500 hover:text-white'
                  }`}
                  title={isShuffle ? 'Shuffle On' : 'Shuffle Off'}
                >
                  🔀
                </button>

                <button
                  onClick={() => {
                    const next = repeatMode === 'off' ? 'all' : repeatMode === 'all' ? 'one' : 'off';
                    setRepeatMode(next);
                    showToast(`Repeat: ${next.toUpperCase()}`, 'info');
                  }}
                  className={`p-2 rounded-xl text-sm transition relative ${
                    repeatMode !== 'off' ? 'text-sky-400 bg-sky-500/15 font-bold' : 'text-zinc-500 hover:text-white'
                  }`}
                  title={`Repeat: ${repeatMode}`}
                >
                  🔁{repeatMode === 'one' && <span className="text-[9px] font-bold absolute top-1 right-1 bg-sky-400 text-black rounded-full px-0.5">1</span>}
                </button>

                <button
                  onClick={() => {
                    const next = !isAutoDjEnabled;
                    setIsAutoDjEnabled(next);
                    showToast(next ? '🤖 Auto-DJ Mix Mode Enabled' : 'Auto-DJ Disabled', 'info');
                  }}
                  className={`px-3 py-1.5 rounded-xl text-[11px] font-bold border transition flex items-center gap-1.5 ${
                    isAutoDjEnabled
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-[0_0_15px_#10b98140]'
                      : 'bg-white/5 text-zinc-500 border-white/5 hover:text-white'
                  }`}
                  title="Auto-DJ Mode: Continuous harmonic mixing"
                >
                  <span>🤖 Auto-DJ</span>
                </button>
              </div>

              {/* Center Group: Prev, Play/Pause, Next */}
              <div className="flex items-center gap-6">
                <button
                  onClick={handlePlayPrev}
                  className="w-12 h-12 rounded-2xl bg-white/5 hover:bg-white/10 text-white text-base flex items-center justify-center transition active:scale-95 border border-white/5"
                  title="Previous Track"
                >
                  ⏮
                </button>

                <button
                  onClick={togglePlay}
                  className="w-16 h-16 rounded-3xl bg-gradient-to-tr from-emerald-600 via-teal-600 to-emerald-500 hover:scale-105 active:scale-95 text-white font-bold text-2xl flex items-center justify-center shadow-[0_0_30px_#10b98160] transition"
                  title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
                >
                  {isPlaying ? '⏸' : '▶'}
                </button>

                <button
                  onClick={handlePlayNext}
                  className="w-12 h-12 rounded-2xl bg-white/5 hover:bg-white/10 text-white text-base flex items-center justify-center transition active:scale-95 border border-white/5"
                  title="Next Track / Mix Next"
                >
                  ⏭
                </button>
              </div>

              {/* Right Group: Pro Volume Controls & Up Next Queue */}
              <div className="flex items-center gap-3">
                {/* Volume Section */}
                <div
                  className="flex items-center gap-2 bg-[#18181c]/90 border border-white/10 px-3.5 py-2 rounded-2xl backdrop-blur-md shadow-lg"
                  onWheel={(e) => {
                    e.preventDefault();
                    changeVolumeStep(e.deltaY < 0 ? 0.05 : -0.05);
                  }}
                >
                  {/* Volume Down Button */}
                  <button
                    onClick={() => changeVolumeStep(-0.05)}
                    className="text-zinc-400 hover:text-white text-xs w-6 h-6 rounded-lg hover:bg-white/5 flex items-center justify-center transition font-bold"
                    title="ลดเสียง (-5%)"
                  >
                    -
                  </button>

                  {/* Dynamic Speaker / Mute Toggle Button */}
                  <button
                    onClick={toggleMute}
                    className="text-base text-zinc-300 hover:text-white transition p-0.5 hover:scale-110"
                    title={isMuted || volume === 0 ? 'เปิดเสียง (Unmute - M)' : 'ปิดเสียง (Mute - M)'}
                  >
                    {isMuted || volume === 0 ? '🔇' : volume < 0.35 ? '🔈' : volume < 0.7 ? '🔉' : '🔊'}
                  </button>

                  {/* Volume Slider */}
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={isMuted ? 0 : volume}
                    onChange={handleVolume}
                    className="w-24 md:w-32 h-1.5 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-emerald-400"
                    title={`ระดับเสียง: ${Math.round((isMuted ? 0 : volume) * 100)}% (เลื่อนเมาส์หรือกด ↑ / ↓)`}
                  />

                  {/* Volume Up Button */}
                  <button
                    onClick={() => changeVolumeStep(0.05)}
                    className="text-zinc-400 hover:text-white text-xs w-6 h-6 rounded-lg hover:bg-white/5 flex items-center justify-center transition font-bold"
                    title="เร่งเสียง (+5%)"
                  >
                    +
                  </button>

                  {/* Percentage Badge */}
                  <span className="text-xs font-mono font-bold text-emerald-400 w-10 text-right">
                    {isMuted || volume === 0 ? 'MUTE' : `${Math.round(volume * 100)}%`}
                  </span>
                </div>

                {/* Queue Drawer Button */}
                <button
                  onClick={() => setShowQueueDrawer(true)}
                  className="relative px-3.5 py-2 rounded-2xl bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white font-semibold text-xs border border-white/10 transition flex items-center gap-1.5 shadow"
                  title="Open Up Next Queue"
                >
                  <span>📑 Queue</span>
                  {playQueue.length > 0 && (
                    <span className="px-1.5 py-0.2 rounded-full bg-emerald-500 text-black font-mono text-[10px] font-bold shadow">
                      {playQueue.length}
                    </span>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================= UP NEXT QUEUE SLIDE-OVER DRAWER ================= */}
      {showQueueDrawer && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex justify-end animate-fade-in">
          <div className="bg-[#16161a] border-l border-white/10 w-full max-w-md h-full p-6 flex flex-col justify-between shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/5 pb-4 flex-shrink-0">
              <div className="flex items-center gap-2.5">
                <span className="text-xl">📑</span>
                <div>
                  <h2 className="text-base font-bold text-white">Up Next Queue</h2>
                  <p className="text-xs text-zinc-400">{playQueue.length} tracks waiting in queue</p>
                </div>
              </div>
              <button onClick={() => setShowQueueDrawer(false)} className="text-zinc-400 hover:text-white text-lg">✕</button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto space-y-5 my-4 pr-1">
              {/* Currently Playing Track */}
              {activeTrack && (
                <div>
                  <span className="text-[10px] uppercase font-bold text-emerald-400 font-mono tracking-wider">
                    ● NOW PLAYING
                  </span>
                  <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl flex items-center gap-3 mt-1.5">
                    <div className="w-10 h-10 rounded-xl bg-[#202026] overflow-hidden flex-shrink-0">
                      {activeTrack.cover_url ? (
                        <img src={activeTrack.cover_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-xs">🎵</div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-white truncate">{activeTrack.title}</p>
                      <p className="text-[11px] text-zinc-400 truncate">{activeTrack.artist}</p>
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold">
                      {activeTrack.camelot || '8A'}
                    </span>
                  </div>
                </div>
              )}

              {/* Up Next List */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] uppercase font-bold text-zinc-400 font-mono tracking-wider">
                    NEXT IN QUEUE
                  </span>
                  {playQueue.length > 0 && (
                    <button onClick={handleClearQueue} className="text-rose-400 hover:underline text-[10px]">
                      Clear All
                    </button>
                  )}
                </div>

                {playQueue.length === 0 ? (
                  <div className="p-6 bg-[#101013] rounded-2xl border border-white/5 text-center text-zinc-500 text-xs">
                    No custom tracks queued. Auto-DJ will automatically transition into compatible harmonic tracks.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {playQueue.map((t, idx) => (
                      <div
                        key={idx}
                        onContextMenu={(e) => handleOpenContextMenu(e, t, 'drawer', idx, playQueue)}
                        className="p-2.5 bg-[#101013] hover:bg-[#18181c] border border-white/5 rounded-xl flex items-center justify-between gap-3 text-xs"
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <span className="font-mono text-zinc-500 text-[10px] w-4">{idx + 1}</span>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold text-white truncate">{t.title}</p>
                            <p className="text-[10px] text-zinc-400 truncate">{t.artist}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/10 text-zinc-300">
                            {t.camelot || '8A'}
                          </span>
                          <button
                            onClick={() => handleRemoveFromQueue(idx)}
                            className="text-zinc-500 hover:text-rose-400 p-1"
                            title="Remove from queue"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Smart Recommendations Section */}
              <div>
                <span className="text-[10px] uppercase font-bold text-amber-400 font-mono tracking-wider">
                  ✨ SUGGESTED HARMONIC BLENDS
                </span>
                <div className="space-y-2 mt-2">
                  {smartRecommendations.slice(0, 4).map(({ track: rec, totalScore, matchLabel }, rIdx) => (
                    <div
                      key={rIdx}
                      onContextMenu={(e) => handleOpenContextMenu(e, rec, 'recommendation', rIdx)}
                      className="p-2.5 bg-[#101013] hover:bg-[#18181c] border border-white/5 rounded-xl flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-white truncate">{rec.title}</p>
                        <p className="text-[10px] text-zinc-400 truncate">{matchLabel} • {rec.camelot}</p>
                      </div>
                      <button
                        onClick={() => handleAddToQueue(rec)}
                        className="px-2 py-1 bg-white/5 hover:bg-white/10 text-zinc-200 rounded-lg text-[10px] font-semibold flex-shrink-0"
                      >
                        ＋ Queue
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="pt-3 border-t border-white/5 flex items-center justify-between flex-shrink-0">
              <button
                onClick={() => setShowQueueDrawer(false)}
                className="w-full py-2.5 bg-[#202026] hover:bg-[#282830] text-white rounded-xl text-xs font-semibold transition"
              >
                Close Queue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= AI DJ PROMPT ASSISTANT MODAL ================= */}
      {showAiModal && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4 md:p-6 animate-fade-in">
          <div className="bg-[#141418] border border-white/10 rounded-3xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
            
            {/* Modal Header */}
            <div className="p-5 border-b border-white/5 bg-[#18181e] flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-purple-600 to-pink-600 flex items-center justify-center text-lg shadow-lg">
                  🤖
                </div>
                <div>
                  <h2 className="text-base font-bold text-white flex items-center gap-2">
                    <span>AI DJ Vibe Curator & Music Director</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 font-bold border border-purple-500/30">
                      GPT / Gemini Ready
                    </span>
                  </h2>
                  <p className="text-xs text-zinc-400">บอกบรรยากาศร้าน แนวเพลง หรือกลุ่มลูกค้า ให้ AI ช่วยจัดเซ็ตเพลงพร้อมดาวน์โหลด</p>
                </div>
              </div>
              <button
                onClick={() => setShowAiModal(false)}
                className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white flex items-center justify-center text-sm transition"
              >
                ✕
              </button>
            </div>

            {/* Modal Scrollable Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              
              {/* Quick Vibe Presets */}
              <div>
                <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block mb-2">
                  ⚡ ทางลัดบรรยากาศยอดนิยม (Quick Vibe Presets)
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { label: '🍲 ร้านหมาล่า / วัยรุ่น Gen Z', prompt: 'ร้านอาหารสไตล์หมาล่า ชาบู ลูกค้าคนไทย วัยรุ่น นักศึกษา Gen Z เพลงไทยฮิต T-Pop, Thai Indie ป๊อปฟังสบาย ร้องตามได้' },
                    { label: '🍻 ร้านเหล้านั่งชิลล์ / Thai Indie', prompt: 'ร้านเหล้านั่งชิลล์ บาร์วัยรุ่น เพลงไทยอินดี้ฟังสบาย ร้องตามได้ ดนตรีแนว Indy Pop, R&B และ Synth Pop' },
                    { label: '🚗 3ช่า รีมิกซ์ & Thai Party', prompt: 'ปาร์ตี้สนุกสนาน โจ๊ะๆ 3ช่า รีมิกซ์ และฮิปฮอปไทยมันส์ๆ สำหรับเปิดเต้น' },
                    { label: '🌴 Beach Club / Tropical', prompt: 'ร้านอาหารริมหาดและบีชคลับ ลูกค้าวัยรุ่น ดนตรีแนว Tropical House และ Nu-Disco ชิลๆ พระอาทิตย์ตก' },
                    { label: '🍸 Rooftop Cocktail / Deep House', prompt: 'บาร์ Rooftop หรูหรา จิบค็อกเทลชมวิวเมือง ดนตรี Deep House และ Melodic Techno ยามค่ำคืน' },
                    { label: '☕ Cozy Cafe & Lo-Fi', prompt: 'คาเฟ่เปิดช่วงบ่าย บรรยากาศผ่อนคลาย นั่งทำงาน ดนตรีแนว Lo-Fi Beats, Acoustic Pop และ Neo-Soul' },
                    { label: '🔥 Peak Time Club (128 BPM)', prompt: 'ผับสายตื๊ด ช่วง Peak Time เที่ยงคืน ดนตรี Tech House & EDM 128 BPM เบสหนัก ดรอปมันส์ คนเต้นทั้งร้าน' },
                    { label: '🇯🇵 City Pop & Retro', prompt: 'ร้านอาหารญี่ปุ่น Izakaya บรรยากาศฟีลกู้ด ดนตรี City Pop และ Funk ยุค 80s' },
                  ].map((p, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        setAiPrompt(p.prompt);
                        handleGenerateAiPlaylist(p.prompt);
                      }}
                      className="px-2.5 py-1.5 rounded-xl bg-[#1c1c22] hover:bg-purple-600/20 hover:border-purple-500/40 border border-white/5 text-zinc-300 hover:text-white text-xs transition"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Prompt Textarea */}
              <div>
                <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block mb-1.5 flex items-center justify-between">
                  <span>✍️ บรรยายบรรยากาศร้าน & เพลงที่ต้องการ (Custom Vibe Prompt)</span>
                  <span className="text-[10px] text-zinc-500">ภาษาไทยหรืออังกฤษ</span>
                </label>
                <textarea
                  rows={3}
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  placeholder="เช่น: ร้านอาหารสไตล์บาร์นั่งชิลล์ริมแม่น้ำ คนฟังอายุ 25-35 ปี อยากได้เพลงป๊อปไทยร่วมสมัยและสากลฟังสบาย กรูฟนุ่มๆ..."
                  className="w-full bg-[#101014] text-white text-xs p-3.5 rounded-2xl border border-white/10 focus:border-purple-500/50 focus:outline-none transition leading-relaxed resize-none shadow-inner"
                />
              </div>

              {/* Language Selection Bar */}
              <div>
                <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block mb-1.5 flex items-center justify-between">
                  <span>🌐 ภาษาเพลงที่ต้องการ (Languages - ติ๊กเลือกสลับกันได้)</span>
                  <span className="text-[10px] text-zinc-500">เลือกได้หลายภาษา</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { id: 'thai', label: '🇹🇭 ไทย (Thai)' },
                    { id: 'english', label: '🇬🇧 สากล / อังกฤษ (English)' },
                    { id: 'korean', label: '🇰🇷 เกาหลี (K-Pop)' },
                    { id: 'japanese', label: '🇯🇵 ญี่ปุ่น (J-Pop / Anime)' },
                    { id: 'chinese', label: '🇨🇳 จีน (C-Pop)' },
                  ].map((lang) => {
                    const isSelected = aiLanguages.includes(lang.id);
                    return (
                      <button
                        key={lang.id}
                        type="button"
                        onClick={() => toggleAiLanguage(lang.id)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                          isSelected
                            ? 'bg-purple-600/30 border border-purple-500 text-white shadow-sm'
                            : 'bg-[#18181e] hover:bg-[#202028] border border-white/5 text-zinc-400'
                        }`}
                      >
                        <span className={`w-3.5 h-3.5 rounded flex items-center justify-center text-[10px] border ${
                          isSelected ? 'bg-purple-500 border-purple-400 text-white' : 'border-zinc-600 bg-black/40'
                        }`}>
                          {isSelected ? '✓' : ''}
                        </span>
                        <span>{lang.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Smart Mixtape Flow Mode Selector */}
              <div>
                <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block mb-1.5 flex items-center justify-between">
                  <span>🎛️ สไตล์การจัดเซ็ต Smart Mixtape (DJ Energy & Key Flow)</span>
                  <span className="text-[10px] text-purple-400 font-bold">Auto Harmonic & Energy Match</span>
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                  {[
                    { id: 'peak_climb', label: '🚀 Peak Climb', desc: 'Warm-up ➔ Peak (1-5★)' },
                    { id: 'harmonic_flow', label: '🔄 Harmonic Flow', desc: 'Camelot Wheel Key Lock' },
                    { id: 'bpm_ramp', label: '📈 BPM Ramp', desc: 'สปีดไล่จากช้าไปเร็ว' },
                    { id: 'sunset_lounge', label: '🌅 Sunset Lounge', desc: 'ชิลล์ ผ่อนคลายสม่ำเสมอ' },
                  ].map((mode) => {
                    const isSelected = aiMixtapeMode === mode.id;
                    return (
                      <button
                        key={mode.id}
                        type="button"
                        onClick={() => setAiMixtapeMode(mode.id)}
                        className={`p-2 rounded-xl text-left transition border ${
                          isSelected
                            ? 'bg-purple-600/25 border-purple-500 text-white shadow-sm'
                            : 'bg-[#18181e] hover:bg-[#202028] border-white/5 text-zinc-400'
                        }`}
                      >
                        <p className="text-xs font-bold truncate text-purple-200">{mode.label}</p>
                        <p className="text-[10px] text-zinc-400 truncate">{mode.desc}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Options & API Settings Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                {/* Track Count Selector */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-400 font-semibold">จำนวนเพลง:</span>
                  {[10, 15, 20, 30].map((cnt) => (
                    <button
                      key={cnt}
                      type="button"
                      onClick={() => setAiTrackCount(cnt)}
                      className={`px-2.5 py-1 rounded-xl text-xs font-bold transition ${
                        aiTrackCount === cnt
                          ? 'bg-purple-600 text-white shadow'
                          : 'bg-[#1c1c22] text-zinc-400 hover:text-white'
                      }`}
                    >
                      {cnt} เพลง
                    </button>
                  ))}
                </div>

                {/* API Settings Toggle */}
                <button
                  type="button"
                  onClick={() => setShowAiSettings(!showAiSettings)}
                  className="text-xs text-zinc-400 hover:text-purple-300 flex items-center gap-1.5 transition"
                >
                  <span>⚙️ ตั้งค่า API (Gemini / OpenAI)</span>
                  <span>{showAiSettings ? '▲' : '▼'}</span>
                </button>
              </div>

              {/* Expandable API Settings Card */}
              {showAiSettings && (
                <div className="p-3.5 bg-[#101014] rounded-2xl border border-purple-500/20 space-y-3 animate-fade-in text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white">AI Provider:</span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setAiProvider('gemini')}
                        className={`px-2.5 py-1 rounded-lg font-semibold transition ${
                          aiProvider === 'gemini' ? 'bg-purple-600 text-white' : 'bg-[#1c1c22] text-zinc-400'
                        }`}
                      >
                        Google Gemini
                      </button>
                      <button
                        type="button"
                        onClick={() => setAiProvider('openai')}
                        className={`px-2.5 py-1 rounded-lg font-semibold transition ${
                          aiProvider === 'openai' ? 'bg-emerald-600 text-white' : 'bg-[#1c1c22] text-zinc-400'
                        }`}
                      >
                        OpenAI (GPT-4o)
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="text-zinc-400 block mb-1">API Key (ไม่บังคับ - ถ้าไม่ใส่จะใช้ AI DJ Smart Engine แทน):</label>
                    <input
                      type="password"
                      value={aiApiKey}
                      onChange={(e) => setAiApiKey(e.target.value)}
                      placeholder={aiProvider === 'gemini' ? 'AIzaSy... (Gemini API Key)' : 'sk-... (OpenAI API Key)'}
                      className="w-full bg-[#18181e] text-white px-3 py-2 rounded-xl border border-white/10 focus:outline-none font-mono text-xs"
                    />
                  </div>
                </div>
              )}

              {/* Generate Action Button */}
              <button
                type="button"
                disabled={isGeneratingAi}
                onClick={() => handleGenerateAiPlaylist()}
                className="w-full py-3 rounded-2xl bg-gradient-to-r from-purple-600 via-pink-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs shadow-lg transition active:scale-98 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isGeneratingAi ? (
                  <>
                    <span className="animate-spin text-sm">↻</span>
                    <span>AI กำลังจัดเซ็ต Smart Mixtape และวิเคราะห์ฮาร์โมนิก...</span>
                  </>
                ) : (
                  <>
                    <span>🎛️</span>
                    <span>ให้ AI จัดเซ็ต Smart Mixtape (Generate Setlist)</span>
                  </>
                )}
              </button>

              {/* AI Curated Result Card */}
              {aiCuratedResult && (
                <div className="pt-3 border-t border-white/5 space-y-3 animate-fade-in">
                  <div className="p-4 bg-gradient-to-r from-purple-900/20 via-pink-900/10 to-indigo-900/20 rounded-2xl border border-purple-500/30 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <span className="text-base flex-shrink-0">🎵</span>
                        <input
                          type="text"
                          value={aiPlaylistTitle}
                          onChange={(e) => setAiPlaylistTitle(e.target.value)}
                          placeholder="ชื่อ Playlist / Folder..."
                          className="w-full bg-[#14141c]/90 text-white font-bold text-sm px-3 py-1.5 rounded-xl border border-purple-500/30 focus:border-purple-400 focus:outline-none placeholder-zinc-500 shadow-inner"
                          title="แก้ไขชื่อ Playlist / โฟลเดอร์ดาวน์โหลด"
                        />
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <span className="text-[10px] font-bold font-mono px-2 py-1 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                          🎛️ {aiMixtapeMode.toUpperCase().replace('_', ' ')}
                        </span>
                        <span className="text-[10px] font-bold font-mono px-2 py-1 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                          {aiCuratedResult.tracks.length} เพลง
                        </span>
                      </div>
                    </div>

                    {aiCuratedResult.vibe_summary && (
                      <p className="text-xs text-purple-200/80 leading-relaxed bg-black/20 p-2 rounded-xl border border-white/5">
                        {aiCuratedResult.vibe_summary}
                      </p>
                    )}

                    {/* Separate Folder & M3U8 Playlist Checkbox Option */}
                    <label className="flex items-center gap-3 p-2.5 rounded-xl bg-purple-950/40 hover:bg-purple-900/30 border border-purple-500/30 cursor-pointer transition select-none">
                      <input
                        type="checkbox"
                        checked={aiSeparateFolder}
                        onChange={(e) => setAiSeparateFolder(e.target.checked)}
                        className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500 accent-purple-600 cursor-pointer flex-shrink-0"
                      />
                      <div className="text-xs">
                        <span className="font-bold text-white flex items-center gap-1.5">
                          <span>📁</span>
                          <span>สร้าง Folder แยก + ไฟล์ .m3u8 Playlist สำหรับเซ็ตนี้</span>
                        </span>
                        <span className="text-[11px] text-purple-300/70 block mt-0.5">
                          {aiSeparateFolder
                            ? `เพลงจะถูกแยกไว้ในโฟลเดอร์ "downloads/${aiPlaylistTitle || 'AI Playlist'}/" พร้อมไฟล์ .m3u8 และ rekordbox.xml`
                            : 'ดาวน์โหลดลงโฟลเดอร์หลักรวม (Single Folder) ไม่แยกโฟลเดอร์และไม่สร้าง m3u8'}
                        </span>
                      </div>
                    </label>
                  </div>

                  {/* Track List Preview */}
                  <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                    {aiCuratedResult.tracks.map((t, idx) => (
                      <React.Fragment key={idx}>
                        <div
                          className="p-2.5 bg-[#101014] hover:bg-[#181820] border border-white/5 rounded-xl flex items-center justify-between gap-3 text-xs transition shadow-sm"
                        >
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            <span className="w-5 text-center font-mono text-[10px] text-zinc-500 font-bold">
                              #{idx + 1}
                            </span>
                            <div className="w-8 h-8 rounded-lg bg-[#202026] overflow-hidden flex-shrink-0">
                              {t.cover_url ? (
                                <img src={t.cover_url} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-xs">🎵</div>
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="font-bold text-white truncate">{t.title}</p>
                              <div className="flex items-center gap-2 mt-0.5">
                                <p className="text-[11px] text-zinc-400 truncate">{t.artist}</p>
                                {t.camelot && (
                                  <span
                                    className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded border"
                                    style={{
                                      backgroundColor: `${t.color || '#8b5cf6'}20`,
                                      color: t.color || '#8b5cf6',
                                      borderColor: `${t.color || '#8b5cf6'}50`,
                                    }}
                                  >
                                    {t.camelot}
                                  </span>
                                )}
                                {t.bpm && (
                                  <span className="text-[9px] font-mono text-zinc-400 font-semibold">
                                    {t.bpm} BPM
                                  </span>
                                )}
                                {t.stars && (
                                  <span className="text-[9px] text-amber-400 hidden sm:inline">
                                    {'★'.repeat(t.stars)}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          {t.vibe_note && (
                            <span className="text-[10px] px-2 py-0.5 rounded-md bg-white/5 text-zinc-400 max-w-[150px] truncate hidden md:inline-block">
                              💡 {t.vibe_note}
                            </span>
                          )}

                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                const effectiveName = aiSeparateFolder ? (aiPlaylistTitle.trim() || aiCuratedResult.setlist_title || 'AI Smart Mixtape') : '';
                                const effectiveFolderMode = aiSeparateFolder ? 'playlist' : 'single';
                                const trackWithMeta = {
                                  ...t,
                                  playlist_name: effectiveName,
                                  folder_mode: effectiveFolderMode,
                                };
                                setTracks((prev) => [...prev, trackWithMeta]);
                                showToast(`เพิ่ม '${t.title}' เข้าคิวแล้ว`, 'success');
                              }}
                              className="px-2 py-1 bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white rounded-lg text-[10px] font-semibold transition"
                              title="เพิ่มเพลงนี้เข้าคิว"
                            >
                              ＋ คิว
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const effectiveName = aiSeparateFolder ? (aiPlaylistTitle.trim() || aiCuratedResult.setlist_title || 'AI Smart Mixtape') : '';
                                const effectiveFolderMode = aiSeparateFolder ? 'playlist' : 'single';
                                const trackWithMeta = {
                                  ...t,
                                  playlist_name: effectiveName,
                                  folder_mode: effectiveFolderMode,
                                };
                                setTracks((prev) => {
                                  const newQueue = [...prev, trackWithMeta];
                                  setTimeout(() => {
                                    convertSingle(newQueue.length - 1);
                                  }, 300);
                                  return newQueue;
                                });
                                showToast(`เริ่มดาวน์โหลด '${t.title}'...`, 'info');
                              }}
                              className="px-2 py-1 bg-emerald-600/30 hover:bg-emerald-600 border border-emerald-500/40 text-emerald-200 hover:text-white rounded-lg text-[10px] font-bold transition flex items-center gap-1"
                              title="ดาวน์โหลดเพลงนี้ทันที"
                            >
                              <span>⚡ โหลด</span>
                            </button>
                          </div>
                        </div>

                        {/* Harmonic Transition Bridge */}
                        {(t as any).next_transition && (
                          <div className="flex items-center justify-center -my-0.5">
                            <div className="flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-purple-500/10 border border-purple-500/20 text-[9px] text-purple-300 font-mono tracking-tight shadow-sm">
                              <span>🔗 {(t as any).next_transition.label}</span>
                              <span className="text-zinc-500">|</span>
                              <span className="text-zinc-400">Δ {(t as any).next_transition.delta_bpm} BPM</span>
                            </div>
                          </div>
                        )}
                      </React.Fragment>
                    ))}
                  </div>

                  {/* Action Buttons to Add to Queue or Mixtape */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2">
                    <button
                      type="button"
                      onClick={handleTransferAiToMixtapeTab}
                      className="py-2.5 rounded-xl bg-purple-600/30 hover:bg-purple-600/50 border border-purple-500/40 text-purple-200 hover:text-white font-bold text-xs transition flex items-center justify-center gap-1"
                    >
                      <span>🎛️</span>
                      <span>แท็บ Mixtape</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOpenYoutubeExport(aiCuratedResult.tracks, aiPlaylistTitle || aiCuratedResult.setlist_title)}
                      className="py-2.5 rounded-xl bg-rose-600/25 hover:bg-rose-600/40 border border-rose-500/40 text-rose-200 hover:text-white font-bold text-xs transition flex items-center justify-center gap-1"
                    >
                      <span>📋</span>
                      <span>Tracklist (.txt)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAddAiTracksToQueue(false)}
                      className="py-2.5 rounded-xl bg-[#202028] hover:bg-[#282834] text-white font-bold text-xs transition flex items-center justify-center gap-1 border border-white/5"
                    >
                      <span>＋</span>
                      <span>ใส่ลงในคิว</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAddAiTracksToQueue(true)}
                      className="py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow-lg transition flex items-center justify-center gap-1"
                    >
                      <span>⚡</span>
                      <span>ดาวน์โหลดทันที</span>
                    </button>
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>
      )}

      {/* ================= FOLDER & MIX MANAGER MODAL (FINDER / FILE EXPLORER STYLE) ================= */}
      {showFolderManagerModal && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4 md:p-6 animate-fade-in">
          <div className="bg-[#141418] border border-white/10 rounded-3xl max-w-5xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
            
            {/* Modal Header */}
            <div className="p-5 border-b border-white/5 bg-[#18181e] flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center text-lg shadow-lg">
                  📂
                </div>
                <div>
                  <h2 className="text-base font-bold text-white flex items-center gap-2">
                    <span>คลังโฟลเดอร์ & เซ็ตเพลง Mix ทั้งหมด (Folder & Mix Explorer)</span>
                    <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300 font-bold border border-purple-500/30">
                      {uniquePlaylists.length} โฟลเดอร์ • {libraryTracks.length} เพลงรวม
                    </span>
                  </h2>
                  <p className="text-xs text-zinc-400">ค้นหา เรียงลำดับ และดูข้อมูลความยาว, แนวเพลง, ช่วง BPM ของแต่ละโฟลเดอร์แบบ File Explorer</p>
                </div>
              </div>
              <button
                onClick={() => setShowFolderManagerModal(false)}
                className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white flex items-center justify-center text-sm transition"
              >
                ✕
              </button>
            </div>

            {/* Filter & View Switcher Bar */}
            <div className="p-4 border-b border-white/5 bg-[#16161c] flex items-center justify-between gap-3 flex-wrap flex-shrink-0">
              <div className="flex-1 min-w-[240px] relative flex items-center">
                <input
                  type="text"
                  autoFocus
                  value={folderSearchQuery}
                  onChange={(e) => setFolderSearchQuery(e.target.value)}
                  placeholder="🔍 พิมพ์ค้นหาโฟลเดอร์, แนวเพลง, BPM (เช่น Shabu, EDM, House, 128)..."
                  className="w-full bg-[#101014] text-white text-xs pl-9 pr-8 py-2 rounded-xl border border-white/10 focus:outline-none focus:border-purple-500 shadow-inner"
                />
                <span className="absolute left-3 text-xs text-zinc-500">🔍</span>
                {folderSearchQuery && (
                  <button onClick={() => setFolderSearchQuery('')} className="absolute right-3 text-zinc-500 hover:text-white text-xs">✕</button>
                )}
              </div>

              <div className="flex items-center gap-2">
                {/* View Mode Toggle: List (Finder Details) vs Grid (Cards) */}
                <div className="flex items-center bg-[#101014] rounded-xl p-0.5 border border-white/10">
                  <button
                    onClick={() => setFolderViewMode('list')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 ${
                      folderViewMode === 'list' ? 'bg-purple-600 text-white shadow' : 'text-zinc-400 hover:text-white'
                    }`}
                    title="แสดงแบบตารางรายการละเอียด (Finder / File Explorer Details)"
                  >
                    <span>📑</span>
                    <span>แบบรายการ (List)</span>
                  </button>
                  <button
                    onClick={() => setFolderViewMode('grid')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 ${
                      folderViewMode === 'grid' ? 'bg-purple-600 text-white shadow' : 'text-zinc-400 hover:text-white'
                    }`}
                    title="แสดงแบบการ์ดตาราง (Grid Cards)"
                  >
                    <span>🎴</span>
                    <span>แบบการ์ด (Grid)</span>
                  </button>
                </div>

                <button
                  onClick={() => {
                    setLibFilterPlaylist('ALL');
                    setShowFolderManagerModal(false);
                  }}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition border ${
                    libFilterPlaylist === 'ALL'
                      ? 'bg-indigo-600 text-white border-indigo-500 shadow'
                      : 'bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white border-white/5'
                  }`}
                >
                  📁 ดูเพลงทั้งหมด ({libraryTracks.length})
                </button>
              </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 overflow-y-auto">
              {sortedAndFilteredPlaylists.length === 0 ? (
                <div className="text-center py-20 text-zinc-500 text-xs">
                  <span className="text-4xl block mb-3">🔍</span>
                  ไม่พบโฟลเดอร์ที่ตรงกับคำค้นหา "{folderSearchQuery}"
                </div>
              ) : folderViewMode === 'list' ? (
                /* ================= FINDER / FILE EXPLORER DETAILS TABLE ================= */
                <div className="min-w-full">
                  {/* Table Header (Sortable Columns) */}
                  <div className="sticky top-0 bg-[#141418] z-10 grid grid-cols-12 gap-3 px-5 py-3 border-b border-white/10 text-[11px] font-bold text-zinc-400 uppercase tracking-wider select-none shadow-sm">
                    <div
                      onClick={() => handleFolderSort('name')}
                      className="col-span-4 flex items-center gap-1.5 cursor-pointer hover:text-purple-300 transition"
                      title="คลิกเพื่อเรียงตามชื่อโฟลเดอร์"
                    >
                      <span>📁 ชื่อโฟลเดอร์ Mix</span>
                      {folderSortColumn === 'name' && (
                        <span className="text-purple-400 font-mono text-xs">{folderSortDirection === 'asc' ? '▲' : '▼'}</span>
                      )}
                    </div>

                    <div
                      onClick={() => handleFolderSort('count')}
                      className="col-span-1 text-center flex items-center justify-center gap-1 cursor-pointer hover:text-purple-300 transition"
                      title="คลิกเพื่อเรียงตามจำนวนเพลง"
                    >
                      <span>🎵 เพลง</span>
                      {folderSortColumn === 'count' && (
                        <span className="text-purple-400 font-mono text-xs">{folderSortDirection === 'asc' ? '▲' : '▼'}</span>
                      )}
                    </div>

                    <div
                      onClick={() => handleFolderSort('duration')}
                      className="col-span-2 text-center flex items-center justify-center gap-1 cursor-pointer hover:text-purple-300 transition"
                      title="คลิกเพื่อเรียงตามความยาวรวม"
                    >
                      <span>⏱️ ความยาวรวม</span>
                      {folderSortColumn === 'duration' && (
                        <span className="text-purple-400 font-mono text-xs">{folderSortDirection === 'asc' ? '▲' : '▼'}</span>
                      )}
                    </div>

                    <div className="col-span-2">
                      <span>🎛️ แนวเพลงหลัก</span>
                    </div>

                    <div
                      onClick={() => handleFolderSort('bpm')}
                      className="col-span-1 text-center flex items-center justify-center gap-1 cursor-pointer hover:text-purple-300 transition"
                      title="คลิกเพื่อเรียงตามช่วง BPM"
                    >
                      <span>📈 BPM</span>
                      {folderSortColumn === 'bpm' && (
                        <span className="text-purple-400 font-mono text-xs">{folderSortDirection === 'asc' ? '▲' : '▼'}</span>
                      )}
                    </div>

                    <div className="col-span-2 text-right">
                      <span>⚡ จัดการ</span>
                    </div>
                  </div>

                  {/* Table Rows */}
                  <div className="divide-y divide-white/5">
                    {sortedAndFilteredPlaylists.map((p) => {
                      const isSelected = libFilterPlaylist === p.name;
                      return (
                        <div
                          key={p.name}
                          onClick={() => {
                            setLibFilterPlaylist(p.name);
                            setShowFolderManagerModal(false);
                          }}
                          className={`grid grid-cols-12 gap-3 items-center px-5 py-3 text-xs transition cursor-pointer group ${
                            isSelected
                              ? 'bg-purple-950/40 border-l-4 border-l-purple-500 text-white'
                              : 'hover:bg-white/[0.04] text-zinc-300'
                          }`}
                        >
                          {/* Folder Name */}
                          <div className="col-span-4 flex items-center gap-3 min-w-0">
                            <div className="w-8 h-8 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-sm flex-shrink-0 group-hover:scale-105 transition-transform">
                              📁
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className={`font-bold truncate ${isSelected ? 'text-purple-200' : 'text-white'}`} title={p.name}>
                                  {p.name}
                                </span>
                                {isSelected && (
                                  <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-purple-500/30 text-purple-200 border border-purple-500/40 flex-shrink-0">
                                    Active
                                  </span>
                                )}
                              </div>
                              <p className="text-[10px] text-zinc-500 font-mono mt-0.5 truncate">
                                {p.keysCount} Keys • ⭐ {p.avgStars} ดาว
                              </p>
                            </div>
                          </div>

                          {/* Track Count */}
                          <div className="col-span-1 text-center font-mono">
                            <span className="px-2 py-0.5 rounded-lg bg-black/40 border border-white/5 font-bold text-purple-300">
                              {p.count}
                            </span>
                          </div>

                          {/* Duration */}
                          <div className="col-span-2 text-center text-zinc-400 font-medium">
                            <span>{p.durationFormatted}</span>
                          </div>

                          {/* Top Genres */}
                          <div className="col-span-2 flex items-center gap-1 overflow-hidden">
                            {p.topGenres.map((g, gIdx) => (
                              <span
                                key={gIdx}
                                className="px-1.5 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-[10px] font-semibold truncate max-w-[100px]"
                              >
                                {g}
                              </span>
                            ))}
                          </div>

                          {/* BPM Range */}
                          <div className="col-span-1 text-center font-mono text-[11px] text-emerald-400 font-bold">
                            <span>{p.bpmRange}</span>
                          </div>

                          {/* Action Buttons */}
                          <div
                            className="col-span-2 flex items-center justify-end gap-1.5"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                setLibFilterPlaylist(p.name);
                                setShowFolderManagerModal(false);
                              }}
                              className="px-2.5 py-1 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-lg text-xs font-bold shadow transition flex items-center gap-1"
                              title="เลือกดูเพลงในโฟลเดอร์นี้"
                            >
                              <span>👀 ดูเพลง</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleOpenTrackFolder({ playlist_name: p.name } as Track)}
                              className="w-7 h-7 bg-[#22222c] hover:bg-[#2c2c3a] text-zinc-200 hover:text-white rounded-lg text-xs font-semibold border border-white/5 transition flex items-center justify-center"
                              title="เปิดโฟลเดอร์ใน File Explorer ในเครื่องคอมพิวเตอร์"
                            >
                              <span>📂</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleOpenYoutubeExport(p.tracks, p.name)}
                              className="w-7 h-7 bg-rose-600/20 hover:bg-rose-600/40 text-rose-300 hover:text-white rounded-lg text-xs font-semibold border border-rose-500/30 transition flex items-center justify-center"
                              title="Export Tracklist สำหรับ YouTube หรือ .txt"
                            >
                              <span>📋</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setMixtapeTracks(p.tracks);
                                setActiveTab('mixtape');
                                setShowFolderManagerModal(false);
                                showToast(`ส่ง ${p.tracks.length} เพลงจาก "${p.name}" เข้าแท็บ Mixtape แล้ว`, 'success');
                              }}
                              className="w-7 h-7 bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 hover:text-white rounded-lg text-xs font-semibold border border-indigo-500/30 transition flex items-center justify-center"
                              title="โหลดเพลงในโฟลเดอร์นี้เข้า Smart Mixtape Studio"
                            >
                              <span>🎛️</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                /* ================= GRID VIEW CARDS ================= */
                <div className="p-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {sortedAndFilteredPlaylists.map((p) => {
                    const isSelected = libFilterPlaylist === p.name;
                    return (
                      <div
                        key={p.name}
                        className={`p-4 rounded-2xl border transition flex flex-col justify-between gap-3 ${
                          isSelected
                            ? 'bg-purple-950/30 border-purple-500/50 shadow-lg shadow-purple-900/20'
                            : 'bg-[#181820] hover:bg-[#1e1e28] border-white/5 hover:border-white/15'
                        }`}
                      >
                        <div>
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span className="text-xl flex-shrink-0">📁</span>
                              <div className="min-w-0">
                                <h4 className="text-xs font-bold text-white truncate" title={p.name}>
                                  {p.name}
                                </h4>
                                <p className="text-[10px] text-zinc-400 mt-0.5">
                                  {p.count} เพลง • {p.durationFormatted}
                                </p>
                              </div>
                            </div>
                            {isSelected && (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-purple-500/30 text-purple-200 border border-purple-500/40 flex-shrink-0">
                                Active
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
                            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                              📈 {p.bpmRange}
                            </span>
                            {p.topGenres.map((g, idx) => (
                              <span key={idx} className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 truncate max-w-[90px]">
                                {g}
                              </span>
                            ))}
                          </div>
                        </div>

                        {/* Card Action Buttons */}
                        <div className="grid grid-cols-4 gap-1.5 pt-2 border-t border-white/5">
                          <button
                            type="button"
                            onClick={() => {
                              setLibFilterPlaylist(p.name);
                              setShowFolderManagerModal(false);
                            }}
                            className="col-span-2 py-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold shadow transition flex items-center justify-center gap-1"
                            title="เลือกดูเพลงในโฟลเดอร์นี้"
                          >
                            <span>👀 ดูเพลง</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleOpenTrackFolder({ playlist_name: p.name } as Track)}
                            className="py-1.5 bg-[#22222c] hover:bg-[#2c2c3a] text-zinc-200 hover:text-white rounded-xl text-xs font-semibold border border-white/5 transition flex items-center justify-center gap-1"
                            title="เปิดโฟลเดอร์ใน File Explorer"
                          >
                            <span>📂</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleOpenYoutubeExport(p.tracks, p.name)}
                            className="py-1.5 bg-rose-600/20 hover:bg-rose-600/40 text-rose-300 hover:text-white rounded-xl text-xs font-semibold border border-rose-500/30 transition flex items-center justify-center gap-1"
                            title="Export Tracklist สำหรับ YouTube หรือ .txt"
                          >
                            <span>📋</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Modal Footer (Finder Style Status Bar) */}
            <div className="p-3.5 border-t border-white/5 bg-[#18181e] flex flex-col sm:flex-row items-center justify-between text-xs text-zinc-400 gap-2 flex-shrink-0 select-none">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <span>📁</span>
                  <span>แสดง <b className="text-white">{sortedAndFilteredPlaylists.length}</b> จาก <b className="text-white">{uniquePlaylists.length}</b> โฟลเดอร์</span>
                </span>
                <span className="text-zinc-600">•</span>
                <span className="flex items-center gap-1">
                  <span>🎵</span>
                  <span>รวม <b className="text-white">{sortedAndFilteredPlaylists.reduce((acc, p) => acc + p.count, 0)}</b> เพลง</span>
                </span>
                <span className="text-zinc-600">•</span>
                <span className="flex items-center gap-1">
                  <span>⏱️</span>
                  <span>รวม <b className="text-white">{Math.round(sortedAndFilteredPlaylists.reduce((acc, p) => acc + p.durationMs, 0) / 3600000)}</b> ชั่วโมง</span>
                </span>
              </div>

              <button
                onClick={() => setShowFolderManagerModal(false)}
                className="px-4 py-1.5 bg-[#202028] hover:bg-[#282834] text-white rounded-xl font-semibold transition text-xs border border-white/5"
              >
                ปิดหน้าต่าง
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ================= YOUTUBE & TRACKLIST TXT EXPORT MODAL ================= */}
      {showYoutubeExportModal && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4 md:p-6 animate-fade-in">
          <div className="bg-[#141418] border border-white/10 rounded-3xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
            
            {/* Modal Header */}
            <div className="p-5 border-b border-white/5 bg-[#18181e] flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-rose-600 to-red-500 flex items-center justify-center text-lg shadow-lg">
                  🎬
                </div>
                <div>
                  <h2 className="text-base font-bold text-white flex items-center gap-2">
                    <span>Export Tracklist for YouTube / .txt</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 font-bold border border-rose-500/30">
                      {youtubeExportTracks.length} เพลง
                    </span>
                  </h2>
                  <p className="text-xs text-zinc-400">สร้างรายชื่อเพลงพร้อม Timecode สำหรับวางใน YouTube Description, Chapters หรือบันทึกเป็นไฟล์ .txt</p>
                </div>
              </div>
              <button
                onClick={() => setShowYoutubeExportModal(false)}
                className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white flex items-center justify-center text-sm transition"
              >
                ✕
              </button>
            </div>

            {/* Modal Scrollable Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {/* Mix Title Input */}
              <div>
                <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block mb-1.5">
                  📝 ชื่อเซ็ตเพลง / หัวข้อ (Set Title)
                </label>
                <input
                  type="text"
                  value={youtubeExportTitle}
                  onChange={(e) => {
                    setYoutubeExportTitle(e.target.value);
                    setYoutubeExportText(generateTracklistOutput(youtubeExportTracks, youtubeExportFormat, e.target.value));
                  }}
                  className="w-full bg-[#1c1c22] border border-white/10 rounded-xl px-3.5 py-2 text-white font-medium text-xs focus:outline-none focus:border-rose-500"
                />
              </div>

              {/* Format Selector Pills */}
              <div>
                <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block mb-1.5">
                  🎛️ รูปแบบ Tracklist (Tracklist Format)
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <button
                    type="button"
                    onClick={() => handleFormatChange('youtube')}
                    className={`p-2.5 rounded-xl border text-left transition flex flex-col justify-between ${
                      youtubeExportFormat === 'youtube'
                        ? 'bg-rose-500/15 border-rose-500/50 text-white shadow-lg'
                        : 'bg-[#18181e] border-white/5 text-zinc-400 hover:bg-[#202028]'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <span>🎬</span>
                      <span className="font-bold text-xs">YouTube Chapters</span>
                    </div>
                    <span className="text-[10px] text-zinc-400 font-mono">00:00 Artist - Title</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleFormatChange('numbered')}
                    className={`p-2.5 rounded-xl border text-left transition flex flex-col justify-between ${
                      youtubeExportFormat === 'numbered'
                        ? 'bg-indigo-500/15 border-indigo-500/50 text-white shadow-lg'
                        : 'bg-[#18181e] border-white/5 text-zinc-400 hover:bg-[#202028]'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <span>🔢</span>
                      <span className="font-bold text-xs">Numbered List</span>
                    </div>
                    <span className="text-[10px] text-zinc-400 font-mono">1. Artist - Title</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleFormatChange('pro_dj')}
                    className={`p-2.5 rounded-xl border text-left transition flex flex-col justify-between ${
                      youtubeExportFormat === 'pro_dj'
                        ? 'bg-purple-500/15 border-purple-500/50 text-white shadow-lg'
                        : 'bg-[#18181e] border-white/5 text-zinc-400 hover:bg-[#202028]'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <span>🎧</span>
                      <span className="font-bold text-xs">Pro DJ Tracklist</span>
                    </div>
                    <span className="text-[10px] text-zinc-400 font-mono">01. Track [BPM|Key]</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleFormatChange('plain')}
                    className={`p-2.5 rounded-xl border text-left transition flex flex-col justify-between ${
                      youtubeExportFormat === 'plain'
                        ? 'bg-emerald-500/15 border-emerald-500/50 text-white shadow-lg'
                        : 'bg-[#18181e] border-white/5 text-zinc-400 hover:bg-[#202028]'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <span>📝</span>
                      <span className="font-bold text-xs">Plain Text</span>
                    </div>
                    <span className="text-[10px] text-zinc-400 font-mono">Artist - Title</span>
                  </button>
                </div>
              </div>

              {/* Textarea Preview & Edit */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
                    📋 ข้อความ Tracklist (แก้ไขเพิ่มเติมได้โดยตรง)
                  </label>
                  <span className="text-[10px] text-zinc-500 font-mono">
                    {youtubeExportText.split('\n').filter(l => l.trim()).length} บรรทัด
                  </span>
                </div>
                <textarea
                  rows={9}
                  value={youtubeExportText}
                  onChange={(e) => setYoutubeExportText(e.target.value)}
                  className="w-full bg-[#101014] border border-white/10 rounded-2xl p-3.5 text-white font-mono text-xs focus:outline-none focus:border-rose-500 leading-relaxed shadow-inner"
                  placeholder="Tracklist..."
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-white/5 bg-[#18181e] flex flex-col sm:flex-row items-center justify-between gap-3 flex-shrink-0">
              <span className="text-xs text-zinc-400">
                💡 นำไปวางใน YouTube Description / Pinned Comment แล้วจะแปลงเป็น <b className="text-white">Video Chapters</b> ให้คลิกเลือกเพลงได้ทันที
              </span>
              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                <button
                  type="button"
                  onClick={handleSaveTracklistTxtFile}
                  className="px-4 py-2.5 bg-[#202028] hover:bg-[#282834] text-zinc-200 hover:text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 border border-white/5"
                  title="บันทึกเป็นไฟล์ .txt ลงเครื่อง"
                >
                  <span>💾</span>
                  <span>บันทึกไฟล์ .txt</span>
                </button>
                <button
                  type="button"
                  onClick={handleCopyTracklistToClipboard}
                  className="px-5 py-2.5 bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white rounded-xl text-xs font-bold shadow-lg transition flex items-center gap-1.5"
                  title="คัดลอกลงคลิปบอร์ด"
                >
                  <span>📋</span>
                  <span>คัดลอก Tracklist (Copy)</span>
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ================= RIGHT CLICK CONTEXT MENU (ระบบคลิกขวา) ================= */}
      {contextMenu.isOpen && (
        <div
          style={{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }}
          className="fixed z-[99999] w-64 bg-[#141418]/95 backdrop-blur-2xl border border-white/15 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.85)] p-2 text-white animate-fade-in select-none text-xs"
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
        >
          {contextMenu.track ? (
            <>
              {/* Track Mini Card Header */}
              <div className="flex items-center gap-2.5 p-2 bg-white/5 rounded-xl border border-white/5 mb-1.5">
                <div className="w-9 h-9 rounded-lg bg-[#202026] overflow-hidden flex-shrink-0 relative">
                  {contextMenu.track.cover_url ? (
                    <img src={contextMenu.track.cover_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-xs">🎵</div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-white truncate leading-tight">{contextMenu.track.title}</p>
                  <p className="text-[11px] text-zinc-400 truncate mt-0.5">{contextMenu.track.artist || 'Unknown Artist'}</p>
                  <div className="flex items-center gap-1.5 mt-1 font-mono text-[9px]">
                    <span className="text-emerald-400 font-bold">{contextMenu.track.camelot || '8A'}</span>
                    <span className="text-zinc-500">•</span>
                    <span className="text-zinc-300">{Math.round(contextMenu.track.bpm || 128)} BPM</span>
                  </div>
                </div>
              </div>

              {/* Quick Rate 1-5 Stars */}
              <div className="px-2 py-1 flex items-center justify-between border-b border-white/5 pb-1.5 mb-1">
                <span className="text-[10px] text-zinc-400 font-semibold">ให้คะแนน:</span>
                <div className="flex items-center gap-1 text-amber-400">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => handleRateFromContextMenu(star)}
                      className={`hover:scale-125 transition text-xs ${
                        (contextMenu.track?.stars || 0) >= star ? 'text-amber-400' : 'text-zinc-600 hover:text-amber-300'
                      }`}
                      title={`ให้ ${star} ดาว`}
                    >
                      ★
                    </button>
                  ))}
                </div>
              </div>

              {/* Playback Actions */}
              <div className="space-y-0.5">
                {/* Batch Selection Play & Queue (if multiple tracks selected in library) */}
                {selectedLibIndices.length > 1 && contextMenu.source === 'library' && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        const selected = selectedLibIndices.map(i => filteredLibrary[i]).filter(Boolean);
                        handleAddMultipleToQueue(selected, true);
                        closeContextMenu();
                      }}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 flex items-center gap-2.5 transition text-left font-bold"
                    >
                      <span>▶</span>
                      <span>เล่นเพลงที่เลือกทั้งหมด ({selectedLibIndices.length} เพลง)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        const selected = selectedLibIndices.map(i => filteredLibrary[i]).filter(Boolean);
                        handleAddMultipleToQueue(selected, false);
                        closeContextMenu();
                      }}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-300 flex items-center gap-2.5 transition text-left font-bold"
                    >
                      <span>📑</span>
                      <span>เพิ่มเพลงที่เลือกทั้งหมดลงคิว ({selectedLibIndices.length} เพลง)</span>
                    </button>
                    <div className="h-px bg-white/5 my-0.5" />
                  </>
                )}

                <button
                  type="button"
                  onClick={() => {
                    if (contextMenu.track) {
                      playTrack(contextMenu.track, contextMenu.playlistContext || [contextMenu.track], false);
                    }
                    closeContextMenu();
                  }}
                  className="w-full px-2.5 py-1.5 rounded-lg hover:bg-emerald-500/20 text-zinc-200 hover:text-emerald-300 flex items-center gap-2.5 transition text-left font-medium"
                >
                  <span className="text-emerald-400">▶</span>
                  <span>เล่นเพลงนี้ทันที (Play Now)</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (contextMenu.track) handleAddToQueue(contextMenu.track, true);
                    closeContextMenu();
                  }}
                  className="w-full px-2.5 py-1.5 rounded-lg hover:bg-white/10 text-zinc-200 hover:text-white flex items-center gap-2.5 transition text-left font-medium"
                >
                  <span className="text-sky-400">＋</span>
                  <span>เล่นเป็นเพลงถัดไป (Play Next)</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (contextMenu.track) handleAddToQueue(contextMenu.track, false);
                    closeContextMenu();
                  }}
                  className="w-full px-2.5 py-1.5 rounded-lg hover:bg-white/10 text-zinc-200 hover:text-white flex items-center gap-2.5 transition text-left font-medium"
                >
                  <span className="text-amber-400">📑</span>
                  <span>เพิ่มเข้าคิวเล่นต่อ (Add to Queue)</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (contextMenu.track) {
                      setMixtapeTracks((prev) => [...prev, contextMenu.track!]);
                      showToast(`Added "${contextMenu.track.title}" to Smart Mixtape Studio`, 'success');
                    }
                    closeContextMenu();
                  }}
                  className="w-full px-2.5 py-1.5 rounded-lg hover:bg-indigo-500/20 text-zinc-200 hover:text-indigo-300 flex items-center gap-2.5 transition text-left font-medium"
                >
                  <span className="text-indigo-400">🎧</span>
                  <span>ส่งไปยัง Smart Mixtape Studio</span>
                </button>
              </div>

              <div className="h-px bg-white/5 my-1" />

              {/* Tag & File Actions */}
              <div className="space-y-0.5">
                <button
                  type="button"
                  onClick={() => {
                    if (contextMenu.track) {
                      setEditingTrack({
                        ...contextMenu.track,
                        index: contextMenu.index ?? 0,
                        source: (contextMenu.source === 'queue' ? 'queue' : contextMenu.source === 'mixtape' ? 'mixtape' : 'library'),
                      });
                    }
                    closeContextMenu();
                  }}
                  className="w-full px-2.5 py-1.5 rounded-lg hover:bg-white/10 text-zinc-200 hover:text-white flex items-center gap-2.5 transition text-left font-medium"
                >
                  <span>✏️</span>
                  <span>แก้ไขข้อมูล / Tags & DJ Cues</span>
                </button>

                {contextMenu.track.camelot && (
                  <button
                    type="button"
                    onClick={() => {
                      if (contextMenu.track?.camelot) {
                        setLibFilterKey(contextMenu.track.camelot);
                        setActiveTab('library');
                        showToast(`🔍 Filtering library by Key ${contextMenu.track.camelot}`, 'info');
                      }
                      closeContextMenu();
                    }}
                    className="w-full px-2.5 py-1.5 rounded-lg hover:bg-white/10 text-zinc-200 hover:text-white flex items-center gap-2.5 transition text-left font-medium"
                  >
                    <span>🔍</span>
                    <span>ค้นหาเพลงคีย์เดียวกัน ({contextMenu.track.camelot})</span>
                  </button>
                )}

                {contextMenu.track.filepath && (
                  <button
                    type="button"
                    onClick={(e) => {
                      if (contextMenu.track) handleOpenTrackFolder(contextMenu.track, e);
                      closeContextMenu();
                    }}
                    className="w-full px-2.5 py-1.5 rounded-lg hover:bg-white/10 text-zinc-200 hover:text-white flex items-center gap-2.5 transition text-left font-medium"
                  >
                    <span>📁</span>
                    <span>เปิดโฟลเดอร์ไฟล์เพลง (Show in Folder)</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    if (contextMenu.track) {
                      const text = `${contextMenu.track.artist ? `${contextMenu.track.artist} - ` : ''}${contextMenu.track.title}`;
                      navigator.clipboard.writeText(text);
                      showToast(`Copied: "${text}"`, 'info');
                    }
                    closeContextMenu();
                  }}
                  className="w-full px-2.5 py-1.5 rounded-lg hover:bg-white/10 text-zinc-200 hover:text-white flex items-center gap-2.5 transition text-left font-medium"
                >
                  <span>📋</span>
                  <span>คัดลอกชื่อเพลง (Copy Info)</span>
                </button>
              </div>

              <div className="h-px bg-white/5 my-1" />

              {/* Remove / Delete Action */}
              <button
                type="button"
                onClick={() => {
                  if (contextMenu.source === 'queue' && contextMenu.index !== undefined) {
                    setTracks((prev) => prev.filter((_, i) => i !== contextMenu.index));
                    showToast('Removed track from queue', 'info');
                  } else if (contextMenu.source === 'mixtape' && contextMenu.index !== undefined) {
                    setMixtapeTracks((prev) => prev.filter((_, i) => i !== contextMenu.index));
                    showToast('Removed track from mixtape', 'info');
                  } else if (contextMenu.source === 'drawer' && contextMenu.index !== undefined) {
                    handleRemoveFromQueue(contextMenu.index);
                  } else if (contextMenu.track?.filepath) {
                    if (confirm(`ลบเพลง "${contextMenu.track.title}" ออกจาก Library หรือไม่?`)) {
                      invokeBackend('batch_delete_tracks', {
                        filepaths: [contextMenu.track.filepath],
                        delete_files: false,
                      }).then(() => {
                        refreshLibrary();
                        showToast('Deleted track from library', 'info');
                      });
                    }
                  }
                  closeContextMenu();
                }}
                className="w-full px-2.5 py-1.5 rounded-lg hover:bg-rose-500/20 text-rose-300 hover:text-rose-200 flex items-center gap-2.5 transition text-left font-medium"
              >
                <span>🗑️</span>
                <span>ลบออกจากรายการ (Remove / Delete)</span>
              </button>
            </>
          ) : (
            /* General Global Context Menu (when clicking background or player) */
            <>
              <div className="px-2.5 py-1 text-[10px] uppercase font-bold text-zinc-500 tracking-wider font-mono border-b border-white/5 mb-1">
                DJ Master Controls
              </div>

              <button
                type="button"
                onClick={() => {
                  togglePlay();
                  closeContextMenu();
                }}
                className="w-full px-2.5 py-1.5 rounded-lg hover:bg-white/10 text-zinc-200 hover:text-white flex items-center justify-between transition text-left font-medium"
              >
                <div className="flex items-center gap-2">
                  <span>{isPlaying ? '⏸' : '▶'}</span>
                  <span>{isPlaying ? 'หยุดชั่วคราว (Pause)' : 'เล่นต่อ (Resume Play)'}</span>
                </div>
                <span className="text-[10px] text-zinc-500 font-mono">Space</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  handlePlayNext();
                  closeContextMenu();
                }}
                className="w-full px-2.5 py-1.5 rounded-lg hover:bg-white/10 text-zinc-200 hover:text-white flex items-center justify-between transition text-left font-medium"
              >
                <div className="flex items-center gap-2">
                  <span>⏭</span>
                  <span>เพลงถัดไป (Next Track)</span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  handlePlayPrev();
                  closeContextMenu();
                }}
                className="w-full px-2.5 py-1.5 rounded-lg hover:bg-white/10 text-zinc-200 hover:text-white flex items-center justify-between transition text-left font-medium"
              >
                <div className="flex items-center gap-2">
                  <span>⏮</span>
                  <span>เพลงก่อนหน้า (Previous)</span>
                </div>
              </button>

              <div className="h-px bg-white/5 my-1" />

              <button
                type="button"
                onClick={() => {
                  const next = !isAutoDjEnabled;
                  setIsAutoDjEnabled(next);
                  showToast(next ? '🤖 Auto-DJ Mix Enabled' : 'Auto-DJ Disabled', 'info');
                  closeContextMenu();
                }}
                className="w-full px-2.5 py-1.5 rounded-lg hover:bg-white/10 text-zinc-200 hover:text-white flex items-center justify-between transition text-left font-medium"
              >
                <div className="flex items-center gap-2">
                  <span>🤖</span>
                  <span>Auto-DJ Continuous Mix</span>
                </div>
                <span className={`text-[10px] font-bold ${isAutoDjEnabled ? 'text-emerald-400' : 'text-zinc-500'}`}>
                  {isAutoDjEnabled ? 'ON' : 'OFF'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsShuffle(!isShuffle);
                  showToast(!isShuffle ? 'Shuffle On' : 'Shuffle Off', 'info');
                  closeContextMenu();
                }}
                className="w-full px-2.5 py-1.5 rounded-lg hover:bg-white/10 text-zinc-200 hover:text-white flex items-center justify-between transition text-left font-medium"
              >
                <div className="flex items-center gap-2">
                  <span>🔀</span>
                  <span>สุ่มเพลง (Shuffle)</span>
                </div>
                <span className={`text-[10px] font-bold ${isShuffle ? 'text-emerald-400' : 'text-zinc-500'}`}>
                  {isShuffle ? 'ON' : 'OFF'}
                </span>
              </button>

              <div className="h-px bg-white/5 my-1" />

              {/* Volume Quick Presets */}
              <div className="px-2.5 py-1 text-[10px] uppercase font-bold text-zinc-500 tracking-wider font-mono">
                ระดับเสียง (Volume: {Math.round(volume * 100)}%)
              </div>

              <div className="grid grid-cols-3 gap-1 px-1 my-1">
                <button
                  type="button"
                  onClick={() => {
                    toggleMute();
                    closeContextMenu();
                  }}
                  className="px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-zinc-300 text-[11px] font-semibold text-center transition"
                >
                  🔇 Mute
                </button>
                <button
                  type="button"
                  onClick={() => {
                    applyVolume(0.5);
                    closeContextMenu();
                  }}
                  className="px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-zinc-300 text-[11px] font-semibold text-center transition"
                >
                  🔉 50%
                </button>
                <button
                  type="button"
                  onClick={() => {
                    applyVolume(1.0);
                    closeContextMenu();
                  }}
                  className="px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-zinc-300 text-[11px] font-semibold text-center transition"
                >
                  🔊 100%
                </button>
              </div>

              <div className="h-px bg-white/5 my-1" />

              <button
                type="button"
                onClick={() => {
                  setShowExpandedPlayer(!showExpandedPlayer);
                  closeContextMenu();
                }}
                className="w-full px-2.5 py-1.5 rounded-lg hover:bg-indigo-500/20 text-zinc-200 hover:text-indigo-300 flex items-center justify-between transition text-left font-medium"
              >
                <div className="flex items-center gap-2">
                  <span>⛶</span>
                  <span>{showExpandedPlayer ? 'ย่อหน้าจอเล่นเพลง' : 'ขยายหน้าจอเล่นเพลงเต็มจอ'}</span>
                </div>
              </button>
            </>
          )}
        </div>
      )}

      {/* Smart Music Search Modal (Local Folder + Online Multi-Source with Deduplication) */}
      <SmartSearchModal
        isOpen={showSmartSearchModal}
        onClose={() => setShowSmartSearchModal(false)}
        initialQuery={smartSearchInitialQuery}
        invokeBackend={invokeBackend}
        onAddTracksToQueue={(newTracks) => {
          setTracks((prev) => [...prev, ...newTracks]);
          setActiveTab('queue');
        }}
        onPlayTrack={(track) => {
          playTrack(track, [track]);
        }}
        onOpenFolder={(path) => {
          invokeBackend('open_folder', { path });
        }}
        showToast={showToast}
      />

    </div>
  );
}
