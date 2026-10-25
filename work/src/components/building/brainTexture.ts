import { CanvasTexture, SRGBColorSpace } from "three";
import { NEON } from "../../lib/util";

// Mesmo desenho do BrainIcon (viewBox 24x24), em Path2D.
const CAMINHOS = [
  "M9.5 3A3 3 0 0 0 6.6 5.3 3 3 0 0 0 4 8.2a3 3 0 0 0 .6 4.6A3.2 3.2 0 0 0 6 17.5 3 3 0 0 0 9.5 21c1 0 1.9-.5 2.5-1.2V4.2A3 3 0 0 0 9.5 3Z",
  "M14.5 3a3 3 0 0 1 2.9 2.3A3 3 0 0 1 20 8.2a3 3 0 0 1-.6 4.6 3.2 3.2 0 0 1-1.4 4.7A3 3 0 0 1 14.5 21c-1 0-1.9-.5-2.5-1.2",
  "M8 9.5h2M14 9.5h2M8 14h2.5M13.5 14H16",
];

let cache: CanvasTexture | null = null;

/** Textura do letreiro com o cérebro em neon (gerada uma vez). */
export function brainSignTexture(): CanvasTexture {
  if (cache) return cache;
  const tamanho = 256;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = tamanho;
  const ctx = canvas.getContext("2d")!;
  ctx.translate(tamanho * 0.14, tamanho * 0.14);
  ctx.scale((tamanho * 0.72) / 24, (tamanho * 0.72) / 24);
  ctx.strokeStyle = NEON;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  // Duas passadas: brilho largo + traço nítido.
  for (const [largura, blur] of [[2.4, 6], [1.3, 0]] as const) {
    ctx.lineWidth = largura;
    ctx.shadowColor = NEON;
    ctx.shadowBlur = blur;
    for (const d of CAMINHOS) ctx.stroke(new Path2D(d));
  }
  cache = new CanvasTexture(canvas);
  cache.colorSpace = SRGBColorSpace;
  return cache;
}
