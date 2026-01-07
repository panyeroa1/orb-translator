
import React, { useEffect, useRef } from 'react';

interface VisualizerProps {
  analyser: AnalyserNode | null;
  isActive: boolean;
  size: number;
}

const Visualizer: React.FC<VisualizerProps> = ({ analyser, isActive, size }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current || !analyser) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    let animationFrame: number;

    const draw = () => {
      animationFrame = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(dataArray);

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      if (!isActive) return;

      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      const radius = (size / 2) - 5;

      // Calculate average with a boost for low volumes
      let sum = 0;
      for (let i = 0; i < bufferLength; i++) {
        sum += dataArray[i];
      }
      const rawAverage = sum / bufferLength;
      
      // Use square root to boost lower values (more responsive to quiet sounds)
      const normalizedAverage = Math.sqrt(rawAverage / 255); 
      const pulseFactor = 1 + (normalizedAverage * 0.4);

      // Outer glow/ring - Blue-Green Theme (Cyan)
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius * pulseFactor, 0, 2 * Math.PI);
      const alpha = 0.3 + (normalizedAverage * 0.7);
      ctx.strokeStyle = `rgba(34, 211, 238, ${alpha})`; // Cyan-400
      ctx.lineWidth = 2 + (normalizedAverage * 12);
      ctx.shadowBlur = 10 + (normalizedAverage * 20);
      ctx.shadowColor = 'rgba(16, 185, 129, 0.9)'; // Emerald-500
      ctx.stroke();

      // Individual frequency bars along the circle
      const activeBufferLength = Math.floor(bufferLength * 0.6);
      for (let i = 0; i < activeBufferLength; i += 2) {
        // Boost individual bar sensitivity
        const val = dataArray[i];
        const normalizedVal = Math.pow(val / 255, 0.7); // Boost low-mid range
        const barHeight = 5 + (normalizedVal * 35);
        
        const angle = (i / activeBufferLength) * Math.PI * 2;
        const x1 = centerX + Math.cos(angle) * (radius - 5);
        const y1 = centerY + Math.sin(angle) * (radius - 5);
        const x2 = centerX + Math.cos(angle) * (radius + barHeight);
        const y2 = centerY + Math.sin(angle) * (radius + barHeight);

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        // Gradient effect from Cyan to Emerald
        ctx.strokeStyle = `rgba(52, 211, 153, ${0.6 + normalizedVal * 0.4})`; // Emerald-400
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.stroke();
      }
    };

    draw();
    return () => cancelAnimationFrame(animationFrame);
  }, [analyser, isActive, size]);

  return (
    <canvas
      ref={canvasRef}
      width={size + 120}
      height={size + 120}
      className="absolute -top-[60px] -left-[60px] pointer-events-none"
    />
  );
};

export default Visualizer;
