import React from 'react';
import { OrbStatus } from '../types';
import { ORB_SIZE } from '../constants';
import Visualizer from './Visualizer';

interface OrbProps {
  status: OrbStatus;
  analyser: AnalyserNode | null;
  onMouseDown: (e: React.MouseEvent | React.TouchEvent) => void;
  isDragging: boolean;
  isPressed: boolean;
  isMonitoring: boolean;
}

const Orb: React.FC<OrbProps> = ({
  status,
  analyser,
  onMouseDown,
  isDragging,
  isPressed,
  isMonitoring
}) => {
  const isSpeaking = status === OrbStatus.SPEAKING;
  const isTranslating = status === OrbStatus.TRANSLATING;
  const isBuffering = status === OrbStatus.BUFFERING;
  const isError = status === OrbStatus.ERROR;

  const getStatusColor = () => {
    if (isError) return 'from-rose-500 to-red-700 shadow-rose-600/60';
    if (isMonitoring || isSpeaking || isTranslating || isBuffering) {
      return 'from-cyan-400 to-blue-700 shadow-cyan-500/50';
    }
    return 'from-slate-100 to-slate-400 shadow-white/20';
  };

  return (
    <div
      className="relative flex items-center justify-center select-none group"
      style={{ width: ORB_SIZE, height: ORB_SIZE }}
      onMouseDown={onMouseDown}
      onTouchStart={onMouseDown}
    >
      {/* High-Contrast Dual Outer Ring (Visible on dark and light bgs) */}
      <div className={`
        absolute inset-[-2px] rounded-full border border-white/40 ring-4 ring-black/20
        transition-all duration-500
        ${isMonitoring ? 'opacity-100 scale-100' : 'opacity-0 scale-90'}
      `} />

      {/* Outer Buffering Ring */}
      {isBuffering && (
        <div 
          className="absolute inset-[-6px] border-2 border-dashed border-cyan-400/60 rounded-full animate-spin"
          style={{ animationDuration: '3s' }}
        />
      )}

      {/* Main ORB Body */}
      <div className={`
        relative w-full h-full rounded-full overflow-hidden bg-gradient-to-br ${getStatusColor()}
        flex flex-col items-center justify-center p-2 transition-all duration-300
        border-2 border-white/30 backdrop-blur-xl cursor-move
        shadow-[0_10px_40px_rgba(0,0,0,0.6)]
        ${isTranslating ? 'animate-pulse' : ''}
        ${isDragging 
          ? 'scale-115 rotate-2 brightness-110 shadow-[0_40px_80px_rgba(0,0,0,0.8),0_0_20px_rgba(34,211,238,0.4)] ring-4 ring-white/50 z-[100]' 
          : isPressed 
            ? 'scale-95 shadow-inner' 
            : 'hover:scale-110 hover:shadow-[0_20px_50px_rgba(0,0,0,0.7)]'
        }
      `}>
        {/* Visualizer internal layer */}
        <Visualizer
          analyser={analyser}
          isActive={isSpeaking}
          size={ORB_SIZE}
        />

        {/* State Icon */}
        <div className="relative z-10 text-slate-900 drop-shadow-[0_1px_2px_rgba(255,255,255,0.4)] mb-0.5">
          {isMonitoring ? (
            <svg className={`w-7 h-7 ${isSpeaking ? 'animate-none' : 'animate-pulse'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 2v4m0 12v4M2 12h4m12 0h4" />
            </svg>
          ) : (
            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          )}
        </div>

        {/* Action Text */}
        <div className="relative z-10 text-[9px] font-black uppercase tracking-tighter text-slate-900 drop-shadow-[0_1px_1px_rgba(255,255,255,0.3)] text-center leading-none">
          {status !== OrbStatus.IDLE ? status : (isMonitoring ? 'ACTIVE' : 'READY')}
        </div>

        {/* Glass reflection shine - intensified */}
        <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-tr from-transparent via-white/20 to-transparent pointer-events-none z-20" />
      </div>
    </div>
  );
};

export default Orb;