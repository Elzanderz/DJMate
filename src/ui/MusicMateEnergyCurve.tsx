import React from 'react';
import { CamelotBadge, getCamelotColor } from '../App';

export interface EnergyTrackItem {
  id?: string;
  title: string;
  artist?: string;
  bpm?: number;
  camelot?: string;
  stars?: number;
  duration_ms?: number;
  color?: string;
}

interface MusicMateEnergyCurveProps {
  tracks: EnergyTrackItem[];
  selectedTrackIndex?: number;
  onSelectTrack?: (index: number) => void;
}

export const MusicMateEnergyCurve: React.FC<MusicMateEnergyCurveProps> = ({
  tracks,
  selectedTrackIndex,
  onSelectTrack,
}) => {
  if (!tracks || tracks.length < 2) return null;

  // Calculate Statistics
  const totalDurationSec = tracks.reduce((acc, t) => acc + (t.duration_ms ? t.duration_ms / 1000 : 200), 0);
  const totalMins = Math.floor(totalDurationSec / 60);
  const totalSecs = Math.floor(totalDurationSec % 60);

  const validBpms = tracks.map((t) => t.bpm || 0).filter((b) => b > 0);
  const avgBpm = validBpms.length > 0 ? (validBpms.reduce((a, b) => a + b, 0) / validBpms.length).toFixed(1) : '126';

  let peakTrackIndex = 0;
  let maxStars = 0;
  tracks.forEach((t, i) => {
    const s = t.stars || 3;
    if (s > maxStars) {
      maxStars = s;
      peakTrackIndex = i;
    }
  });

  // Calculate Harmonic Flow Score (%)
  let harmonicTransitions = 0;
  for (let i = 0; i < tracks.length - 1; i++) {
    const k1 = tracks[i].camelot || '8A';
    const k2 = tracks[i + 1].camelot || '8A';
    const num1 = parseInt(k1.slice(0, -1)) || 8;
    const let1 = k1.slice(-1) || 'A';
    const num2 = parseInt(k2.slice(0, -1)) || 8;
    const let2 = k2.slice(-1) || 'A';
    const diffNum = Math.abs(num1 - num2);
    const diffWheel = Math.min(diffNum, 12 - diffNum);
    if (k1 === k2 || (let1 === let2 && diffWheel <= 1) || (let1 !== let2 && diffWheel === 0)) {
      harmonicTransitions++;
    }
  }
  const harmonicScore = Math.round((harmonicTransitions / Math.max(tracks.length - 1, 1)) * 100);

  // SVG Chart Geometry
  const width = 800;
  const height = 140;
  const paddingX = 40;
  const paddingY = 24;
  const chartW = width - paddingX * 2;
  const chartH = height - paddingY * 2;

  const points = tracks.map((t, idx) => {
    const x = paddingX + (idx / (tracks.length - 1)) * chartW;
    const stars = Math.max(1, Math.min(5, t.stars || 3));
    // stars 1 -> bottom (height - paddingY), stars 5 -> top (paddingY)
    const y = paddingY + chartH - ((stars - 1) / 4) * chartH;
    return { x, y, track: t, index: idx };
  });

  // Construct SVG Bezier Smooth Curve path
  let pathD = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const mx = (p0.x + p1.x) / 2;
    pathD += ` C ${mx} ${p0.y}, ${mx} ${p1.y}, ${p1.x} ${p1.y}`;
  }

  // Construct Closed Area for Gradient Fill
  const areaD = `${pathD} L ${points[points.length - 1].x} ${height} L ${points[0].x} ${height} Z`;

  return (
    <div className="w-full rounded-2xl bg-black border border-white/[0.08] p-4 shadow-[0_8px_30px_rgba(0,0,0,0.5)] mb-4 backdrop-blur-xl">
      
      {/* Header Stat Pills */}
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-white flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
            <span>Set Energy Flow & Camelot Progression</span>
          </span>
          <span className="text-[11px] font-mono text-zinc-400 bg-white/5 px-2 py-0.5 rounded-full border border-white/5">
            {tracks.length} Tracks
          </span>
        </div>

        <div className="flex items-center gap-2 text-xs flex-wrap">
          {/* Duration Badge */}
          <div className="flex items-center gap-1 bg-white/[0.04] px-2.5 py-1 rounded-full border border-white/10 font-mono text-zinc-300">
            <span>⏱️</span>
            <span className="text-white font-bold">{totalMins}m {totalSecs}s</span>
          </div>

          {/* Average BPM */}
          <div className="flex items-center gap-1 bg-white/[0.04] px-2.5 py-1 rounded-full border border-white/10 font-mono text-zinc-300">
            <span>🎛️</span>
            <span className="text-white font-bold">{avgBpm}</span>
            <span className="text-[10px] text-zinc-500">BPM</span>
          </div>

          {/* Harmonic Compatibility */}
          <div className="flex items-center gap-1 bg-white/[0.04] px-2.5 py-1 rounded-full border border-white/10 font-mono text-white">
            <span>🎯</span>
            <span className="font-bold">{harmonicScore}%</span>
            <span className="text-[10px] text-zinc-400">Harmonic Match</span>
          </div>

          {/* Peak Track */}
          <div className="flex items-center gap-1 bg-white/[0.04] px-2.5 py-1 rounded-full border border-white/10 font-mono text-zinc-300">
            <span>⚡ Peak:</span>
            <span className="text-white font-bold">#{peakTrackIndex + 1}</span>
          </div>
        </div>
      </div>

      {/* SVG Interactive Chart */}
      <div className="relative w-full h-32 overflow-hidden select-none">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible">
          <defs>
            <linearGradient id="energyGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.15" />
              <stop offset="60%" stopColor="#ffffff" stopOpacity="0.04" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="0.0" />
            </linearGradient>
            <linearGradient id="strokeGradient" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="50%" stopColor="#e4e4e7" />
              <stop offset="100%" stopColor="#a1a1aa" />
            </linearGradient>
          </defs>

          {/* Horizontal Level Reference Lines */}
          {[1, 2, 3, 4, 5].map((lvl) => {
            const y = paddingY + chartH - ((lvl - 1) / 4) * chartH;
            return (
              <g key={lvl}>
                <line
                  x1={paddingX}
                  y1={y}
                  x2={width - paddingX}
                  y2={y}
                  stroke="rgba(255,255,255,0.06)"
                  strokeDasharray="4 4"
                />
                <text
                  x={paddingX - 8}
                  y={y + 3}
                  textAnchor="end"
                  fill="rgba(255,255,255,0.25)"
                  fontSize="9"
                  fontFamily="monospace"
                >
                  {lvl}★
                </text>
              </g>
            );
          })}

          {/* Filled Area below curve */}
          <path d={areaD} fill="url(#energyGradient)" />

          {/* Main Curve Stroke */}
          <path
            d={pathD}
            fill="none"
            stroke="url(#strokeGradient)"
            strokeWidth="3"
            strokeLinecap="round"
          />

          {/* Track Nodes */}
          {points.map((p) => {
            const isSelected = selectedTrackIndex === p.index;
            const colorHex = p.track.color || getCamelotColor(p.track.camelot).hex || '#818cf8';

            return (
              <g
                key={p.index}
                className="cursor-pointer transition-transform duration-150 hover:scale-125"
                onClick={() => onSelectTrack && onSelectTrack(p.index)}
              >
                {/* Outer halo if selected */}
                {isSelected && (
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r="9"
                    fill="none"
                    stroke="#ffffff"
                    strokeWidth="2"
                    className="animate-ping"
                  />
                )}

                {/* Outer Dot */}
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={isSelected ? 6 : 4.5}
                  fill={colorHex}
                  stroke="#18181f"
                  strokeWidth="2"
                />

                {/* Track Index Badge */}
                <text
                  x={p.x}
                  y={p.y - 8}
                  textAnchor="middle"
                  fill={isSelected ? '#ffffff' : 'rgba(255,255,255,0.6)'}
                  fontSize="9"
                  fontWeight="bold"
                  fontFamily="monospace"
                >
                  {p.index + 1}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

    </div>
  );
};
