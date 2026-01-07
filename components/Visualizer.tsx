
import React, { useEffect, useRef, useMemo } from 'react';
import { EmotionTone } from '../types';

interface VisualizerProps {
  analyser: AnalyserNode | null;
  isActive: boolean;
  size: number;
  emotion?: EmotionTone;
}

const Visualizer: React.FC<VisualizerProps> = ({ analyser, isActive, size, emotion = 'NEUTRAL' }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<{ x: number; y: number; vx: number; vy: number; color: string; radius: number }[]>([]);

  const emotionColors = useMemo(() => {
    switch (emotion) {
      case 'HAPPY': return ['rgba(251, 191, 36, 0.6)', 'rgba(245, 158, 11, 0.6)', 'rgba(255, 255, 255, 0.4)'];
      case 'SAD': return ['rgba(30, 58, 138, 0.6)', 'rgba(59, 130, 246, 0.4)', 'rgba(191, 219, 254, 0.2)'];
      case 'ANGRY': return ['rgba(220, 38, 38, 0.6)', 'rgba(153, 27, 27, 0.6)', 'rgba(255, 127, 127, 0.4)'];
      case 'URGENT': return ['rgba(255, 0, 0, 0.7)', 'rgba(255, 165, 0, 0.7)', 'rgba(255, 255, 255, 0.8)'];
      case 'CALM': return ['rgba(20, 184, 166, 0.6)', 'rgba(13, 148, 136, 0.6)', 'rgba(204, 251, 241, 0.4)'];
      case 'INTENSE': return ['rgba(147, 51, 234, 0.6)', 'rgba(192, 38, 211, 0.6)', 'rgba(255, 255, 255, 0.4)'];
      case 'CURIOUS': return ['rgba(132, 204, 22, 0.6)', 'rgba(234, 179, 8, 0.6)', 'rgba(255, 255, 255, 0.4)'];
      default: return ['rgba(34, 211, 238, 0.6)', 'rgba(168, 85, 247, 0.6)', 'rgba(236, 72, 153, 0.6)'];
    }
  }, [emotion]);

  useEffect(() => {
    // Increased particle count for the 150px area
    particlesRef.current = Array.from({ length: 12 }).map((_, i) => ({
      x: Math.random() * size,
      y: Math.random() * size,
      vx: (Math.random() - 0.5) * 0.8,
      vy: (Math.random() - 0.5) * 0.8,
      color: emotionColors[i % emotionColors.length],
      radius: size * (0.2 + Math.random() * 0.3)
    }));
  }, [size, emotionColors]);

  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bufferLength = analyser ? analyser.frequencyBinCount : 128;
    const dataArray = new Uint8Array(bufferLength);
    let animationFrame: number;

    const draw = () => {
      animationFrame = requestAnimationFrame(draw);

      let bass: number, mids: number, highs: number, totalAvg: number;

      if (isActive && analyser) {
        analyser.getByteFrequencyData(dataArray);
        const getAverage = (start: number, end: number) => {
          let sum = 0;
          for (let i = start; i < end; i++) sum += dataArray[i];
          return sum / (end - start);
        };
        bass = getAverage(0, 10) / 255;
        mids = getAverage(10, 50) / 255;
        highs = getAverage(50, 100) / 255;
        totalAvg = (bass + mids + highs) / 3;
      } else {
        const time = Date.now() / 2000;
        const breathing = (Math.sin(time) + 1) / 2;
        bass = 0.05 + breathing * 0.08;
        mids = 0.04 + breathing * 0.06;
        highs = 0.03 + breathing * 0.04;
        totalAvg = (bass + mids + highs) / 3;
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;

      ctx.globalCompositeOperation = 'screen';

      particlesRef.current.forEach((p, i) => {
        const speedMultiplier = isActive ? (emotion === 'URGENT' ? 2.5 : 1.0) : 0.3;
        p.x += p.vx * speedMultiplier;
        p.y += p.vy * speedMultiplier;
        
        if (p.x < 0 || p.x > size) p.vx *= -1;
        if (p.y < 0 || p.y > size) p.vy *= -1;

        const bandValue = i % 3 === 0 ? bass : i % 3 === 1 ? mids : highs;
        const dynamicRadius = p.radius * (1.1 + bandValue * (emotion === 'INTENSE' ? 2.0 : 1.2));

        const color = isActive ? emotionColors[i % emotionColors.length] : 'rgba(125, 211, 252, 0.3)';

        const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, dynamicRadius);
        gradient.addColorStop(0, color);
        gradient.addColorStop(1, 'rgba(0,0,0,0)');

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(p.x, p.y, dynamicRadius, 0, Math.PI * 2);
        ctx.fill();
      });

      const coreSize = size * 0.25 * (1 + totalAvg * (emotion === 'ANGRY' || emotion === 'URGENT' ? 2.0 : 1.5));
      const coreGradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, coreSize);
      
      if (isActive) {
        coreGradient.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
        coreGradient.addColorStop(0.2, 'rgba(255, 255, 255, 0.8)');
        coreGradient.addColorStop(0.5, emotionColors[0]);
      } else {
        coreGradient.addColorStop(0, 'rgba(186, 230, 253, 0.6)');
        coreGradient.addColorStop(0.4, 'rgba(125, 211, 252, 0.3)');
        coreGradient.addColorStop(0.8, 'rgba(14, 165, 233, 0.1)');
      }
      coreGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

      ctx.fillStyle = coreGradient;
      ctx.beginPath();
      ctx.arc(centerX, centerY, coreSize, 0, Math.PI * 2);
      ctx.fill();

      if (isActive && totalAvg > 0.2) {
        ctx.beginPath();
        ctx.arc(centerX, centerY, (size / 2) * (0.8 + totalAvg * 0.4), 0, Math.PI * 2);
        ctx.strokeStyle = emotionColors[0].replace('0.6', '0.4').replace('0.7', '0.5');
        ctx.lineWidth = emotion === 'URGENT' ? 5 : 2.5;
        ctx.stroke();
      }
    };

    draw();
    return () => cancelAnimationFrame(animationFrame);
  }, [analyser, isActive, size, emotion, emotionColors]);

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      className="absolute inset-0 pointer-events-none rounded-full"
    />
  );
};

export default Visualizer;
