/**
 * O cérebro do Jarvis em 3D (three.js puro, sem React).
 *
 * - Milhares de neurônios "de fundo" formam o formato do cérebro (dois hemisférios,
 *   cerebelo e tronco), com sinapses e impulsos elétricos correndo entre eles.
 * - Cada coisa que o Jarvis sabe vira um neurônio grande numa região:
 *   memórias no lobo frontal, conversas nos temporais, tarefas no parietal,
 *   habilidades no occipital e agentes do Work no cerebelo.
 * - A atividade (Jarvis pensando, respondendo ou falando) acende o cérebro inteiro.
 */
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

export type NeuronKind = "memoria" | "conversa" | "tarefa" | "habilidade" | "agente";

export interface DataNeuron {
  id: string;
  kind: NeuronKind;
  title: string;
}

export const KIND_COLOR: Record<NeuronKind, string> = {
  memoria: "#7df9ff",
  conversa: "#b388ff",
  tarefa: "#ffd166",
  habilidade: "#ff6bd6",
  agente: "#c4ff3d",
};

const AMBIENTE = 5200;      // neurônios de fundo
const COM_SINAPSE = 2400;   // quantos deles ganham ligações
const VIZINHOS = 3;
const DIST_SINAPSE = 0.16;
const IMPULSOS = 320;

