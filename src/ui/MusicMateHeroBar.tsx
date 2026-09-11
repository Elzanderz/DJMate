import React, { useState, useEffect, useRef } from 'react';

export interface MusicMateFilterState {
  genre: string;
  durationMinutes: number;
  energyCurve: 'peak_climb' | 'wave_roller' | 'sunset_lounge' | 'steady_groove' | 'harmonic_flow';
  commercialLevel: 'underground' | 'balanced' | 'commercial_hits';
  referenceTrack: string;
}

interface MusicMateHeroBarProps {
  onGenerate: (prompt: string, filters: MusicMateFilterState) => void;
  isGenerating: boolean;
  initialPrompt?: string;
}

const PLACEHOLDER_PROMPTS = [
  'Create a tech house set with driving basslines and crisp percussion...',
  'Sunset beach afro house with soulful vocal hooks and warm keys...',
  'Peak-time melodic techno festival set with euphoric synth drops...',
  'Thai indie pop & neo-soul cafe afternoon session with mellow guitars...',
  'Late night underground deep house with hypnotic grooves...',
  'High-energy Thai rock & pub party anthems with crowd singalongs...',
  '2000s throwback hip-hop & R&B party set with punchy drums...',
  'Uplifting dance-pop festival mix with infectious melodies...'
];

const GENRE_OPTIONS = [
  { id: 'Tech House', label: '🎧 Tech House' },
  { id: 'Melodic Techno', label: '🌌 Melodic Techno' },
  { id: 'Afro House', label: '🌴 Afro House / Amapiano' },
  { id: 'Deep House', label: '🌊 Deep House' },
  { id: 'Drum & Bass', label: '🥁 Drum & Bass' },
  { id: 'EDM / Festival', label: '⚡ EDM / Festival' },
  { id: 'Hip-Hop / Rap', label: '🎤 Hip-Hop / Rap' },
  { id: 'Thai Pop & Indie', label: '🇹🇭 ไทยป๊อป & อินดี้' },
  { id: 'Thai Rock & Pub', label: '🇹🇭 ไทยร็อค & ผับ' },
  { id: '3Cha / Party', label: '🎉 3ช่า / สายตื๊ด' },
  { id: 'Pop / Dance-Pop', label: '✨ Pop / Hits' },
  { id: 'All Genres', label: '🌐 All Genres' },
];

const DURATION_OPTIONS = [
  { mins: 30, label: '30 นาที (~9-10 เพลง)' },
  { mins: 45, label: '45 นาที (~14 เพลง)' },
  { mins: 60, label: '60 นาที 1 ชม. (~18-20 เพลง)' },
  { mins: 90, label: '90 นาที (~27 เพลง)' },
  { mins: 120, label: '120 นาที 2 ชม. (~36 เพลง)' },
];

const ENERGY_CURVE_OPTIONS = [
  { id: 'peak_climb', label: '🚀 Peak Climb (1★➔5★)', desc: 'ค่อยๆ ไต่ระดับจากวอร์มอัปสู่จุดพีคสุดมันส์' },
  { id: 'wave_roller', label: '🌊 Wave Roller', desc: 'คลื่นพลังงานขึ้น-ลง มีจังหวะพักและดันพีคเป็นระลอก' },
  { id: 'sunset_lounge', label: '🌅 Sunset Lounge', desc: 'ฟังสบาย ผ่อนคลาย พลังงานนุ่มนวลคงที่ 1-3★' },
  { id: 'steady_groove', label: '🎛️ Steady Club Groove', desc: 'จังหวะเต้นสม่ำเสมอ คุมแดนซ์ฟลอร์ระดับ 3-4★ ตลอดเซ็ต' },
  { id: 'harmonic_flow', label: '🎡 Pure Harmonic Flow', desc: 'เน้นความกลมกลืนของ Camelot Key สูงสุด' },
];

const COMMERCIAL_OPTIONS = [
  { id: 'balanced', label: '⚖️ Balanced (สมดุล)', desc: 'ผสมผสานทั้งเพลงฮิตและแทร็กคุณภาพ' },
  { id: 'underground', label: '💎 Underground Club', desc: 'แทร็กคลับดีพๆ ซาวด์เฉพาะตัว ไม่ตลาดจ๋า' },
  { id: 'commercial_hits', label: '📻 Mainstream Hits', desc: 'เพลงฮิตติดหู ร้องตามได้ คนฟังคุ้นเคย' },
];

