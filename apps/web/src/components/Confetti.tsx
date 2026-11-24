import { useEffect, useRef } from 'react';

const COLORS = ['#fbbf24', '#fde68a', '#f87171', '#34d399', '#60a5fa', '#c084fc', '#ffffff'];

interface Piece {
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  rot: number;
  vr: number;
  /** horizontal flutter phase + speed */
  sway: number;
  swaySpeed: number;
  color: string;
}

const PIECE_COUNT = 160;

/**
 * One-shot celebration confetti. Pure canvas, no dependencies: ~160 paper
 * pieces fall from above the viewport, flutter sideways, and the animation
 * ends by itself once the last piece exits the screen.
 */
export function Confetti() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let width = 0;
    let height = 0;
    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    };
    resize();
    window.addEventListener('resize', resize);

    // staggered starting heights so the burst streams in instead of clumping
    const pieces: Piece[] = Array.from({ length: PIECE_COUNT }, () => ({
      x: Math.random() * width,
      y: -40 - Math.random() * height * 0.6,
      vx: (Math.random() - 0.5) * 1.6,
      vy: 1.8 + Math.random() * 2.6,
      w: 6 + Math.random() * 5,
      h: 8 + Math.random() * 6,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.25,
      sway: Math.random() * Math.PI * 2,
      swaySpeed: 0.04 + Math.random() * 0.06,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
    }));

    let raf = 0;
    const step = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      let alive = 0;
      for (const p of pieces) {
        p.sway += p.swaySpeed;
        p.x += p.vx + Math.sin(p.sway) * 0.9;
        p.y += p.vy;
        p.vy = Math.min(p.vy + 0.015, 5);
        p.rot += p.vr;
        if (p.y > height + 20) continue;
        alive++;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        // fake the paper flip: squash the piece through its flutter cycle
        ctx.scale(1, Math.max(0.15, Math.abs(Math.cos(p.sway * 2))));
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
      if (alive > 0) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden="true" className="pointer-events-none fixed inset-0 z-[60]" />;
}