// --- Aleatório determinístico (mesmo cérebro sempre) ------------------------------
function mulberry32(semente: number) {
  return () => {
    semente |= 0; semente = (semente + 0x6d2b79f5) | 0;
    let t = Math.imul(semente ^ (semente >>> 15), 1 | semente);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hash = (s: string) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };

function direcaoAleatoria(r: () => number, alvo = new THREE.Vector3()) {
  const u = r() * 2 - 1, a = r() * Math.PI * 2, s = Math.sqrt(1 - u * u);
  return alvo.set(Math.cos(a) * s, u, Math.sin(a) * s);
}

// --- Formato do cérebro -------------------------------------------------------------

/** Ponto na superfície de um hemisfério (lado = -1 esquerdo, 1 direito) na direção d. */
function superficieHemisferio(d: THREE.Vector3, lado: number, escala = 1, alvo = new THREE.Vector3()) {
  // Giros e sulcos: ondulações que dão a textura de cérebro.
  const giros = 1 + 0.055 * Math.sin(9 * d.x + 4 * d.y) * Math.sin(8 * d.z + 3 * d.y)
                  + 0.035 * Math.sin(17 * d.y + 13 * d.z + lado) + 0.02 * Math.sin(23 * d.z - 11 * d.x);
  let rx = 0.62, ry = 0.74, rz = 1.08;
  if (d.x * lado < 0) rx *= 0.32;                 // face interna achatada (fissura central)
  if (d.y < 0) ry *= 0.62;                        // base mais achatada
  if (d.z > 0.3 && d.y < 0.1) ry *= 0.92;         // lobo frontal levemente mais baixo
  // Lobo temporal: um "bico" para baixo nas laterais.
  const temporal = Math.max(0, -d.y) * Math.max(0, Math.abs(d.x)) * Math.max(0, 0.6 - Math.abs(d.z + 0.05));
  const r = giros * escala;
  return alvo.set(lado * 0.5 + d.x * rx * r, 0.08 + d.y * ry * r - temporal * 0.35, d.z * rz * r);
}

function superficieCerebelo(d: THREE.Vector3, escala = 1, alvo = new THREE.Vector3()) {
  const folhas = 1 + 0.06 * Math.sin(38 * d.y + 2 * d.x);
  const r = folhas * escala;
  return alvo.set(d.x * 0.72 * r, -0.5 + d.y * 0.27 * r, -0.72 + d.z * 0.36 * r);
}

interface Regiao { kind: NeuronKind; nome: string; ancora: THREE.Vector3 }

export const REGIOES: Array<{ kind: NeuronKind; nome: string }> = [
  { kind: "memoria", nome: "Memórias · lobo frontal" },
  { kind: "conversa", nome: "Conversas · lobos temporais" },
  { kind: "tarefa", nome: "Tarefas · lobo parietal" },
  { kind: "habilidade", nome: "Habilidades · lobo occipital" },
  { kind: "agente", nome: "Agentes do Work · cerebelo" },
];

/** Onde cada tipo de neurônio de dados nasce (direção base + espalhamento). */
const DIRECAO: Record<NeuronKind, { dir: [number, number, number]; espalha: number; cerebelo?: boolean }> = {
  memoria: { dir: [0.35, 0.45, 0.85], espalha: 0.45 },
  conversa: { dir: [1, -0.3, 0.05], espalha: 0.4 },
  tarefa: { dir: [0.25, 0.95, -0.3], espalha: 0.4 },
  habilidade: { dir: [0.3, 0.2, -1], espalha: 0.38 },
  agente: { dir: [0.3, -0.3, -0.6], espalha: 0.9, cerebelo: true },
};

function posicaoDado(n: DataNeuron, indice: number): THREE.Vector3 {
  const r = mulberry32(hash(n.kind + n.id));
  const cfg = DIRECAO[n.kind];
  const lado = indice % 2 === 0 ? 1 : -1;
  const base = new THREE.Vector3(cfg.dir[0] * lado, cfg.dir[1], cfg.dir[2]);
  const d = base.add(direcaoAleatoria(r).multiplyScalar(cfg.espalha)).normalize();
  if (cfg.cerebelo) {
    if (d.z > 0.2) d.z = -d.z;
    return superficieCerebelo(d, 1.0);
  }
  if (d.x * lado < 0.1) d.x = Math.abs(d.x) * lado + 0.1 * lado;
  return superficieHemisferio(d.normalize(), lado, 0.99);
}

// --- Shaders -----------------------------------------------------------------------

const VERT_PONTOS = /* glsl */ `
  attribute float tamanho;
  attribute float fase;
  attribute vec3 cor;
  attribute float destaque;
  uniform float tempo;
  uniform float atividade;
  uniform float pixel;
  varying vec3 vCor;
  varying float vBrilho;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float pisca = 0.55 + 0.45 * sin(tempo * (1.2 + atividade * 3.0) + fase);
    // Neurônios de dados (tamanho grande) brilham bem mais que os de fundo.
    float dado = step(10.0, tamanho);
    vBrilho = mix(pisca, 1.0, max(destaque, dado * 0.6)) * (0.7 + atividade * 0.8) + dado * 0.9 + destaque * 1.4;
    vCor = cor;
    gl_PointSize = tamanho * pixel * (1.0 + destaque * 1.4 + atividade * 0.25) * (3.2 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;
const FRAG_PONTOS = /* glsl */ `
  varying vec3 vCor;
  varying float vBrilho;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    if (d > 0.5) discard;
    float nucleo = smoothstep(0.5, 0.0, d);
    float halo = pow(nucleo, 2.2);
    // Mistura aditiva com alfa 1: a cor já sai pronta, sem multiplicar duas vezes.
    gl_FragColor = vec4(vCor * vBrilho * (halo * 1.5 + nucleo * 0.2), 1.0);
  }
