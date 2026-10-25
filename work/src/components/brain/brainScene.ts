/**
 * Renderizador do cérebro em Canvas 2D (sem React): câmera, desenho e "hit test".
 * Feito para 500+ nós: linhas desenhadas em lote por setor e nenhuma alocação por quadro.
 */
import { NEON } from "../../lib/util";
import type { BrainLayout, BrainNode, AgentNode, SectorNode } from "./brainLayout";

interface Camera { x: number; y: number; zoom: number }

const ZOOM_MIN = 0.15;
const ZOOM_MAX = 4;
const PARTICULAS = 650;

function hexToRgb(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}

/** Espaça as letras (o canvas não tem letter-spacing em todos os motores). */
const espacar = (texto: string) => texto.toUpperCase().split("").join(" ");

export class BrainScene {
  private ctx: CanvasRenderingContext2D;
  private layout: BrainLayout | null = null;
  private cam: Camera = { x: 0, y: 0, zoom: 1 };
  private alvo: Camera = { x: 0, y: 0, zoom: 1 };
  private dpr = 1;
  private largura = 0;
  private altura = 0;
  private quadro = 0;
  private particulas: Float32Array;
  private destaque = new Map<string, number>();  // 0..1 por setor (transição suave)
  private rgbCache = new Map<string, string>();
  private enquadrado = false;