export const MusicMateHeroBar: React.FC<MusicMateHeroBarProps> = ({
  onGenerate,
  isGenerating,
  initialPrompt = '',
}) => {
  const [prompt, setPrompt] = useState(initialPrompt);
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [displayedPlaceholder, setDisplayedPlaceholder] = useState('');

  // Filter States
  const [filters, setFilters] = useState<MusicMateFilterState>({
    genre: 'Tech House',
    durationMinutes: 60,
    energyCurve: 'peak_climb',
    commercialLevel: 'balanced',
    referenceTrack: '',
  });

  // Active Dropdown Popovers
  const [openDropdown, setOpenDropdown] = useState<'genre' | 'duration' | 'curve' | 'commercial' | 'reference' | null>(null);
  const [referenceInput, setReferenceInput] = useState('');

  const containerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Close popovers on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpenDropdown(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Animated Placeholder typewriter effect
  useEffect(() => {
    if (prompt) return; // don't animate if user is typing

    let charIdx = 0;
    const targetText = PLACEHOLDER_PROMPTS[placeholderIndex];
    let isDeleting = false;
    let timer = null;

    const tick = () => {
      if (!isDeleting) {
        setDisplayedPlaceholder(targetText.slice(0, charIdx + 1));
        charIdx++;
        if (charIdx === targetText.length) {
          isDeleting = true;
          timer = setTimeout(tick, 2500);
          return;
        }
      } else {
        setDisplayedPlaceholder(targetText.slice(0, charIdx - 1));
        charIdx--;
        if (charIdx === 0) {
          isDeleting = false;
          setPlaceholderIndex((prev) => (prev + 1) % PLACEHOLDER_PROMPTS.length);
          timer = setTimeout(tick, 300);
          return;
        }
      }
      timer = setTimeout(tick, isDeleting ? 25 : 55);
    };

    timer = setTimeout(tick, 400);
    return () => clearTimeout(timer);
  }, [placeholderIndex, prompt]);

  // Handle Submit
  const handleGenerate = () => {
    const finalPrompt = prompt.trim() || displayedPlaceholder || 'tech house set with driving basslines';
    onGenerate(finalPrompt, filters);
  };

  // AI Prompt Enhancer helper
  const handleEnhancePrompt = () => {
    const current = prompt.trim();
    if (!current) {
      setPrompt(`Create a dynamic ${filters.genre} set (~${filters.durationMinutes} mins) with rolling low-end basslines, punchy drums, and smooth harmonic key shifts suitable for a club dancefloor`);
      return;
    }
    setPrompt(`${current}, with energetic builds, punchy groove, pristine sound design, and Camelot-matched transitions for peak dancefloor response`);
  };

  const currentDurationObj = DURATION_OPTIONS.find((d) => d.mins === filters.durationMinutes) || DURATION_OPTIONS[2];
  const currentCurveObj = ENERGY_CURVE_OPTIONS.find((c) => c.id === filters.energyCurve) || ENERGY_CURVE_OPTIONS[0];
  const currentCommercialObj = COMMERCIAL_OPTIONS.find((c) => c.id === filters.commercialLevel) || COMMERCIAL_OPTIONS[0];

  return (
    <div ref={containerRef} className="relative w-full max-w-4xl mx-auto flex flex-col items-center">
      {/* Background Ambient Glow (Exact MusicMate White Aura) */}
      <div
        aria-hidden="true"
        className="absolute -inset-8 -z-10 pointer-events-none rounded-[40px] blur-3xl"
        style={{
          background: 'radial-gradient(70% 90% at 50% 50%, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.07) 45%, transparent 75%)'
        }}
      />

      {/* Main Glassmorphic Container */}
      <div className="w-full relative z-10 backdrop-blur-2xl rounded-[28px] border border-white/[0.08] shadow-[0_8px_32px_rgba(0,0,0,0.5),0_0_0_1px_rgba(255,255,255,0.05),0_0_80px_-10px_rgba(255,255,255,0.30)] bg-gradient-to-b from-white/[0.06] to-white/[0.03]">
        
        {/* Top Prompt Textarea & Action Row */}
        <div className="flex items-center gap-3 px-4 sm:px-5 pt-3.5 pb-2.5">
          {/* Textarea Input Area with Typewriter Placeholder */}
          <div className="relative flex-1 min-w-0 self-center">
            <textarea
              ref={textareaRef}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleGenerate();
                }
              }}
              rows={1}
              placeholder=""
              className="w-full border-0 outline-none focus:outline-none bg-transparent text-white text-base sm:text-[17px] resize-none leading-6 placeholder:text-transparent relative z-10 font-normal py-1"
              style={{ minHeight: '28px', maxHeight: '120px' }}
            />

            {/* Custom Typewriter Placeholder */}
            {!prompt && (
              <div className="absolute left-0 top-1 pointer-events-none text-white/40 text-base sm:text-[17px] select-none z-0 pr-2 flex items-center">
                <span>{displayedPlaceholder}</span>
                <span className="inline-block w-1 h-4 ml-0.5 bg-white/60 animate-pulse" />
              </div>
            )}
          </div>

          {/* AI Enhance & Send Action Buttons */}
          <div className="flex items-center gap-1.5 shrink-0 self-center">
            {/* AI Enhance Button */}
            <button
              type="button"
              onClick={handleEnhancePrompt}
              className="p-2 rounded-full text-white/60 hover:text-white hover:bg-white/10 transition group relative flex-shrink-0 active:scale-95"
              title="Enhance prompt with AI"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-wand-sparkles text-white/75 group-hover:text-white">
                <path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72"></path>
                <path d="m14 7 3 3"></path>
                <path d="M5 6v4"></path>
                <path d="M19 14v4"></path>
                <path d="M10 2v2"></path>
                <path d="M7 8H3"></path>
                <path d="M21 16h-4"></path>
                <path d="M11 3H9"></path>
              </svg>
            </button>

            {/* MusicMate Circular Pure White Send Button */}
            <button
              type="button"
              disabled={isGenerating}
              onClick={handleGenerate}
              className="flex items-center justify-center bg-white hover:bg-white text-black h-9 w-9 rounded-full font-medium disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0 transition-all hover:scale-[1.05] active:scale-95 shadow-md shadow-white/10"
              title="Generate Set"
            >
              {isGenerating ? (
                <span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-send -ml-0.5">
                  <path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"></path>
                  <path d="m21.854 2.147-10.94 10.939"></path>
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Divider */}
        <div className="h-px w-full bg-white/[0.08]" />

        {/* Bottom Quick Chips / Filter Bar (MusicMate Style) */}
        <div className="px-4 py-3 flex items-center gap-2 flex-wrap text-xs">
          
          {/* Chip 1: Genre Filter */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setOpenDropdown(openDropdown === 'genre' ? null : 'genre')}
              className={`flex items-center gap-1.5 px-3 h-8 rounded-full font-medium transition border ${
                openDropdown === 'genre'
                  ? 'bg-indigo-600/30 text-white border-indigo-400/50'
                  : 'bg-white/5 text-white/80 border-white/10 hover:bg-white/10 hover:border-white/20'
              }`}
            >
              <span>🎵</span>
              <span className="font-semibold">{filters.genre}</span>
              <svg className="w-3 h-3 opacity-60 ml-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {openDropdown === 'genre' && (
              <div className="absolute left-0 bottom-full mb-2 w-56 rounded-2xl bg-[#18181f]/95 backdrop-blur-xl border border-white/15 shadow-2xl p-1.5 z-50 animate-in fade-in zoom-in-95 duration-150">
                <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 px-3 py-1.5">Select Genre</div>
                <div className="max-h-60 overflow-y-auto space-y-0.5">
                  {GENRE_OPTIONS.map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => {
                        setFilters((prev) => ({ ...prev, genre: g.id }));
                        setOpenDropdown(null);
                      }}
                      className={`w-full text-left px-3 py-1.5 rounded-xl text-xs flex items-center justify-between transition ${
                        filters.genre === g.id ? 'bg-indigo-600 text-white font-bold' : 'text-zinc-300 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      <span>{g.label}</span>
                      {filters.genre === g.id && <span>✓</span>}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Chip 2: Duration / Length */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setOpenDropdown(openDropdown === 'duration' ? null : 'duration')}
              className={`flex items-center gap-1.5 px-3 h-8 rounded-full font-medium transition border ${
                openDropdown === 'duration'
                  ? 'bg-indigo-600/30 text-white border-indigo-400/50'
                  : 'bg-white/5 text-white/80 border-white/10 hover:bg-white/10 hover:border-white/20'
              }`}
            >
              <span>⏱️</span>
              <span className="font-semibold">{filters.durationMinutes} นาที</span>
              <svg className="w-3 h-3 opacity-60 ml-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {openDropdown === 'duration' && (
              <div className="absolute left-0 bottom-full mb-2 w-64 rounded-2xl bg-[#18181f]/95 backdrop-blur-xl border border-white/15 shadow-2xl p-1.5 z-50">
                <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 px-3 py-1.5">Set Duration (ระยะเวลาเซ็ต)</div>
                <div className="space-y-0.5">
                  {DURATION_OPTIONS.map((d) => (
                    <button
                      key={d.mins}
                      type="button"
                      onClick={() => {
                        setFilters((prev) => ({ ...prev, durationMinutes: d.mins }));
                        setOpenDropdown(null);
                      }}
                      className={`w-full text-left px-3 py-2 rounded-xl text-xs flex items-center justify-between transition ${
                        filters.durationMinutes === d.mins ? 'bg-indigo-600 text-white font-bold' : 'text-zinc-300 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      <span>{d.label}</span>
                      {filters.durationMinutes === d.mins && <span>✓</span>}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Chip 3: Energy Flow Curve */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setOpenDropdown(openDropdown === 'curve' ? null : 'curve')}
              className={`flex items-center gap-1.5 px-3 h-8 rounded-full font-medium transition border ${
                openDropdown === 'curve'
                  ? 'bg-indigo-600/30 text-white border-indigo-400/50'
                  : 'bg-white/5 text-white/80 border-white/10 hover:bg-white/10 hover:border-white/20'
              }`}
            >
              <span>⚡</span>
              <span className="font-semibold">{currentCurveObj.label.split(' ')[1] || 'Energy Flow'}</span>
              <svg className="w-3 h-3 opacity-60 ml-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {openDropdown === 'curve' && (
              <div className="absolute left-0 bottom-full mb-2 w-72 rounded-2xl bg-[#18181f]/95 backdrop-blur-xl border border-white/15 shadow-2xl p-2 z-50">
                <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 px-2 py-1">Energy Progression Curve</div>
                <div className="space-y-1">
                  {ENERGY_CURVE_OPTIONS.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setFilters((prev) => ({ ...prev, energyCurve: c.id as any }));
                        setOpenDropdown(null);
                      }}
                      className={`w-full text-left p-2.5 rounded-xl transition ${
                        filters.energyCurve === c.id ? 'bg-indigo-600/40 border border-indigo-400/50 text-white' : 'text-zinc-300 hover:bg-white/10'
                      }`}
                    >
                      <div className="text-xs font-bold text-white flex items-center justify-between">
                        <span>{c.label}</span>
                        {filters.energyCurve === c.id && <span className="text-indigo-400">✓</span>}
                      </div>
                      <div className="text-[11px] text-zinc-400 mt-0.5">{c.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Chip 4: Commercial Level */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setOpenDropdown(openDropdown === 'commercial' ? null : 'commercial')}
              className={`flex items-center gap-1.5 px-3 h-8 rounded-full font-medium transition border ${
                openDropdown === 'commercial'
                  ? 'bg-indigo-600/30 text-white border-indigo-400/50'
                  : 'bg-white/5 text-white/80 border-white/10 hover:bg-white/10 hover:border-white/20'
              }`}
            >
              <span>🎚️</span>
              <span className="font-semibold">{currentCommercialObj.label.split(' ')[1] || 'Commercial'}</span>
              <svg className="w-3 h-3 opacity-60 ml-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {openDropdown === 'commercial' && (
              <div className="absolute left-0 bottom-full mb-2 w-64 rounded-2xl bg-[#18181f]/95 backdrop-blur-xl border border-white/15 shadow-2xl p-2 z-50">
                <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 px-2 py-1">Vibe & Audience Level</div>
                <div className="space-y-1">
                  {COMMERCIAL_OPTIONS.map((co) => (
                    <button
                      key={co.id}
                      type="button"
                      onClick={() => {
                        setFilters((prev) => ({ ...prev, commercialLevel: co.id as any }));
                        setOpenDropdown(null);
                      }}
                      className={`w-full text-left p-2.5 rounded-xl transition ${
                        filters.commercialLevel === co.id ? 'bg-indigo-600/40 border border-indigo-400/50 text-white' : 'text-zinc-300 hover:bg-white/10'
                      }`}
                    >
                      <div className="text-xs font-bold text-white flex items-center justify-between">
                        <span>{co.label}</span>
                        {filters.commercialLevel === co.id && <span className="text-indigo-400">✓</span>}
                      </div>
                      <div className="text-[11px] text-zinc-400 mt-0.5">{co.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Chip 5: Reference Track */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setOpenDropdown(openDropdown === 'reference' ? null : 'reference');
                if (!referenceInput && filters.referenceTrack) setReferenceInput(filters.referenceTrack);
              }}
              className={`flex items-center gap-1.5 px-3 h-8 rounded-full font-medium transition border ${
                filters.referenceTrack
                  ? 'bg-purple-600/30 text-purple-200 border-purple-400/50'
                  : 'bg-white/5 text-white/80 border-white/10 hover:bg-white/10 hover:border-white/20'
              }`}
            >
              <span>📎</span>
              <span className="font-semibold">
                {filters.referenceTrack ? `Ref: ${filters.referenceTrack.slice(0, 16)}...` : 'Reference Track'}
              </span>
              {filters.referenceTrack && (
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    setFilters((prev) => ({ ...prev, referenceTrack: '' }));
                    setReferenceInput('');
                  }}
                  className="hover:text-red-400 ml-1 text-xs"
                >
                  ✕
                </span>
              )}
            </button>

            {openDropdown === 'reference' && (
              <div className="absolute left-0 bottom-full mb-2 w-80 rounded-2xl bg-[#18181f]/95 backdrop-blur-xl border border-white/15 shadow-2xl p-3 z-50">
                <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1.5">Add Reference Track (เพลงอ้างอิง)</div>
                <div className="text-xs text-zinc-400 mb-2">ใส่ชื่อเพลงหรือศิลปินเพื่อให้ AI ใช้เป็นแกนหลักในการต่อเซ็ต เช่น <span className="text-indigo-300">Fisher - Losing It</span> หรือ <span className="text-indigo-300">Dept - 17</span></div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={referenceInput}
                    onChange={(e) => setReferenceInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        setFilters((prev) => ({ ...prev, referenceTrack: referenceInput.trim() }));
                        setOpenDropdown(null);
                      }
                    }}
                    placeholder="e.g. CamelPhat - Cola"
                    className="flex-1 bg-black/40 border border-white/15 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-400"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setFilters((prev) => ({ ...prev, referenceTrack: referenceInput.trim() }));
                      setOpenDropdown(null);
                    }}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-xs font-bold text-white transition"
                  >
                    Set
                  </button>
                </div>
              </div>
            )}
          </div>

        </div>

      </div>

      {/* Helper Prompt Pills below bar */}
      <div className="w-full flex items-center justify-center gap-2 mt-3 flex-wrap text-xs text-zinc-400">
        <span className="text-[11px] opacity-60">💡 ลองเลือกแบบเร็ว:</span>
        <button
          type="button"
          onClick={() => {
            setPrompt('Tech House club set with driving sub-bass and crisp hats');
            setFilters((prev) => ({ ...prev, genre: 'Tech House', durationMinutes: 60, energyCurve: 'peak_climb' }));
          }}
          className="px-2.5 py-1 rounded-full bg-white/5 hover:bg-white/10 text-zinc-300 transition text-[11px] border border-white/5"
        >
          🚀 Tech House Club (1 ชม.)
        </button>
        <button
          type="button"
          onClick={() => {
            setPrompt('เพลงไทยอินดี้และนีโอโซล คาเฟ่สบายๆ ยามบ่าย');
            setFilters((prev) => ({ ...prev, genre: 'Thai Pop & Indie', durationMinutes: 45, energyCurve: 'sunset_lounge' }));
          }}
          className="px-2.5 py-1 rounded-full bg-white/5 hover:bg-white/10 text-zinc-300 transition text-[11px] border border-white/5"
        >
          ☕ ชิลคาเฟ่ยามบ่าย (45 นาที)
        </button>
        <button
          type="button"
          onClick={() => {
            setPrompt('High-energy Thai rock pub night with anthems');
            setFilters((prev) => ({ ...prev, genre: 'Thai Rock & Pub', durationMinutes: 60, energyCurve: 'peak_climb' }));
          }}
          className="px-2.5 py-1 rounded-full bg-white/5 hover:bg-white/10 text-zinc-300 transition text-[11px] border border-white/5"
        >
          🎸 ร็อคร้านเหล้ามันส์ๆ
        </button>
        <button
          type="button"
          onClick={() => {
            setPrompt('Sunset Afro house & melodic groove with vocal melodies');
            setFilters((prev) => ({ ...prev, genre: 'Afro House', durationMinutes: 60, energyCurve: 'steady_groove' }));
          }}
          className="px-2.5 py-1 rounded-full bg-white/5 hover:bg-white/10 text-zinc-300 transition text-[11px] border border-white/5"
        >
          🌅 Sunset Afro House
        </button>
      </div>

    </div>
  );
};
