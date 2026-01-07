
import React from 'react';
import { OrbStatus } from '../types';
import { ORB_SIZE } from '../constants';
import Visualizer from './Visualizer';

interface OrbProps {
  status: OrbStatus;
  analyser: AnalyserNode | null;
  onMouseDown: (e: React.MouseEvent | React.TouchEvent) => void;
  onSettingsClick: (e: React.MouseEvent) => void;
  isDragging: boolean;
  isPressed: boolean;
  isMonitoring: boolean;
}

const Orb: React.FC<OrbProps> = ({
  status,
  analyser,
  onMouseDown,
  onSettingsClick,
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
    if (isBuffering) return 'from-amber-400 to-orange-500 shadow-amber-500/50';
    if (isMonitoring || isSpeaking || isTranslating) {
      return 'from-cyan-500 to-blue-600 shadow-cyan-600/50';
    }
    return 'from-sky-300 to-sky-500 shadow-sky-400/40';
  };

  return (
    <div
      className="relative flex items-center justify-center select-none group"
      style={{ width: ORB_SIZE, height: ORB_SIZE }}
    >
      {/* Settings Gear Toggle */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onSettingsClick(e);
        }}
        className="absolute -top-1 -right-1 z-50 p-1.5 rounded-full bg-slate-900 border border-white/20 text-cyan-400 shadow-lg hover:scale-110 active:scale-95 transition-all pointer-events-auto"
      >
        <svg className="w-4 h-4 animate-[spin_4s_linear_infinite]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </button>

      {/* High-Contrast Dual Outer Ring */}
      <div className={`
        absolute inset-[-3px] rounded-full border border-white/40 ring-4 ring-black/10
        transition-all duration-500
        ${isMonitoring ? 'opacity-100 scale-100' : 'opacity-0 scale-90'}
      `} />

      {/* Buffering Indicator Outer Ring */}
      {isBuffering && (
        <div className="absolute inset-[-8px] rounded-full border-4 border-amber-400/20 border-t-amber-400 animate-spin" />
      )}

      {/* Main ORB Body */}
      <div 
        onMouseDown={onMouseDown}
        onTouchStart={onMouseDown}
        className={`
        relative w-full h-full rounded-full overflow-hidden bg-gradient-to-br ${getStatusColor()}
        flex flex-col items-center justify-center p-2 transition-all duration-300
        border-2 border-black/5 backdrop-blur-xl cursor-move
        shadow-[0_15px_45px_rgba(0,0,0,0.5)]
        ${isTranslating || isBuffering ? 'animate-pulse' : ''}
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

        {/* Inner Buffering Glow */}
        {isBuffering && (
          <div className="absolute inset-0 bg-amber-400/20 animate-ping rounded-full" />
        )}

        {/* State Icon */}
        <div className="relative z-10 text-slate-950 drop-shadow-[0_1px_1px_rgba(255,255,255,0.4)] mb-0.5">
          {isBuffering ? (
            <svg className="w-7 h-7 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          ) : isMonitoring ? (
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
        <div className="relative z-10 text-[9px] font-black uppercase tracking-tighter text-slate-950 drop-shadow-[0_1px_1px_rgba(255,255,255,0.3)] text-center leading-none">
          {status !== OrbStatus.IDLE ? status : (isMonitoring ? 'ACTIVE' : 'READY')}
        </div>

        {/* Glass reflection shine */}
        <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-tr from-transparent via-white/30 to-transparent pointer-events-none z-20" />
      </div>
    </div>
  );
};

export default Orb;
