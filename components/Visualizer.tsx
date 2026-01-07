import React, { useEffect, useRef } from 'react';

interface VisualizerProps {
  analyser: AnalyserNode | null;
  isActive: boolean;
  size: number;
}

const Visualizer: React.FC<VisualizerProps> = ({ analyser, isActive, size }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<{ x: number; y: number; vx: number; vy: number; color: string; radius: number }[]>([]);

  useEffect(() => {
    const colors = [
      'rgba(34, 211, 238, 0.6)', // Bright Cyan
      'rgba(168, 85, 247, 0.6)', // Purple
      'rgba(236, 72, 153, 0.6)', // Pink
      'rgba(255, 255, 255, 0.4)'  // White
    ];
    particlesRef.current = Array.from({ length: 8 }).map((_, i) => ({
      x: Math.random() * size,
      y: Math.random() * size,
      vx: (Math.random() - 0.5) * 0.8,
      vy: (Math.random() - 0.5) * 0.8,
      color: colors[i % colors.length],
      radius: size * (0.35 + Math.random() * 0.45)
    }));
  }, [size]);

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
        // Subtle "breathing" animation for idle state
        const time = Date.now() / 2000;
        const breathing = (Math.sin(time) + 1) / 2; // Oscillator 0 to 1
        bass = 0.05 + breathing * 0.08;
        mids = 0.04 + breathing * 0.06;
        highs = 0.03 + breathing * 0.04;
        totalAvg = (bass + mids + highs) / 3;
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;

      ctx.globalCompositeOperation = 'screen';

      const idleColors = [
        'rgba(125, 211, 252, 0.4)', // Sky 300
        'rgba(14, 165, 233, 0.3)',  // Sky 500
        'rgba(186, 230, 253, 0.2)'  // Sky 200
      ];

      particlesRef.current.forEach((p, i) => {
        const speedMultiplier = isActive ? 1.0 : 0.3;
        p.x += p.vx * speedMultiplier;
        p.y += p.vy * speedMultiplier;
        
        if (p.x < 0 || p.x > size) p.vx *= -1;
        if (p.y < 0 || p.y > size) p.vy *= -1;

        const bandValue = i % 3 === 0 ? bass : i % 3 === 1 ? mids : highs;
        const dynamicRadius = p.radius * (1.1 + bandValue * 1.2);

        // Switch color scheme based on activity
        const color = isActive ? p.color : idleColors[i % idleColors.length];

        const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, dynamicRadius);
        gradient.addColorStop(0, color);
        gradient.addColorStop(1, 'rgba(0,0,0,0)');

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(p.x, p.y, dynamicRadius, 0, Math.PI * 2);
        ctx.fill();
      });

      // Core Supernova
      const coreSize = size * 0.35 * (1 + totalAvg * 1.5);
      const coreGradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, coreSize);
      
      if (isActive) {
        coreGradient.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
        coreGradient.addColorStop(0.2, 'rgba(255, 255, 255, 0.8)');
        coreGradient.addColorStop(0.5, 'rgba(34, 211, 238, 0.6)');
      } else {
        // Cloudy blue core for idle
        coreGradient.addColorStop(0, 'rgba(186, 230, 253, 0.6)');
        coreGradient.addColorStop(0.4, 'rgba(125, 211, 252, 0.3)');
        coreGradient.addColorStop(0.8, 'rgba(14, 165, 233, 0.1)');
      }
      coreGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

      ctx.fillStyle = coreGradient;
      ctx.beginPath();
      ctx.arc(centerX, centerY, coreSize, 0, Math.PI * 2);
      ctx.fill();

      // Sharp Corona for high activity
      if (isActive && totalAvg > 0.25) {
        ctx.beginPath();
        ctx.arc(centerX, centerY, (size / 2) * (0.8 + totalAvg * 0.3), 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255, 255, 255, ${(totalAvg - 0.2) * 0.8})`;
        ctx.lineWidth = 1.5;
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