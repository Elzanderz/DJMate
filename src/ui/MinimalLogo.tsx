import React from 'react';
import { motion } from 'framer-motion';
import { Disc3 } from 'lucide-react';

interface MinimalLogoProps {
  isPlaying?: boolean;
  onClick?: () => void;
  className?: string;
}

export const MinimalLogo: React.FC<MinimalLogoProps> = ({
  isPlaying = false,
  onClick,
  className = '',
}) => {
  return (
    <motion.div
      onClick={onClick}
      className={`group flex items-center gap-2.5 select-none cursor-pointer ${className}`}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
    >
      {/* Minimal Animated Vinyl / Deck Icon */}
      <div className="relative flex items-center justify-center w-8 h-8 rounded-xl bg-gradient-to-b from-zinc-800 to-zinc-900 border border-white/10 shadow-lg shadow-black/40 overflow-hidden group-hover:border-emerald-500/40 transition-colors duration-300">
        {/* Subtle Ambient Glow */}
        <div className="absolute inset-0 bg-gradient-to-tr from-emerald-500/15 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />

        {/* Rotating Disc */}
        <motion.div
          animate={isPlaying ? { rotate: 360 } : { rotate: 0 }}
          transition={
            isPlaying
              ? { repeat: Infinity, duration: 3, ease: 'linear' }
              : { duration: 0.6, ease: 'easeOut' }
          }
          className="relative text-emerald-400 flex items-center justify-center"
        >
          <Disc3 size={18} strokeWidth={1.8} className="transition-transform group-hover:scale-105" />
        </motion.div>

        {/* Live Audio Indicator dot / pulse */}
        {isPlaying ? (
          <span className="absolute top-1 right-1 flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
          </span>
        ) : (
          <span className="absolute top-1 right-1 w-1 h-1 rounded-full bg-zinc-600 group-hover:bg-emerald-400 transition-colors duration-200" />
        )}
      </div>

      {/* Brand Typography & Equalizer Motion */}
      <div className="flex flex-col">
        <div className="flex items-center gap-1.5">
          <span className="font-bold text-sm tracking-tight text-white flex items-center font-mono">
            <span>DJ</span>
            <span className="text-emerald-400 font-extrabold ml-0.5">MATE</span>
          </span>

          {/* Minimalist Pro Badge */}
          <span className="text-[9px] font-mono font-semibold tracking-wider px-1.5 py-0.2 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            PRO
          </span>

          {/* Subtle Mini Equalizer Waveform when playing */}
          {isPlaying && (
            <div className="flex items-end gap-0.5 h-3 ml-0.5">
              {[0.4, 0.9, 0.6, 0.8].map((_, i) => (
                <motion.span
                  key={i}
                  className="w-0.5 rounded-full bg-emerald-400"
                  animate={{
                    height: ['30%', '100%', '40%'],
                  }}
                  transition={{
                    repeat: Infinity,
                    duration: 0.6 + i * 0.15,
                    ease: 'easeInOut',
                    delay: i * 0.1,
                  }}
                  style={{ minHeight: '3px' }}
                />
              ))}
            </div>
          )}
        </div>

        <span className="text-[10px] text-zinc-500 font-medium tracking-wide group-hover:text-zinc-400 transition-colors">
          Harmonic DJ Suite
        </span>
      </div>
    </motion.div>
  );
};
