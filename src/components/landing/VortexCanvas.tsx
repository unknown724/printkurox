'use client';

import React, { useEffect, useRef } from 'react';

interface VortexCanvasProps {
  className?: string;
}

export function VortexCanvas({ className = '' }: VortexCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId = 0;
    let width = 0;
    let height = 0;
    let mouseX = 0;
    let mouseY = 0;
    let targetMouseX = 0;
    let targetMouseY = 0;

    const handleResize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.parentElement?.clientWidth || window.innerWidth;
      height = canvas.parentElement?.clientHeight || window.innerHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    handleResize();
    window.addEventListener('resize', handleResize);

    const handlePointerMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      targetMouseX = ((e.clientX - rect.left) / width) * 2 - 1;
      targetMouseY = ((e.clientY - rect.top) / height) * 2 - 1;
    };

    window.addEventListener('mousemove', handlePointerMove);

    // Parametric 3D Wireframe Funnel Geometry
    // 64 strands twisting down a hyperboloid of one sheet
    const STRAND_COUNT = 64;
    const SEGMENTS_PER_STRAND = 60;
    const COMET_COUNT = 24;

    interface Comet {
      strandIdx: number;
      progress: number;
      speed: number;
      length: number;
      size: number;
      brightness: number;
    }

    const comets: Comet[] = Array.from({ length: COMET_COUNT }, () => ({
      strandIdx: Math.floor(Math.random() * STRAND_COUNT),
      progress: Math.random(),
      speed: 0.003 + Math.random() * 0.005,
      length: 0.06 + Math.random() * 0.08,
      size: 1.5 + Math.random() * 2,
      brightness: 0.7 + Math.random() * 0.3,
    }));

    let time = 0;

    const render = () => {
      time += 0.006;
      mouseX += (targetMouseX - mouseX) * 0.05;
      mouseY += (targetMouseY - mouseY) * 0.05;

      ctx.clearRect(0, 0, width, height);

      const cx = width / 2;
      const cy = height * 0.44; // Slightly above center matching the screenshot
      const fov = Math.min(width, height) * 0.95;
      const camDist = 680;

      // Pitch angle looking slightly down into the bottom flare
      const pitch = 0.28 + mouseY * 0.08;
      const yaw = mouseX * 0.12;

      const cosP = Math.cos(pitch);
      const sinP = Math.sin(pitch);
      const cosY = Math.cos(yaw);
      const sinY = Math.sin(yaw);

      // Hyperboloid parameters
      const H = 290; // Half height
      const R_neck = 55; // Waist radius at center
      const R_top = 340; // Top flare radius
      const R_bottom = 440; // Bottom disk flare radius

      // Helper to calculate 3D position along the hyperboloid
      const getPoint = (u: number, tProg: number, flowOffset = 0) => {
        const y3d = tProg * H;

        // Radius curvature: narrow neck around tProg = 0.05
        const normY = tProg - 0.05;
        const r =
          normY < 0
            ? R_neck + (R_top - R_neck) * Math.pow(Math.abs(normY) / 1.05, 2.1)
            : R_neck + (R_bottom - R_neck) * Math.pow(normY / 0.95, 2.4);

        // Twist angle: spiral around vertical axis
        const twist = 3.6;
        const angle = u + tProg * twist + time * 0.8 + flowOffset;

        // 3D coordinates before camera rotation
        const x = r * Math.cos(angle);
        const y = y3d;
        const z = r * Math.sin(angle);

        // Camera rotation
        const x1 = x * cosY - z * sinY;
        const z1 = x * sinY + z * cosY;
        const y2 = y * cosP - z1 * sinP;
        const z2 = y * sinP + z1 * cosP + camDist;

        if (z2 <= 20) return null;

        const scale = fov / z2;
        const sx = cx + x1 * scale;
        const sy = cy + y2 * scale;
        const depthAlpha = Math.max(0.08, Math.min(1, (1100 - z2) / 600));

        return { sx, sy, z2, depthAlpha, r, tProg };
      };

      // 1. Draw Strands (The mesh spiral wireframe lines)
      for (let s = 0; s < STRAND_COUNT; s++) {
        const u = (s / STRAND_COUNT) * Math.PI * 2;
        ctx.beginPath();
        let started = false;

        for (let i = 0; i <= SEGMENTS_PER_STRAND; i++) {
          const tProg = -1 + (i / SEGMENTS_PER_STRAND) * 2;
          const pt = getPoint(u, tProg);
          if (!pt) continue;

          if (!started) {
            ctx.moveTo(pt.sx, pt.sy);
            started = true;
          } else {
            ctx.lineTo(pt.sx, pt.sy);
          }
        }

        const strandAlpha = s % 2 === 0 ? 0.28 : 0.14;
        ctx.strokeStyle = `rgba(220, 225, 235, ${strandAlpha})`;
        ctx.lineWidth = s % 4 === 0 ? 1.0 : 0.65;
        ctx.stroke();
      }

      // 2. Draw Horizontal Rings / Latitude Contours
      const RING_COUNT = 18;
      for (let r = 0; r < RING_COUNT; r++) {
        const tProg = -0.95 + (r / (RING_COUNT - 1)) * 1.9;
        ctx.beginPath();
        let started = false;

        const RING_SEGMENTS = 50;
        for (let s = 0; s <= RING_SEGMENTS; s++) {
          const u = (s / RING_SEGMENTS) * Math.PI * 2;
          const pt = getPoint(u, tProg);
          if (!pt) continue;

          if (!started) {
            ctx.moveTo(pt.sx, pt.sy);
            started = true;
          } else {
            ctx.lineTo(pt.sx, pt.sy);
          }
        }

        const ringAlpha = (1 - Math.abs(tProg) * 0.4) * 0.12;
        ctx.strokeStyle = `rgba(255, 255, 255, ${ringAlpha})`;
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }

      // 3. Draw Comets & Luminous Stardust Particles Racing along Strands
      comets.forEach((c) => {
        c.progress += c.speed;
        if (c.progress > 1) {
          c.progress = 0;
          c.strandIdx = Math.floor(Math.random() * STRAND_COUNT);
        }

        const u = (c.strandIdx / STRAND_COUNT) * Math.PI * 2;
        const headT = -1 + c.progress * 2;
        const headPt = getPoint(u, headT);

        if (headPt) {
          ctx.beginPath();
          ctx.moveTo(headPt.sx, headPt.sy);

          const tailSegments = 8;
          for (let k = 1; k <= tailSegments; k++) {
            const tailT = Math.max(-1, headT - (c.length / tailSegments) * k);
            const tailPt = getPoint(u, tailT);
            if (tailPt) {
              ctx.lineTo(tailPt.sx, tailPt.sy);
            }
          }

          const cometAlpha = c.brightness * headPt.depthAlpha * 0.85;
          ctx.strokeStyle = `rgba(255, 255, 255, ${cometAlpha * 0.6})`;
          ctx.lineWidth = 1.2;
          ctx.stroke();

          // Luminous comet head
          ctx.beginPath();
          ctx.arc(headPt.sx, headPt.sy, c.size * (fov / headPt.z2), 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255, 255, 255, ${cometAlpha})`;
          ctx.shadowColor = 'rgba(255, 255, 255, 0.9)';
          ctx.shadowBlur = 6;
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      });

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', handlePointerMove);
    };
  }, []);

  return (
    <div className={`relative w-full h-full pointer-events-none overflow-hidden ${className}`}>
      <canvas ref={canvasRef} className="block w-full h-full" />
      {/* Top & Bottom dark vignette gradients matching Qronos */}
      <div className="absolute inset-0 pointer-events-none bg-gradient-to-t from-black via-transparent to-black/60" />
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(0,0,0,0.85)_95%)]" />
    </div>
  );
}
