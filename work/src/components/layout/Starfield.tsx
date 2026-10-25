import { useEffect, useRef } from "react";

/** Fundo de estrelas se movendo devagar (Canvas 2D, poucas centenas de pontos). */
export function Starfield() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d")!;
    const estrelas = Array.from({ length: 220 }, () => ({
      x: Math.random(), y: Math.random(), z: Math.random() * 0.8 + 0.2, fase: Math.random() * 6.28,
    }));
    let quadro = 0;
    const desenhar = (t: number) => {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (canvas.width !== Math.round(w * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      for (const e of estrelas) {
        e.x -= 0.000025 * e.z;
        if (e.x < 0) e.x += 1;
        const brilho = 0.25 + 0.55 * e.z * (0.7 + 0.3 * Math.sin(t / 900 + e.fase));
        ctx.fillStyle = e.z > 0.85 ? `rgba(210,255,160,${brilho})` : `rgba(255,255,255,${brilho * 0.7})`;
        const tam = e.z * 1.5;
        ctx.fillRect(e.x * w, e.y * h, tam, tam);
      }
      quadro = requestAnimationFrame(desenhar);
    };
    quadro = requestAnimationFrame(desenhar);
    return () => cancelAnimationFrame(quadro);
  }, []);

  return <canvas ref={ref} aria-hidden className="pointer-events-none fixed inset-0 h-full w-full" />;
}
