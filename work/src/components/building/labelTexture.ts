import { CanvasTexture, SRGBColorSpace } from "three";

const cache = new Map<string, { texture: CanvasTexture; aspect: number }>();

/** Texto em caixa alta e espaçado, desenhado num canvas (um por nome+cor). */
export function labelTexture(texto: string, cor: string) {
  const chave = `${texto}|${cor}`;
  const salvo = cache.get(chave);
  if (salvo) return salvo;

  const altura = 64;
  const fonte = `700 ${altura * 0.5}px Inter, system-ui, sans-serif`;
  const espacado = texto.toUpperCase().split("").join(" ");
  const medida = document.createElement("canvas").getContext("2d")!;
  medida.font = fonte;
  const largura = Math.ceil(medida.measureText(espacado).width + altura * 0.6);

  const canvas = document.createElement("canvas");
  canvas.width = largura;
  canvas.height = altura;
  const ctx = canvas.getContext("2d")!;
  ctx.font = fonte;
  ctx.textBaseline = "middle";
  ctx.fillStyle = cor;
  ctx.shadowColor = cor;
  ctx.shadowBlur = 10;
  ctx.fillText(espacado, altura * 0.3, altura / 2);

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  const resultado = { texture, aspect: largura / altura };
  cache.set(chave, resultado);
  return resultado;
}
