
import React, { useEffect, useRef } from 'react';

interface VisualizerProps {
  analyser: AnalyserNode | null;
  isActive: boolean;
  size: number;
}

const Visualizer: React.FC<VisualizerProps> = ({ analyser, isActive, size }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<{ x: number; y: number; vx: number; vy: number; color: string; radius: number }[]>([]);

  // Initialize some "nebula" particles for movement
  useEffect(() => {
    const colors = ['rgba(34, 211, 238, 0.4)', 'rgba(168, 85, 247, 0.4)', 'rgba(236, 72, 153, 0.4)', 'rgba(245, 158, 11, 0.3)'];
    particlesRef.current = Array.from({ length: 6 }).map((_, i) => ({
      x: Math.random() * size,
      y: Math.random() * size,
      vx: (Math.random() - 0.5) * 0.5,
      vy: (Math.random() - 0.5) * 0.5,
      color: colors[i % colors.length],
      radius: size * (0.3 + Math.random() * 0.4)
    }));
  }, [size]);

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

      // Calculate averages for different bands
      const getAverage = (start: number, end: number) => {
        let sum = 0;
        for (let i = start; i < end; i++) sum += dataArray[i];
        return sum / (end - start);
      };

      const bass = getAverage(0, 10) / 255;
      const mids = getAverage(10, 50) / 255;
      const highs = getAverage(50, 100) / 255;
      const totalAvg = (bass + mids + highs) / 3;

      // Use additive blending for "supernova" glow
      ctx.globalCompositeOperation = 'screen';

      // 1. Draw Shifting Nebula Clouds
      particlesRef.current.forEach((p, i) => {
        // Subtle movement
        p.x += p.vx;
        p.y += p.vy;
        
        // Bounce off bounds
        if (p.x < 0 || p.x > size) p.vx *= -1;
        if (p.y < 0 || p.y > size) p.vy *= -1;

        // Scale based on audio bands
        const bandValue = i % 3 === 0 ? bass : i % 3 === 1 ? mids : highs;
        const dynamicRadius = p.radius * (1 + bandValue * 0.5);

        const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, dynamicRadius);
        gradient.addColorStop(0, p.color);
        gradient.addColorStop(1, 'rgba(0,0,0,0)');

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(p.x, p.y, dynamicRadius, 0, Math.PI * 2);
        ctx.fill();
      });

      // 2. Core Supernova Pulse
      const coreSize = size * 0.3 * (1 + totalAvg * 0.8);
      const coreGradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, coreSize);
      coreGradient.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
      coreGradient.addColorStop(0.3, 'rgba(254, 240, 138, 0.6)'); // Yellow-100
      coreGradient.addColorStop(0.6, 'rgba(34, 211, 238, 0.4)'); // Cyan-400
      coreGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

      ctx.fillStyle = coreGradient;
      ctx.beginPath();
      ctx.arc(centerX, centerY, coreSize, 0, Math.PI * 2);
      ctx.fill();

      // 3. Subtle outer corona
      if (totalAvg > 0.4) {
        ctx.beginPath();
        ctx.arc(centerX, centerY, size / 2, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255, 255, 255, ${(totalAvg - 0.4) * 0.5})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    };

    draw();
    return () => cancelAnimationFrame(animationFrame);
  }, [analyser, isActive, size]);

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