`;

interface Impulso { aresta: number; t: number; velocidade: number; sentido: number }

export interface SceneCallbacks {
  onHover(indice: number | null, x: number, y: number): void;
  onSelect(indice: number | null): void;
}

export class NeuralScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private relogio = new THREE.Clock();
  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2(9, 9);
  private cerebro = new THREE.Group();

  private ambiente!: THREE.Points;
  private matAmbiente!: THREE.ShaderMaterial;
  private sinapses!: THREE.LineSegments;
  private arestas!: Float32Array;  // pares de pontos (6 floats por aresta)
  private impulsos: Impulso[] = [];
  private pontosImpulso!: THREE.Points;
  private nucleo!: THREE.Mesh;
  private anelVarredura!: THREE.Mesh;

  private dados: DataNeuron[] = [];
  private pontosDados: THREE.Points | null = null;
  private ligacoesDados: THREE.LineSegments | null = null;
  private posDados: THREE.Vector3[] = [];
  private ancoras: Regiao[] = [];

  private atividade = 0.15;
  private alvoAtividade = 0.15;
  private hover: number | null = null;
  private selecionado: number | null = null;
  private filtro: Set<NeuronKind> = new Set(Object.keys(KIND_COLOR) as NeuronKind[]);
  private busca = "";
  private quadro = 0;
  private parado = false;

  /** Rótulos HTML das regiões, posicionados sobre o 3D a cada quadro. */
  rotulos: Partial<Record<NeuronKind, HTMLElement>> = {};

  constructor(private canvas: HTMLCanvasElement, private accent: string, private cb: SceneCallbacks) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.setClearColor(0x010203, 1);
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.05, 50);
    this.camera.position.set(3.3, 1.15, 3.2);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 0.45;
    this.controls.minDistance = 1.4;
    this.controls.maxDistance = 7;
    this.controls.target.set(0, -0.05, 0);
    this.controls.enablePan = false;

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.75, 0.4, 0.12);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.scene.add(this.cerebro);
    this.scene.fog = new THREE.FogExp2(0x010203, 0.12);
    this.montarAmbiente();
    this.montarNucleo();
    this.montarHolograma();

    canvas.addEventListener("pointermove", this.aoMover);
    canvas.addEventListener("pointerleave", this.aoSair);
    canvas.addEventListener("pointerdown", this.aoDescer);
    canvas.addEventListener("pointerup", this.aoSubir);
    this.controls.addEventListener("start", () => { this.controls.autoRotate = false; });
  }

  // --- Montagem ---------------------------------------------------------------------

  private montarAmbiente() {
    const r = mulberry32(42);
    const pos = new Float32Array(AMBIENTE * 3);
    const cor = new Float32Array(AMBIENTE * 3);
    const tamanho = new Float32Array(AMBIENTE);
    const fase = new Float32Array(AMBIENTE);
    const destaque = new Float32Array(AMBIENTE);
    const base = new THREE.Color(this.accent), branco = new THREE.Color("#ffffff"), c = new THREE.Color();
    const d = new THREE.Vector3(), p = new THREE.Vector3();

    for (let i = 0; i < AMBIENTE; i++) {
      direcaoAleatoria(r, d);
      const sorteio = r();
      // 82% casca (córtex), 12% interior, 6% cerebelo/tronco.
      if (sorteio < 0.82) {
        superficieHemisferio(d, r() < 0.5 ? -1 : 1, 0.93 + r() * 0.08, p);
      } else if (sorteio < 0.94) {
        superficieHemisferio(d, r() < 0.5 ? -1 : 1, Math.cbrt(r()) * 0.85, p);
      } else if (sorteio < 0.985) {
        superficieCerebelo(d, 0.85 + r() * 0.15, p);
      } else {
        const t = r();
        p.set((r() - 0.5) * 0.22, -0.42 - t * 0.75, -0.32 - t * 0.12 + (r() - 0.5) * 0.18);
      }
      pos.set([p.x, p.y, p.z], i * 3);
      c.copy(base).lerp(branco, r() * 0.35);
      cor.set([c.r, c.g, c.b], i * 3);
      tamanho[i] = 1.4 + r() * 2.2;
      fase[i] = r() * Math.PI * 2;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("cor", new THREE.BufferAttribute(cor, 3));
    geo.setAttribute("tamanho", new THREE.BufferAttribute(tamanho, 1));
    geo.setAttribute("fase", new THREE.BufferAttribute(fase, 1));
    geo.setAttribute("destaque", new THREE.BufferAttribute(destaque, 1));
    this.matAmbiente = new THREE.ShaderMaterial({
      vertexShader: VERT_PONTOS, fragmentShader: FRAG_PONTOS,
      uniforms: { tempo: { value: 0 }, atividade: { value: 0.15 }, pixel: { value: this.renderer.getPixelRatio() } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.ambiente = new THREE.Points(geo, this.matAmbiente);
    this.cerebro.add(this.ambiente);

    // Sinapses: cada neurônio sorteado liga-se aos vizinhos mais próximos.
    const n = COM_SINAPSE;
    const arestas: number[] = [];
    for (let i = 0; i < n; i++) {
      const ax = pos[i * 3]!, ay = pos[i * 3 + 1]!, az = pos[i * 3 + 2]!;
      const melhores: Array<[number, number]> = [];
      for (let j = 0; j < n; j++) {
        if (j === i) continue;
        const dx = pos[j * 3]! - ax, dy = pos[j * 3 + 1]! - ay, dz = pos[j * 3 + 2]! - az;
        const dist = dx * dx + dy * dy + dz * dz;
        if (dist > DIST_SINAPSE * DIST_SINAPSE) continue;
        melhores.push([dist, j]);
      }
      melhores.sort((a, b) => a[0] - b[0]);
      for (const [, j] of melhores.slice(0, VIZINHOS)) {
        if (j < i) continue; // evita aresta duplicada
        arestas.push(ax, ay, az, pos[j * 3]!, pos[j * 3 + 1]!, pos[j * 3 + 2]!);
      }
    }
    this.arestas = new Float32Array(arestas);
    const geoLinhas = new THREE.BufferGeometry();
    geoLinhas.setAttribute("position", new THREE.BufferAttribute(this.arestas, 3));
    this.sinapses = new THREE.LineSegments(geoLinhas, new THREE.LineBasicMaterial({
      color: this.accent, transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.cerebro.add(this.sinapses);

    // Impulsos elétricos correndo pelas sinapses.
    const total = this.arestas.length / 6;
    for (let i = 0; i < IMPULSOS; i++) {
      this.impulsos.push({ aresta: Math.floor(r() * total), t: r(), velocidade: 0.4 + r() * 1.1, sentido: r() < 0.5 ? 1 : -1 });
    }
    const geoImp = new THREE.BufferGeometry();
    geoImp.setAttribute("position", new THREE.BufferAttribute(new Float32Array(IMPULSOS * 3), 3));
    this.pontosImpulso = new THREE.Points(geoImp, new THREE.PointsMaterial({
      color: new THREE.Color(this.accent).lerp(new THREE.Color("#ffffff"), 0.6), size: 0.016, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.cerebro.add(this.pontosImpulso);
  }

  private montarNucleo() {
    // O núcleo: a conta de IA conectada, no centro do cérebro.
    const geo = new THREE.IcosahedronGeometry(0.075, 3);
    this.nucleo = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: this.accent, transparent: true, opacity: 0.95 }));
    this.nucleo.position.set(0, 0.02, 0);
    const casca = new THREE.Mesh(new THREE.IcosahedronGeometry(0.13, 1), new THREE.MeshBasicMaterial({
      color: this.accent, wireframe: true, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending,
    }));
    this.nucleo.add(casca);
    this.cerebro.add(this.nucleo);
  }

  private montarHolograma() {
    // Base holográfica e anel de varredura: o toque de "laboratório do Stark".
    const grade = new THREE.PolarGridHelper(1.7, 16, 6, 64, this.accent, this.accent);
    (grade.material as THREE.Material).transparent = true;
    (grade.material as THREE.Material).opacity = 0.06;
    grade.position.y = -1.25;
    this.scene.add(grade);
    const aro = new THREE.Mesh(new THREE.RingGeometry(1.735, 1.745, 160), new THREE.MeshBasicMaterial({
      color: this.accent, transparent: true, opacity: 0.16, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    }));
    aro.rotation.x = -Math.PI / 2;
    aro.position.y = -1.25;
    this.scene.add(aro);
    this.anelVarredura = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.0025, 6, 180), new THREE.MeshBasicMaterial({
      color: this.accent, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.anelVarredura.rotation.x = Math.PI / 2;
    this.scene.add(this.anelVarredura);
  }

  // --- Dados ----------------------------------------------------------------------

  setDados(dados: DataNeuron[]) {
    this.dados = dados;
    this.hover = null;
    this.selecionado = null;
    if (this.pontosDados) { this.cerebro.remove(this.pontosDados); this.pontosDados.geometry.dispose(); }
    if (this.ligacoesDados) { this.cerebro.remove(this.ligacoesDados); this.ligacoesDados.geometry.dispose(); }

    const contagem: Partial<Record<NeuronKind, number>> = {};
    this.posDados = dados.map((n) => posicaoDado(n, (contagem[n.kind] = (contagem[n.kind] ?? 0) + 1)));
    const pos = new Float32Array(dados.length * 3);
    const cor = new Float32Array(dados.length * 3);
    const tamanho = new Float32Array(dados.length);
    const fase = new Float32Array(dados.length);
    const destaque = new Float32Array(dados.length);
    const c = new THREE.Color();
    dados.forEach((n, i) => {
      const p = this.posDados[i]!;
      pos.set([p.x, p.y, p.z], i * 3);
      c.set(KIND_COLOR[n.kind]);
      cor.set([c.r, c.g, c.b], i * 3);
      tamanho[i] = 16;
      fase[i] = (hash(n.id) % 628) / 100;
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("cor", new THREE.BufferAttribute(cor, 3));
    geo.setAttribute("tamanho", new THREE.BufferAttribute(tamanho, 1));
    geo.setAttribute("fase", new THREE.BufferAttribute(fase, 1));
    geo.setAttribute("destaque", new THREE.BufferAttribute(destaque, 1));
    this.pontosDados = new THREE.Points(geo, this.matAmbiente);
    this.pontosDados.renderOrder = 2;
    this.cerebro.add(this.pontosDados);

    // Axônios: cada neurônio de dados liga-se ao núcleo (a conta de IA).
    const linhas = new Float32Array(dados.length * 6);
    const coresLinha = new Float32Array(dados.length * 6);
    const centro = this.nucleo.position;
    dados.forEach((n, i) => {
      const p = this.posDados[i]!;
      linhas.set([p.x, p.y, p.z, centro.x, centro.y, centro.z], i * 6);
      c.set(KIND_COLOR[n.kind]);
      coresLinha.set([c.r * 0.5, c.g * 0.5, c.b * 0.5, c.r * 0.05, c.g * 0.05, c.b * 0.05], i * 6);
    });
    const geoL = new THREE.BufferGeometry();
    geoL.setAttribute("position", new THREE.BufferAttribute(linhas, 3));
    geoL.setAttribute("color", new THREE.BufferAttribute(coresLinha, 3));
    this.ligacoesDados = new THREE.LineSegments(geoL, new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.cerebro.add(this.ligacoesDados);

    // Âncoras dos rótulos: o centro de cada região.
    this.ancoras = REGIOES.map(({ kind, nome }) => {
      const cfg = DIRECAO[kind];
      const d = new THREE.Vector3(...cfg.dir).normalize();
      const ancora = cfg.cerebelo ? superficieCerebelo(new THREE.Vector3(0, -0.4, -1).normalize(), 1.25)
                                  : superficieHemisferio(d, d.x >= 0 ? 1 : -1, 1.25);
      return { kind, nome, ancora };
    });
    this.atualizarDestaques();
  }

  setFiltro(tipos: Set<NeuronKind>) { this.filtro = tipos; this.atualizarDestaques(); }
  setBusca(texto: string) { this.busca = texto.trim().toLowerCase(); this.atualizarDestaques(); }
  setSelecionado(indice: number | null) { this.selecionado = indice; this.atualizarDestaques(); if (indice !== null) this.focar(indice); }
  setGirar(girar: boolean) { this.controls.autoRotate = girar; }
  get girando() { return this.controls.autoRotate; }

  /** 0 = repouso, 1 = pensando a todo vapor. */
  estimular(nivel: number, pico = false) {
    this.alvoAtividade = nivel;
    if (pico) this.atividade = Math.max(this.atividade, Math.min(1.2, nivel + 0.25));
  }

  private atualizarDestaques() {
    if (!this.pontosDados) return;
    const attr = this.pontosDados.geometry.getAttribute("destaque") as THREE.BufferAttribute;
    const tam = this.pontosDados.geometry.getAttribute("tamanho") as THREE.BufferAttribute;
    this.dados.forEach((n, i) => {
      const visivel = this.filtro.has(n.kind);
      const casa = !!this.busca && n.title.toLowerCase().includes(this.busca);
      attr.setX(i, !visivel ? 0 : i === this.selecionado || i === this.hover || casa ? 1 : 0);
      tam.setX(i, !visivel ? 0 : this.busca && !casa ? 11 : 16);
    });
    attr.needsUpdate = true;
    tam.needsUpdate = true;
  }

  /** Gira a câmera para olhar de frente para um neurônio. */
  focar(indice: number) {
    const p = this.posDados[indice];
    if (!p) return;
    this.controls.autoRotate = false;
    const dir = p.clone().sub(this.controls.target).normalize();
    this.destinoCamera = this.controls.target.clone().add(dir.multiplyScalar(2.6)).add(new THREE.Vector3(0, 0.25, 0));
  }
  private destinoCamera: THREE.Vector3 | null = null;

  recentrar() {
    this.destinoCamera = new THREE.Vector3(3.3, 1.15, 3.2);
    this.controls.autoRotate = true;
  }

  // --- Ponteiro --------------------------------------------------------------------

  private arrastou = false;
  private inicio = { x: 0, y: 0 };
  private aoDescer = (e: PointerEvent) => { this.arrastou = false; this.inicio = { x: e.clientX, y: e.clientY }; this.destinoCamera = null; };
  private aoMover = (e: PointerEvent) => {
    const r = this.canvas.getBoundingClientRect();
    this.mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    if (Math.abs(e.clientX - this.inicio.x) + Math.abs(e.clientY - this.inicio.y) > 4) this.arrastou = true;
    const i = this.pegar();
    if (i !== this.hover) { this.hover = i; this.atualizarDestaques(); }
    this.canvas.style.cursor = i !== null ? "pointer" : "grab";
    this.cb.onHover(i, e.clientX - r.left, e.clientY - r.top);
  };
  private aoSair = () => { this.mouse.set(9, 9); this.hover = null; this.atualizarDestaques(); this.cb.onHover(null, 0, 0); };
  private aoSubir = () => {
    if (this.arrastou) return;
    const i = this.pegar();
    this.cb.onSelect(i);
  };

  private pegar(): number | null {
    if (!this.pontosDados || !this.dados.length) return null;
    this.raycaster.setFromCamera(this.mouse, this.camera);
    this.raycaster.params.Points = { threshold: 0.035 };
    const toques = this.raycaster.intersectObject(this.pontosDados);
    for (const t of toques) {
      const i = t.index ?? -1;
      if (i >= 0 && this.filtro.has(this.dados[i]!.kind)) return i;
    }
    return null;
  }

  // --- Laço ----------------------------------------------------------------------

  resize(largura: number, altura: number) {
    this.renderer.setSize(largura, altura, false);
    this.composer.setSize(largura, altura);
    this.bloom.setSize(largura / 2, altura / 2);
    this.camera.aspect = largura / Math.max(1, altura);
    // Em tela estreita, afasta a câmera para o cérebro caber.
    this.camera.fov = largura < altura ? 58 : 42;
    this.camera.updateProjectionMatrix();
  }

  render() {
    if (this.parado) return;
    const dt = Math.min(0.05, this.relogio.getDelta());
    const t = this.relogio.elapsedTime;
    this.quadro++;

    // Atividade sobe rápido e desce devagar, como um cérebro "esfriando".
    const k = this.alvoAtividade > this.atividade ? 6 : 0.8;
    this.atividade += (this.alvoAtividade - this.atividade) * Math.min(1, dt * k);
    this.matAmbiente.uniforms.tempo!.value = t;
    this.matAmbiente.uniforms.atividade!.value = this.atividade;
    (this.sinapses.material as THREE.LineBasicMaterial).opacity = 0.05 + this.atividade * 0.14;
    this.bloom.strength = 0.65 + this.atividade * 0.6;

    // Impulsos: quanto mais atividade, mais rápidos e numerosos.
    const pos = this.pontosImpulso.geometry.getAttribute("position") as THREE.BufferAttribute;
    const totalArestas = this.arestas.length / 6;
    const ativos = Math.floor(IMPULSOS * (0.25 + Math.min(1, this.atividade) * 0.75));
    for (let i = 0; i < IMPULSOS; i++) {
      const imp = this.impulsos[i]!;
      if (i >= ativos) { pos.setXYZ(i, 0, -50, 0); continue; }
      imp.t += dt * imp.velocidade * (1 + this.atividade * 2.5);
      if (imp.t >= 1) {
        imp.t = 0;
        imp.aresta = (imp.aresta * 7919 + i * 104729 + this.quadro) % totalArestas;
        imp.sentido = -imp.sentido;
      }
      const a = imp.aresta * 6, f = imp.sentido > 0 ? imp.t : 1 - imp.t;
      pos.setXYZ(i,
        this.arestas[a]! + (this.arestas[a + 3]! - this.arestas[a]!) * f,
        this.arestas[a + 1]! + (this.arestas[a + 4]! - this.arestas[a + 1]!) * f,
        this.arestas[a + 2]! + (this.arestas[a + 5]! - this.arestas[a + 2]!) * f);
    }
    pos.needsUpdate = true;

    // Núcleo pulsando, anel de varredura subindo e descendo.
    const pulso = 1 + Math.sin(t * (2 + this.atividade * 6)) * 0.12 * (0.5 + this.atividade);
    this.nucleo.scale.setScalar(pulso);
    this.nucleo.children[0]!.rotation.y = t * 0.6;
    this.nucleo.children[0]!.rotation.x = t * 0.3;
    this.anelVarredura.position.y = -0.85 + (Math.sin(t * 0.55) * 0.5 + 0.5) * 1.75;
    const larguraAnel = 0.75 + 0.5 * Math.cos(this.anelVarredura.position.y * 1.15);
    this.anelVarredura.scale.setScalar(larguraAnel);
    this.cerebro.rotation.y = Math.sin(t * 0.15) * 0.04;

    if (this.destinoCamera) {
      this.camera.position.lerp(this.destinoCamera, Math.min(1, dt * 3));
      if (this.camera.position.distanceTo(this.destinoCamera) < 0.01) this.destinoCamera = null;
    }
    this.controls.update();
    this.composer.render();
    this.posicionarRotulos();
  }

  private posicionarRotulos() {
    const v = new THREE.Vector3();
    const larg = this.canvas.clientWidth, alt = this.canvas.clientHeight;
    for (const { kind, ancora } of this.ancoras) {
      const el = this.rotulos[kind];
      if (!el) continue;
      v.copy(ancora).applyMatrix4(this.cerebro.matrixWorld).project(this.camera);
      const frente = v.z < 1 && this.filtro.has(kind);
      el.style.opacity = frente ? "1" : "0";
      el.style.transform = `translate(${((v.x + 1) / 2) * larg}px, ${((1 - v.y) / 2) * alt}px) translate(-50%, -50%)`;
    }
  }

  dispose() {
    this.parado = true;
    this.canvas.removeEventListener("pointermove", this.aoMover);
    this.canvas.removeEventListener("pointerleave", this.aoSair);
    this.canvas.removeEventListener("pointerdown", this.aoDescer);
    this.canvas.removeEventListener("pointerup", this.aoSubir);
    this.controls.dispose();
    this.renderer.dispose();
  }
}
