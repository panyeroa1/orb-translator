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
  const getStatusColor = () => {
    if (status === OrbStatus.ERROR) return 'from-rose-400 to-red-600 shadow-rose-500/50';
    
    // Active states: Blue Green
    const activeGradient = 'from-cyan-400 to-emerald-500 shadow-cyan-500/50';
    
    if (status === OrbStatus.SPEAKING) return activeGradient;
    if (status === OrbStatus.TRANSLATING) return `${activeGradient} animate-pulse`;
    
    // Idle/Monitoring states: Sky Cloudy Blue
    const idleGradient = isMonitoring 
      ? 'from-sky-200 to-sky-400 shadow-sky-300/50' 
      : 'from-slate-200 to-sky-200/50 shadow-slate-400/10 grayscale-[0.3]';
      
    return idleGradient;
  };

  return (
    <div
      className="relative flex items-center justify-center select-none"
      style={{ width: ORB_SIZE, height: ORB_SIZE }}
      onMouseDown={onMouseDown}
      onTouchStart={onMouseDown}
    >
      <Visualizer
        analyser={analyser}
        isActive={status === OrbStatus.SPEAKING}
        size={ORB_SIZE}
      />

      <div className={`
        relative w-full h-full rounded-full bg-gradient-to-br ${getStatusColor()}
        flex flex-col items-center justify-center p-2 transition-all duration-300
        border border-black/10 backdrop-blur-sm cursor-move
        ${isDragging 
          ? 'scale-115 rotate-2 brightness-110 shadow-[0_30px_70px_-10px_rgba(0,0,0,0.7)] ring-4 ring-white/40 z-[100]' 
          : isPressed 
            ? 'scale-95 shadow-lg' 
            : 'hover:scale-105 shadow-2xl'
        }
      `}>
        {/* State Icon */}
        <div className="text-slate-950 mb-0.5">
          {isMonitoring ? (
            <svg className="w-6 h-6 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 2v4m0 12v4M2 12h4m12 0h4" />
            </svg>
          ) : (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          )}
        </div>

        {/* Action Text */}
        <div className="text-[10px] font-black uppercase tracking-tighter text-slate-950 drop-shadow-sm text-center leading-none">
          {status !== OrbStatus.IDLE ? status : (isMonitoring ? 'ON' : 'OFF')}
        </div>

        {/* Shine effect */}
        <div className="absolute top-1/4 left-1/4 w-1/2 h-1/4 bg-white/40 blur-md rounded-full pointer-events-none" />
        
        {/* Active Dragging Glow Overlay */}
        {isDragging && (
          <div className="absolute inset-0 rounded-full bg-white/10 animate-pulse pointer-events-none" />
        )}
      </div>
    </div>
  );
};

export default Orb;