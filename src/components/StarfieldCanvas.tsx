import { useEffect, useRef } from "react";

interface Star {
  x: number;
  y: number;
  z: number;
  r: number;
  alpha: number;
  twinkleSpeed: number;
  twinklePhase: number;
  tint: string;
}

interface AuroraRay {
  xRatio: number;
  widthRatio: number;
  speed: number;
  phase: number;
  intensity: number;
}

/**
 * Interactive 3-plane parallax starfield + Lime Green (#C6F432) vertical aurora curtain canvas
 * on Midnight Black (#0B0B0C). Respects `prefers-reduced-motion`.
 */
export function StarfieldCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const TINTS = ["#FFFFFF", "#FFFFFF", "#C6F432", "#E4FB92", "#FFFFFF"];
    const starCount = Math.min(240, Math.floor((width * height) / 6800));

    let seed = 42199;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };

    const stars: Star[] = Array.from({ length: starCount }, () => {
      const layerRoll = rand();
      const z = layerRoll < 0.55 ? 0.25 : layerRoll < 0.88 ? 0.58 : 1.0;
      return {
        x: rand() * width,
        y: rand() * height,
        z,
        r: z === 1.0 ? 1.45 + rand() * 0.7 : z === 0.58 ? 0.95 + rand() * 0.45 : 0.55 + rand() * 0.3,
        alpha: 0.35 + rand() * 0.62,
        twinkleSpeed: 0.6 + rand() * 1.4,
        twinklePhase: rand() * Math.PI * 2,
        tint: TINTS[Math.floor(rand() * TINTS.length)],
      };
    });

    // Vertical aurora light beams centered around the showcase
    const rays: AuroraRay[] = Array.from({ length: 18 }, (_, i) => ({
      xRatio: 0.22 + (i / 17) * 0.56 + (rand() - 0.5) * 0.025,
      widthRatio: 0.014 + rand() * 0.028,
      speed: 0.35 + rand() * 0.65,
      phase: rand() * Math.PI * 2,
      intensity: 0.045 + Math.sin((i / 17) * Math.PI) * 0.095,
    }));

    let targetMouseX = 0;
    let targetMouseY = 0;
    let currentMouseX = 0;
    let currentMouseY = 0;
    let scrollY = window.scrollY;

    const onMouseMove = (e: MouseEvent) => {
      targetMouseX = (e.clientX / width - 0.5) * 38;
      targetMouseY = (e.clientY / height - 0.5) * 26;
    };

    const onScroll = () => {
      scrollY = window.scrollY;
    };

    const onResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };

    window.addEventListener("mousemove", onMouseMove, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize, { passive: true });

    let rafId = 0;
    const startTime = performance.now();

    const drawFrame = (now: number) => {
      const t = (now - startTime) * 0.001;
      currentMouseX += (targetMouseX - currentMouseX) * 0.06;
      currentMouseY += (targetMouseY - currentMouseY) * 0.06;

      ctx.clearRect(0, 0, width, height);

      // 1. Central radial Lime Green (#C6F432) core bloom behind hero CTA & 3-card fan
      const coreGrad = ctx.createRadialGradient(
        width * 0.5 - currentMouseX * 0.5,
        height * 0.58 - scrollY * 0.08,
        20,
        width * 0.5,
        height * 0.62,
        Math.max(width, height) * 0.48
      );
      coreGrad.addColorStop(0, "rgba(198, 244, 50, 0.24)");
      coreGrad.addColorStop(0.35, "rgba(198, 244, 50, 0.09)");
      coreGrad.addColorStop(0.7, "rgba(150, 204, 20, 0.025)");
      coreGrad.addColorStop(1, "rgba(11, 11, 12, 0)");
      ctx.fillStyle = coreGrad;
      ctx.fillRect(0, 0, width, height);

      // 2. Vertical Northline-inspired Lime Green aurora curtain beams
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      for (const ray of rays) {
        const wave = reducedMotion ? 0 : Math.sin(t * ray.speed + ray.phase) * 14;
        const rx = width * ray.xRatio + wave - currentMouseX * 0.45;
        const rw = width * ray.widthRatio;
        const pulse = reducedMotion
          ? 1
          : 0.72 + 0.28 * Math.sin(t * (ray.speed * 1.3) + ray.phase);
        const alpha = ray.intensity * pulse;

        const beamGrad = ctx.createLinearGradient(rx, height * 0.14, rx, height * 0.96);
        beamGrad.addColorStop(0, "rgba(198, 244, 50, 0)");
        beamGrad.addColorStop(0.35, `rgba(198, 244, 50, ${(alpha * 0.65).toFixed(4)})`);
        beamGrad.addColorStop(0.62, `rgba(198, 244, 50, ${alpha.toFixed(4)})`);
        beamGrad.addColorStop(1, "rgba(11, 11, 12, 0)");

        ctx.fillStyle = beamGrad;
        ctx.fillRect(rx - rw * 0.5, height * 0.14, rw, height * 0.82);
      }
      ctx.restore();

      // 3. Multi-plane parallax starfield
      for (const s of stars) {
        const px =
          (s.x - currentMouseX * s.z + t * 2.1 * s.z + width * 2) % width;
        const py =
          (s.y - currentMouseY * s.z - scrollY * 0.18 * s.z + height * 2) %
          height;
        const twinkle = reducedMotion
          ? 1
          : 0.7 + 0.3 * Math.sin(t * s.twinkleSpeed + s.twinklePhase);

        ctx.globalAlpha = s.alpha * twinkle;
        ctx.fillStyle = s.tint;
        ctx.beginPath();
        ctx.arc(px, py, s.r, 0, Math.PI * 2);
        ctx.fill();

        if (s.z === 1.0 && s.r > 1.8) {
          ctx.globalAlpha = s.alpha * twinkle * 0.35;
          ctx.fillRect(px - s.r * 3, py - 0.35, s.r * 6, 0.7);
          ctx.fillRect(px - 0.35, py - s.r * 3, 0.7, s.r * 6);
        }
      }

      ctx.globalAlpha = 1;
      if (!reducedMotion) {
        rafId = window.requestAnimationFrame(drawFrame);
      }
    };

    drawFrame(performance.now());

    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      data-testid="parallax-starfield"
      aria-hidden="true"
      className="l-starfield-canvas"
    />
  );
}
