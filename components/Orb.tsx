
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
    if (isError) return 'from-rose-400 to-red-600 shadow-rose-500/50';
    
    // Active states (Monitoring or performing tasks)
    // The user requested from-cyan-500 to-blue-600 for the active state
    if (isMonitoring || isSpeaking || isTranslating || isBuffering) {
      return 'from-cyan-500 to-blue-600 shadow-cyan-500/40';
    }
    
    // Idle state: from-sky-300 to-sky-500
    return 'from-sky-300 to-sky-500 shadow-sky-400/20';
  };

  return (
    <div
      className="relative flex items-center justify-center select-none"
      style={{ width: ORB_SIZE, height: ORB_SIZE }}
      onMouseDown={onMouseDown}
      onTouchStart={onMouseDown}
    >
      {/* Outer Buffering Ring */}
      {isBuffering && (
        <div 
          className="absolute inset-[-4px] border-2 border-dashed border-cyan-400/40 rounded-full animate-spin"
          style={{ animationDuration: '3s' }}
        />
      )}

      <div className={`
        relative w-full h-full rounded-full overflow-hidden bg-gradient-to-br ${getStatusColor()}
        flex flex-col items-center justify-center p-2 transition-all duration-300
        border border-white/20 backdrop-blur-md cursor-move
        ${isTranslating ? 'animate-pulse' : ''}
        ${isDragging 
          ? 'scale-115 rotate-2 brightness-110 shadow-[0_30px_70px_-10px_rgba(0,0,0,0.7)] ring-4 ring-white/40 z-[100]' 
          : isPressed 
            ? 'scale-95 shadow-lg' 
            : 'hover:scale-105 shadow-2xl'
        }
      `}>
        {/* Visualizer is now INSIDE the ORB and layered behind content */}
        <Visualizer
          analyser={analyser}
          isActive={isSpeaking}
          size={ORB_SIZE}
        />

        {/* State Icon (Layered above Visualizer) */}
        <div className="relative z-10 text-slate-900 drop-shadow-sm mb-0.5">
          {isMonitoring ? (
            <svg className={`w-6 h-6 ${isSpeaking ? 'animate-none' : 'animate-pulse'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 2v4m0 12v4M2 12h4m12 0h4" />
            </svg>
          ) : (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          )}
        </div>

        {/* Action Text (Layered above Visualizer) */}
        <div className="relative z-10 text-[10px] font-black uppercase tracking-tighter text-slate-900 drop-shadow-sm text-center leading-none">
          {status !== OrbStatus.IDLE ? status : (isMonitoring ? 'ON' : 'OFF')}
        </div>

        {/* Glass reflection shine */}
        <div className="absolute top-1/4 left-1/4 w-1/2 h-1/4 bg-white/30 blur-md rounded-full pointer-events-none z-20" />
      </div>
    </div>
  );
};

export default Orb;