  companyName = "";
  selectedSectorId: string | null = null;
  hoveredSectorId: string | null = null;
  hoveredNodeId: string | null = null;
  selectedAgentId: string | null = null;
  /** Agentes trabalhando agora: ganham um pulso. */
  working: Record<string, true> = {};

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext("2d")!;
    // Pontos numa esfera (espiral de Fibonacci) para o núcleo.
    this.particulas = new Float32Array(PARTICULAS * 4);
    const aureo = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < PARTICULAS; i++) {
      const y = 1 - (i / (PARTICULAS - 1)) * 2;
      const r = Math.sqrt(1 - y * y);
      this.particulas.set([Math.cos(aureo * i) * r, y, Math.sin(aureo * i) * r, Math.random() * 6.28], i * 4);
    }
  }

  // --- Configuração --------------------------------------------------------

  setLayout(layout: BrainLayout) {
    const mudouTamanho = !this.layout || this.layout.sectors.length !== layout.sectors.length;
    this.layout = layout;
    if (mudouTamanho || !this.enquadrado) this.fit(!this.enquadrado);
  }

  resize(largura: number, altura: number) {
    this.dpr = window.devicePixelRatio || 1;
    this.largura = largura;
    this.altura = altura;
    this.canvas.width = Math.round(largura * this.dpr);
    this.canvas.height = Math.round(altura * this.dpr);
    if (!this.enquadrado && this.layout) this.fit(true);
  }

  /** Enquadra o cérebro inteiro na tela. */
  fit(imediato = false) {
    if (!this.layout || !this.largura) return;
    const zoom = Math.min(this.largura, this.altura) / (this.layout.extent * 2);
    this.alvo = { x: 0, y: 0, zoom: Math.max(ZOOM_MIN, Math.min(1.2, zoom)) };
    if (imediato) this.cam = { ...this.alvo };
    this.enquadrado = true;
  }

  focus(nodeId: string) {
    const no = this.layout?.byId.get(nodeId);
    if (!no) return;
    this.alvo = { x: no.x, y: no.y, zoom: no.kind === "agent" ? 1.8 : 1.1 };
  }

  // --- Interação -----------------------------------------------------------

  pan(dx: number, dy: number) {
    this.alvo.x -= dx / this.alvo.zoom;
    this.alvo.y -= dy / this.alvo.zoom;
    this.cam.x = this.alvo.x;
    this.cam.y = this.alvo.y;
  }

  zoomAt(sx: number, sy: number, fator: number) {
    const antes = this.toWorld(sx, sy, this.alvo);
    this.alvo.zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, this.alvo.zoom * fator));
    const depois = this.toWorld(sx, sy, this.alvo);
    this.alvo.x += antes.x - depois.x;
    this.alvo.y += antes.y - depois.y;
  }

  toWorld(sx: number, sy: number, cam: Camera = this.cam) {
    return { x: (sx - this.largura / 2) / cam.zoom + cam.x, y: (sy - this.altura / 2) / cam.zoom + cam.y };
  }

  toScreen(wx: number, wy: number) {
    return { x: (wx - this.cam.x) * this.cam.zoom + this.largura / 2, y: (wy - this.cam.y) * this.cam.zoom + this.altura / 2 };
  }

  /** Nó sob o ponteiro (funcionários têm prioridade por serem menores). */
  hitTest(sx: number, sy: number): BrainNode | null {
    if (!this.layout) return null;
    const p = this.toWorld(sx, sy);
    const tolerancia = Math.max(7, 9 / this.cam.zoom);
    let melhor: BrainNode | null = null, menor = Infinity;
    for (const e of this.layout.agents) {
      const d = Math.hypot(e.x - p.x, e.y - p.y);
      if (d < tolerancia && d < menor) { melhor = e; menor = d; }
    }
    if (melhor) return melhor;
    for (const s of this.layout.sectors) {
      if (Math.hypot(s.x - p.x, s.y - p.y) < Math.max(20, 22 / this.cam.zoom)) return s;
      // Clicar no rótulo também seleciona o setor.
      if (Math.hypot(s.label.x - p.x, s.label.y - p.y) < 60) return s;
    }
    return null;
  }

  // --- Desenho ---------------------------------------------------------------

  private rgb(cor: string) {
    let v = this.rgbCache.get(cor);
    if (!v) { v = hexToRgb(cor); this.rgbCache.set(cor, v); }
    return v;
  }

  private nivel(setorId: string): number {
    // 1 = normal/destacado, ~0.12 = apagado (quando outro setor está selecionado)
    return 0.12 + 0.88 * (this.destaque.get(setorId) ?? 1);
  }

  render(tempo: number) {
    const { ctx, layout } = this;
    this.quadro++;

    // Câmera e destaques seguem o alvo com suavização.
    const k = 0.14;
    this.cam.x += (this.alvo.x - this.cam.x) * k;
    this.cam.y += (this.alvo.y - this.cam.y) * k;
    this.cam.zoom += (this.alvo.zoom - this.cam.zoom) * k;

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.largura, this.altura);
    if (!layout) return;

    for (const s of layout.sectors) {
      const alvo = !this.selectedSectorId || this.selectedSectorId === s.id ? 1 : 0;
      const atual = this.destaque.get(s.id) ?? 1;
      this.destaque.set(s.id, atual + (alvo - atual) * 0.12);
    }

    const z = this.cam.zoom;
    ctx.setTransform(this.dpr * z, 0, 0, this.dpr * z, this.dpr * (this.largura / 2 - this.cam.x * z),
      this.dpr * (this.altura / 2 - this.cam.y * z));

    this.desenharLigacoes(layout, z);
    this.desenharNucleo(tempo, z);
    for (const s of layout.sectors) this.desenharAgentes(s, z, tempo);
    for (const s of layout.sectors) this.desenharSetor(s, z, tempo);
    for (const s of layout.sectors) this.desenharRotulo(s, z);
  }

  private desenharLigacoes(layout: BrainLayout, z: number) {
    const { ctx } = this;
    ctx.lineWidth = 1 / z;
    for (const s of layout.sectors) {
      const rgb = this.rgb(s.color);
      const n = this.nivel(s.id);
      // núcleo -> setor
      ctx.strokeStyle = `rgba(${rgb},${0.28 * n})`;
      ctx.beginPath();
      ctx.moveTo(Math.cos(s.angle) * 70, Math.sin(s.angle) * 70);
      ctx.lineTo(s.x, s.y);
      ctx.stroke();
      // setor -> funcionários (um único traçado por setor)
      if (!s.agents.length) continue;
      ctx.strokeStyle = `rgba(${rgb},${0.32 * n})`;
      ctx.beginPath();
      for (const e of s.agents) { ctx.moveTo(s.x, s.y); ctx.lineTo(e.x, e.y); }
      ctx.stroke();
    }
  }

  private desenharNucleo(t: number, z: number) {
    const { ctx } = this;
    const pulso = 1 + Math.sin(t * 1.4) * 0.05;
    const raio = 62 * pulso;
    const rgb = this.rgb(NEON);

    const brilho = ctx.createRadialGradient(0, 0, 4, 0, 0, raio * 2.2);
    brilho.addColorStop(0, `rgba(${rgb},0.22)`);
    brilho.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = brilho;
    ctx.beginPath();
    ctx.arc(0, 0, raio * 2.2, 0, Math.PI * 2);
    ctx.fill();

    const giro = t * 0.25, cg = Math.cos(giro), sg = Math.sin(giro);
    const ci = Math.cos(0.4), si = Math.sin(0.4);
    ctx.fillStyle = NEON;
    const p = this.particulas;
    const tamanhoBase = 1.6 / Math.max(z, 0.6);
    for (let i = 0; i < p.length; i += 4) {
      const x = p[i]! * cg - p[i + 2]! * sg;
      const z0 = p[i]! * sg + p[i + 2]! * cg;
      const y = p[i + 1]! * ci - z0 * si;
      const prof = (p[i + 1]! * si + z0 * ci + 1) / 2;
      const ruido = 1 + 0.07 * Math.sin(p[i + 3]! + t * 2.2);
      ctx.globalAlpha = 0.15 + prof * 0.85;
      const tam = tamanhoBase * (0.6 + prof);
      ctx.fillRect(x * raio * ruido, y * raio * ruido, tam, tam);
    }
    ctx.globalAlpha = 1;

    if (this.companyName) {
      ctx.fillStyle = "rgba(235,255,210,0.9)";
      ctx.font = `600 ${13}px Inter, system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(espacar(this.companyName), 0, raio + 26);
    }
  }

  private desenharAgentes(s: SectorNode, z: number, t: number) {
    const { ctx } = this;
    const n = this.nivel(s.id);
    const rgb = this.rgb(s.color);
    const r = Math.max(3.2, 4.6 / Math.max(z, 0.8));
    for (const e of s.agents) {
      const ativo = e.agent.status === "ativo";
      const foco = e.id === this.hoveredNodeId || e.id === this.selectedAgentId;
      const trabalhando = !!this.working[e.id];
      const raio = foco || trabalhando ? r * 1.8 : r;

      if (trabalhando) {
        // Onda saindo do agente enquanto ele executa uma tarefa do gerente.
        const fase = (t * 1.6) % 1;
        ctx.lineWidth = 1.5 / z;
        ctx.strokeStyle = `rgba(255,255,255,${0.8 * (1 - fase)})`;
        ctx.beginPath();
        ctx.arc(e.x, e.y, raio + fase * 22, 0, Math.PI * 2);
        ctx.stroke();
        // Pulso correndo pela ligação setor -> agente.
        const p = (t * 1.2) % 1;
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(s.x + (e.x - s.x) * p, s.y + (e.y - s.y) * p, 2.2 / Math.max(z, 0.6), 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.beginPath();
      ctx.arc(e.x, e.y, raio, 0, Math.PI * 2);
      if (ativo) {
        ctx.fillStyle = trabalhando ? "#ffffff" : `rgba(${rgb},${0.9 * n})`;
        ctx.fill();
      } else {
        ctx.lineWidth = 1.2 / z;
        ctx.strokeStyle = `rgba(${rgb},${0.7 * n})`;
        ctx.stroke();
      }
      if (foco) {
        ctx.lineWidth = 1.5 / z;
        ctx.strokeStyle = `rgba(255,255,255,${0.9 * n})`;
        ctx.beginPath();
        ctx.arc(e.x, e.y, raio + 4 / z, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  private desenharSetor(s: SectorNode, z: number, t: number) {
    const { ctx } = this;
    const n = this.nivel(s.id);
    const rgb = this.rgb(s.color);
    const ativo = s.id === this.selectedSectorId || s.id === this.hoveredSectorId;
    const r = 13 * (ativo ? 1.15 : 1);

    const halo = ctx.createRadialGradient(s.x, s.y, r * 0.4, s.x, s.y, r * 2.6);
    halo.addColorStop(0, `rgba(${rgb},${(ativo ? 0.45 : 0.22) * n})`);
    halo.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(s.x, s.y, r * 2.6, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = `rgba(6,10,6,${0.9})`;
    ctx.strokeStyle = `rgba(${rgb},${n})`;
    ctx.lineWidth = 1.6 / Math.max(z, 0.5);
    ctx.beginPath();
    ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Anel girando quando selecionado
    if (s.id === this.selectedSectorId) {
      ctx.beginPath();
      ctx.arc(s.x, s.y, r + 6, t * 1.5, t * 1.5 + Math.PI * 1.3);
      ctx.stroke();
    }
    ctx.fillStyle = `rgba(${rgb},${n})`;
    ctx.beginPath();
    ctx.arc(s.x, s.y, r * 0.38, 0, Math.PI * 2);
    ctx.fill();

    // Nome do gerente (a IA que coordena o setor) junto ao nó.
    if (z > 0.45) {
      ctx.fillStyle = `rgba(230,255,200,${0.75 * n})`;
      ctx.font = `600 ${Math.round(10 / Math.max(z, 0.7))}px Inter, system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(s.sector.manager.name, s.x, s.y + r + 8);
    }
  }

  private desenharRotulo(s: SectorNode, z: number) {
    const { ctx } = this;
    const n = this.nivel(s.id);
    // Rótulos mantêm tamanho legível mesmo com pouco zoom.
    const escala = 1 / Math.max(z, 0.55);
    ctx.textAlign = s.label.align;
    ctx.textBaseline = "middle";
    ctx.fillStyle = `rgba(240,255,225,${0.95 * n})`;
    ctx.font = `700 ${Math.round(22 * escala)}px Inter, system-ui, sans-serif`;
    ctx.fillText(espacar(s.sector.name), s.label.x, s.label.y);
    if (s.sector.description) {
      ctx.fillStyle = `rgba(190,210,175,${0.6 * n})`;
      ctx.font = `500 ${Math.round(10.5 * escala)}px Inter, system-ui, sans-serif`;
      ctx.fillText(espacar(s.sector.description), s.label.x, s.label.y + 22 * escala);
    }
  }

  employeeAt(id: string): AgentNode | null {
    const no = this.layout?.byId.get(id);
    return no?.kind === "agent" ? no : null;
  }
}
