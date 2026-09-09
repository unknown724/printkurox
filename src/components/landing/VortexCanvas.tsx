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
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
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

    // Qronos-accurate Hyperboloid Parameters:
    // topRadius: 380, waistRadius: 53, bottomRadius: 1150, twist: 3, speed: slow (10/100)
    const STRAND_COUNT = 180;
    const SEGMENTS_PER_STRAND = 65;
    const DOT_COUNT = 550;
    const COMET_COUNT = 10;

    const R_WAIST = 46;
    const R_TOP = 360;
    const R_FLOOR = 1180;
    const TOTAL_HEIGHT = 640;
    const WAIST_POS = 0.5;
    const TWIST = 3.0 * Math.PI * 2;

    // Pre-create dots along strands
    interface Dot {
      strand: number;
      t: number;
      speed: number;
      baseAlpha: number;
      size: number;
      flickerSpeed: number;
      phase: number;
    }

    const dots: Dot[] = Array.from({ length: DOT_COUNT }, () => ({
      strand: Math.floor(Math.random() * STRAND_COUNT),
      t: Math.random(),
      speed: 0.0001 + Math.random() * 0.0003, // Slow gentle drift
      baseAlpha: 0.15 + Math.random() * 0.65,
      size: 0.7 + Math.random() * 1.3,
      flickerSpeed: 1 + Math.random() * 3,
      phase: Math.random() * Math.PI * 2,
    }));

    // Pre-create slow stately comets
    interface Comet {
      strand: number;
      t: number;
      speed: number;
      tailLen: number;
      brightness: number;
    }

    const comets: Comet[] = Array.from({ length: COMET_COUNT }, () => ({
      strand: Math.floor(Math.random() * STRAND_COUNT),
      t: Math.random(),
      speed: 0.0008 + Math.random() * 0.0014, // Relaxed majestic comet speed
      tailLen: 0.07 + Math.random() * 0.08,
      brightness: 0.7 + Math.random() * 0.3,
    }));

    let time = 0;

    const render = () => {
      // Gentle, calm speed matching Qronos speed: 10
      time += 0.001;
      mouseX += (targetMouseX - mouseX) * 0.03;
      mouseY += (targetMouseY - mouseY) * 0.03;

      ctx.clearRect(0, 0, width, height);

      const cx = width / 2;
      const cy = height * 0.44;
      const fov = Math.min(width, height) * 1.05;
      const camDist = 650;

      // Pitch angle looking slightly down into the bottom flare
      const pitch = 0.34 + mouseY * 0.06;
      const yaw = mouseX * 0.08;

      const cosP = Math.cos(pitch);
      const sinP = Math.sin(pitch);
      const cosY = Math.cos(yaw);
      const sinY = Math.sin(yaw);

      // Compute 3D point on hyperboloid
      const projectPoint = (strandIdx: number, tProg: number, flowOffset = 0) => {
        let r: number;
        let y3d: number;

        if (tProg >= WAIST_POS) {
          const normT = (tProg - WAIST_POS) / (1 - WAIST_POS);
          r = R_WAIST + (R_TOP - R_WAIST) * Math.pow(normT, 1.8);
          y3d = (TOTAL_HEIGHT / 2) * normT;
        } else {
          const normT = (WAIST_POS - tProg) / WAIST_POS;
          r = R_WAIST + (R_FLOOR - R_WAIST) * Math.pow(normT, 2.3);
          y3d = -(TOTAL_HEIGHT / 2) * normT;
        }

        const laneAngle = (strandIdx / STRAND_COUNT) * Math.PI * 2;
        // Slow rotation angle
        const spiralAngle = Math.pow(tProg, 1.25) * TWIST + laneAngle + time * 0.28 + flowOffset;

        const x = r * Math.cos(spiralAngle);
        const y = y3d;
        const z = r * Math.sin(spiralAngle);

        // 3D camera rotation
        const x1 = x * cosY - z * sinY;
        const z1 = x * sinY + z * cosY;
        const y2 = y * cosP - z1 * sinP;
        const z2 = y * sinP + z1 * cosP + camDist;

        if (z2 <= 20) return null;

        const scale = fov / z2;
        const sx = cx + x1 * scale;
        const sy = cy - y2 * scale;
        const depthAlpha = Math.max(0.04, Math.min(1, (1200 - z2) / 750));

        return { sx, sy, z2, depthAlpha, r, tProg };
      };

      // 1. Draw Wireframe Strands
      for (let s = 0; s < STRAND_COUNT; s++) {
        ctx.beginPath();
        let started = false;

        const isAccent = s % 6 === 0;
        const baseAlpha = isAccent ? 0.3 : s % 2 === 0 ? 0.18 : 0.1;

        for (let i = 0; i <= SEGMENTS_PER_STRAND; i++) {
          const tProg = i / SEGMENTS_PER_STRAND;
          const pt = projectPoint(s, tProg);
          if (!pt) continue;

          if (pt.sx < -width * 0.4 || pt.sx > width * 1.4 || pt.sy < -height * 0.4 || pt.sy > height * 1.6) {
            continue;
          }

          if (!started) {
            ctx.moveTo(pt.sx, pt.sy);
            started = true;
          } else {
            ctx.lineTo(pt.sx, pt.sy);
          }
        }

        if (started) {
          ctx.strokeStyle = `rgba(235, 240, 255, ${baseAlpha})`;
          ctx.lineWidth = isAccent ? 0.9 : 0.6;
          ctx.stroke();
        }
      }

      // 2. Draw Twinkling Stardust Dots on Strands
      dots.forEach((d) => {
        d.t += d.speed;
        if (d.t > 1) d.t = 0;

        const pt = projectPoint(d.strand, d.t);
        if (!pt) return;
        if (pt.sx < 0 || pt.sx > width || pt.sy < 0 || pt.sy > height) return;

        const flicker = Math.sin(time * 6 + d.phase);
        const alpha = Math.max(0.08, d.baseAlpha * pt.depthAlpha * (0.75 + 0.25 * flicker));
        const size = d.size * (fov / pt.z2);

        ctx.beginPath();
        ctx.arc(pt.sx, pt.sy, Math.max(0.5, size), 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
        ctx.fill();
      });

      // 3. Draw Comets (Gentle speed luminous trails)
      comets.forEach((c) => {
        c.t += c.speed;
        if (c.t > 1) {
          c.t = 0;
          c.strand = Math.floor(Math.random() * STRAND_COUNT);
        }

        const headPt = projectPoint(c.strand, c.t);
        if (!headPt) return;

        ctx.beginPath();
        ctx.moveTo(headPt.sx, headPt.sy);

        const tailSteps = 7;
        for (let k = 1; k <= tailSteps; k++) {
          const tailT = Math.max(0, c.t - (c.tailLen / tailSteps) * k);
          const tailPt = projectPoint(c.strand, tailT);
          if (tailPt) {
            ctx.lineTo(tailPt.sx, tailPt.sy);
          }
        }

        const cometAlpha = c.brightness * headPt.depthAlpha * 0.85;
        ctx.strokeStyle = `rgba(255, 255, 255, ${cometAlpha * 0.65})`;
        ctx.lineWidth = 1.2;
        ctx.stroke();

        // Glowing Comet Head
        ctx.beginPath();
        ctx.arc(headPt.sx, headPt.sy, 2.0 * (fov / headPt.z2), 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${cometAlpha})`;
        ctx.shadowColor = 'rgba(255, 255, 255, 0.8)';
        ctx.shadowBlur = 5;
        ctx.fill();
        ctx.shadowBlur = 0;
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
      {/* Top & Bottom smooth vignette gradients matching Qronos */}
      <div className="absolute inset-0 pointer-events-none bg-gradient-to-t from-black via-transparent to-black/60" />
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_center,transparent_35%,rgba(0,0,0,0.85)_95%)]" />
    </div>
  );
}
