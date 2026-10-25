// A orbe central: uma esfera de partículas que reage a quem está "falando".
//   Orbe.pulso(intensidade, fonte)  -> injeta energia (fonte: "usuario" | "jarvis")
//   Orbe.estado(modo)               -> "repouso" | "pensando" | "jarvis"
// A mesma função pulso() pode receber o volume do microfone ou da voz no futuro.
"use strict";

function criarOrbe(canvas, opcoes = {}) {
  const ctx = canvas.getContext("2d");
  const total = opcoes.particulas || 1400;
  const escala = opcoes.escala || 0.3;
  const CORES = {
    // Tudo em branco; só uma leve variação de tom indica quem está "falando".
    repouso: [226, 229, 236],
    jarvis: [255, 255, 255],
    usuario: [222, 232, 255],
    pensando: [232, 226, 255],
  };

  // Pontos distribuídos por igual numa esfera (espiral de Fibonacci).
  const pontos = [];
  const aureo = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < total; i++) {
    const y = 1 - (i / (total - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    pontos.push({ x: Math.cos(aureo * i) * r, y, z: Math.sin(aureo * i) * r, fase: Math.random() * 6.283 });
  }

  let energia = 0, alvo = 0, giro = 0, t = 0;
  let modo = "repouso", fonte = "repouso", ultimoPulso = 0;
  const cor = [...CORES.repouso];

  function ajustarTamanho() {
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    return dpr;
  }

  function quadro() {
    const dpr = ajustarTamanho();
    const w = canvas.width, h = canvas.height;
    t += 1 / 60;

    // Energia: sobe com os pulsos e decai suavemente.
    alvo *= 0.955;
    const piso = modo === "pensando" ? 0.22 : modo === "jarvis" ? 0.08 : 0;
    energia += (Math.max(alvo, piso) - energia) * 0.14;
    if (performance.now() - ultimoPulso > 1200 && modo === "repouso") fonte = "repouso";

    const corAlvo = CORES[modo === "repouso" ? fonte : modo];
    for (let k = 0; k < 3; k++) cor[k] += (corAlvo[k] - cor[k]) * 0.06;
    const rgb = `${cor[0] | 0},${cor[1] | 0},${cor[2] | 0}`;

    giro += 0.0035 + energia * 0.03 + (modo === "pensando" ? 0.012 : 0);
    const cx = w / 2, cy = h / 2;
    const raio = Math.min(w, h) * escala * (1 + energia * 0.18 + Math.sin(t * 1.6) * 0.015);

    ctx.clearRect(0, 0, w, h);

    // Brilho de fundo
    // O brilho termina antes da borda do canvas para não deixar uma linha reta visível.
    const brilho = ctx.createRadialGradient(cx, cy, raio * 0.1, cx, cy, Math.min(raio * 1.9, Math.min(w, h) / 2));
    brilho.addColorStop(0, `rgba(${rgb},${0.16 + energia * 0.3})`);
    brilho.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = brilho;
    ctx.fillRect(0, 0, w, h);

    // Anéis externos
    ctx.lineWidth = 1 * dpr;
    for (const [fator, alfa, traco] of [[1.28, 0.28, 2], [1.5, 0.14, 6]]) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(giro * (fator > 1.4 ? -0.6 : 1));
      ctx.setLineDash([traco * dpr, 7 * dpr]);
      ctx.strokeStyle = `rgba(${rgb},${alfa + energia * 0.3})`;
      ctx.beginPath();
      ctx.arc(0, 0, raio * fator * (1 + energia * 0.08), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Partículas
    const cosG = Math.cos(giro), senG = Math.sin(giro);
    const inclinacao = 0.38, cosI = Math.cos(inclinacao), senI = Math.sin(inclinacao);
    ctx.fillStyle = `rgb(${rgb})`;
    for (const p of pontos) {
      const x = p.x * cosG - p.z * senG;
      const z0 = p.x * senG + p.z * cosG;
      const y = p.y * cosI - z0 * senI;
      const z = p.y * senI + z0 * cosI;
      const onda = 1 + energia * 0.26 * Math.sin(p.fase + t * 7 + p.y * 5) * Math.cos(t * 3.1 + p.x * 4);
      const profundidade = (z + 1) / 2;
      const tamanho = (0.55 + profundidade * 1.5) * dpr * (1 + energia * 0.6);
      ctx.globalAlpha = 0.12 + profundidade * 0.88;
      ctx.fillRect(cx + x * raio * onda, cy + y * raio * onda, tamanho, tamanho);
    }
    ctx.globalAlpha = 1;

    // Núcleo
    const nucleo = ctx.createRadialGradient(cx, cy, 0, cx, cy, raio * 0.35);
    nucleo.addColorStop(0, `rgba(255,255,255,${0.25 + energia * 0.5})`);
    nucleo.addColorStop(0.4, `rgba(${rgb},${0.18 + energia * 0.35})`);
    nucleo.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = nucleo;
    ctx.beginPath();
    ctx.arc(cx, cy, raio * 0.35, 0, Math.PI * 2);
    ctx.fill();

    requestAnimationFrame(quadro);
  }
  requestAnimationFrame(quadro);

  return {
    pulso(intensidade, origem) {
      alvo = Math.min(1, alvo + intensidade);
      fonte = origem;
      ultimoPulso = performance.now();
    },
    estado(novo) { modo = novo; },
  };
}
