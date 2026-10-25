// Interface do Jarvis. Toda ação passa por window.pywebview.api (Python),
// que confere o PIN e executa; aqui só existe apresentação.
"use strict";

const $ = (s) => document.querySelector(s);
const app = $("#app");

const ICONES = {
  esquerda: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>',
  direita: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/>',
  nova: '<path d="M12 5v14M5 12h14"/>',
  memorias: '<path d="M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 6 1V5a3 3 0 0 0-3-1z"/><path d="M15 4a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-6 1"/>',
  tarefas: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="m3 6 1.5 1.5L7 5M3 12l1.5 1.5L7 11M3 18l1.5 1.5L7 17"/>',
  bloquear: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  tela: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  escuta: '<path d="M8.5 15.5a5 5 0 0 1 0-7M15.5 8.5a5 5 0 0 1 0 7M5.6 18.4a9 9 0 0 1 0-12.8M18.4 5.6a9 9 0 0 1 0 12.8"/><circle cx="12" cy="12" r="1.5"/>',
  enviar: '<path d="M12 19V5M5 12l7-7 7 7"/>',
  parar: '<rect x="7" y="7" width="10" height="10" rx="1.5"/>',
  fechar: '<path d="M6 6l12 12M18 6 6 18"/>',
  chat: '<path d="M4 5h16v11H8l-4 4z"/>',
  plano: '<path d="M4 20h16M6 16l4-5 3 3 5-7"/>',
  busca: '<circle cx="11" cy="11" r="6"/><path d="m20 20-4.5-4.5"/>',
  noticias: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  clima: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5"/>',
  relatorio: '<path d="M5 20V10M11 20V4M17 20v-7"/>',
  predio: '<path d="M6 21V5l6-2 6 2v16M4 21h16M9 8h1M14 8h1M9 12h1M14 12h1M9 16h1M14 16h1"/>',
  semana: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
};
const svg = (nome) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONES[nome]}</svg>`;

const ACOES = {
  plano: "Monte meu plano para hoje com base nas minhas tarefas e no que você sabe sobre mim.",
  noticias: "Quais são as principais notícias de hoje no Brasil e no mundo? Resuma em tópicos curtos.",
  clima: "Como está o clima hoje na minha cidade? Se não souber a cidade, me pergunte.",
  relatorio: "Faça um resumo desta conversa: pontos principais, decisões e próximos passos.",
  semana: "Organize minha semana com base nas minhas tarefas, prazos e no que você sabe sobre mim.",
};

const estado = {
  cfg: null,
  zoom: 1,
  pastas: [],
  pastaId: 1,
  pastaNome: "geral",
  modulo: "assistente",
  chatId: null,
  ocupado: false,
  respostaAtual: null,
  bufferResposta: "",
  renderPendente: false,
  ultimaAtividade: Date.now(),
  escutaContinua: false,
  vozEstado: "parado",
};

const LEGENDAS_VOZ = {
  carregando: "CARREGANDO RECONHECIMENTO DE VOZ…",
  ouvindo: "OUVINDO · DIGA \"JARVIS, …\"",
  aguardando: "PODE FALAR…",
  chamado: "SIM? PODE FALAR…",
  falando: "OUVINDO VOCÊ…",
  transcrevendo: "ENTENDENDO…",
};

let orbe = null;
let orbePin = null;
const api = () => window.pywebview.api;

// ===================== Zoom e responsividade =====================

function zoomAutomatico() {
  const dpr = window.devicePixelRatio || 1;
  // Telas de alta resolução sem escala do sistema (ex.: 3072×1728 a 96 DPI) ficam minúsculas.
  if (dpr < 1.25 && screen.width >= 2200) return Math.min(2.2, Math.max(1, screen.width / 1700));
  return 1;
}

function zoomInicial() {
  const { cfg } = estado;
  if (cfg.zoom_salvo) return cfg.zoom_salvo;
  const fixo = parseFloat(cfg.zoom);
  return Number.isFinite(fixo) && fixo > 0 ? fixo : zoomAutomatico();
}

function aplicarZoom(zoom, salvar = false) {
  estado.zoom = Math.min(3, Math.max(0.5, Math.round(zoom * 20) / 20));
  document.documentElement.style.fontSize = `${16 * estado.zoom}px`;
  $("#inf-zoom").textContent = `${Math.round(estado.zoom * 100)}%`;
  ajustarLayout();
  if (salvar) api().salvar_zoom(estado.zoom);
}

function ajustarLayout() {
  const largura = window.innerWidth / estado.zoom;
  const altura = window.innerHeight / estado.zoom;
  const media = largura <= 1100, pequena = largura <= 820;
  app.classList.toggle("compacta", largura <= 1280);
  app.classList.toggle("media", media);
  app.classList.toggle("pequena", pequena);
  app.classList.toggle("baixa", altura <= 640);
  if (media) app.classList.remove("sem-direita");
  if (pequena) app.classList.remove("sem-esquerda");
  if (!media) app.classList.remove("gaveta-direita");
  if (!pequena) app.classList.remove("gaveta-esquerda");
}

function alternarLado(lado) {
  const gaveta = lado === "esquerda" ? app.classList.contains("pequena") : app.classList.contains("media");
  if (gaveta) {
    const outro = lado === "esquerda" ? "gaveta-direita" : "gaveta-esquerda";
    app.classList.remove(outro);
    app.classList.toggle(`gaveta-${lado}`);
  } else {
    app.classList.toggle(`sem-${lado}`);
  }
}

function fecharGavetas() { app.classList.remove("gaveta-esquerda", "gaveta-direita"); }

// ===================== Mostrador (coluna esquerda) =====================

function desenharMostrador() {
  const NS = "http://www.w3.org/2000/svg";
  const el = (tag, attrs, pai) => {
    const n = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    pai.appendChild(n);
    return n;
  };
  const raiz = $("#mostrador");
  el("circle", { cx: 100, cy: 100, r: 96, fill: "none", stroke: "rgba(255,255,255,0.08)", "stroke-width": 1 }, raiz);
  const giro = el("g", { class: "giro" }, raiz);
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * Math.PI * 2, longo = i % 6 === 0;
    const r1 = longo ? 78 : 83, r2 = 90;
    el("line", {
      x1: 100 + Math.cos(a) * r1, y1: 100 + Math.sin(a) * r1,
      x2: 100 + Math.cos(a) * r2, y2: 100 + Math.sin(a) * r2,
      stroke: longo ? "#ffffff" : "rgba(255,255,255,0.18)", "stroke-width": longo ? 1.6 : 1,
    }, giro);
  }
  const inverso = el("g", { class: "giro-inverso" }, raiz);
  el("circle", { cx: 100, cy: 100, r: 66, fill: "none", stroke: "#ffffff", "stroke-width": 1.5,
                 "stroke-dasharray": "60 40 20 40", opacity: 0.7 }, inverso);
  el("circle", { cx: 100, cy: 100, r: 56, fill: "none", stroke: "rgba(255,255,255,0.14)", "stroke-width": 1 }, raiz);
}

// ===================== Painéis =====================

function aplicarEstado(dados) {
  if (!dados) return;
  const { contagens } = dados;
  $("#ct-tarefas").textContent = contagens.tarefas;
  $("#ct-memorias").textContent = contagens.memorias;
  $("#ct-conversas").textContent = contagens.conversas;
  $("#st-contas").textContent = `T ${contagens.tarefas} · M ${contagens.memorias} · C ${contagens.conversas}`;
  estado.pastas = dados.pastas;
  estado.chatId = dados.chat_id;
  renderizarModulos();
}

async function atualizarEstado() { aplicarEstado(await api().estado()); }

const MODULOS = [
  { id: "assistente", nome: "Assistente", icone: "chat" },
  { id: "work", nome: "Work", icone: "predio" },
  { id: "brain", nome: "Brain", icone: "memorias" },
];

// Módulos que são apps próprios, abertos num iframe em tela cheia.
const MODULOS_IFRAME = { work: "work/index.html", brain: "work/brain.html" };

async function renderizarModulos() {
  const nav = $("#modulos");
  const chats = await api().chats(estado.pastaId);
  nav.replaceChildren();
  for (const modulo of MODULOS) {
    const ativo = modulo.id === estado.modulo;
    const bt = document.createElement("button");
    bt.className = "pasta" + (ativo ? " ativa" : "");
    bt.innerHTML = `${svg(modulo.icone)}<span class="nome"></span><span class="total"></span>`;
    bt.querySelector(".nome").textContent = modulo.nome;
    if (modulo.id === "assistente") bt.querySelector(".total").textContent = chats.length || "";
    bt.onclick = () => abrirModulo(modulo.id);
    nav.appendChild(bt);
    if (modulo.id !== "assistente" || !ativo) continue;

    const lista = document.createElement("div");
    lista.className = "chats";
    if (!chats.length) {
      lista.innerHTML = '<div class="vazio">nenhuma conversa ainda</div>';
    }
    for (const chat of chats) {
      const item = document.createElement("button");
      item.className = "chat" + (chat.id === estado.chatId ? " ativo" : "");
      item.title = chat.titulo;
      item.innerHTML = "<span></span>";
      item.querySelector("span").textContent = chat.titulo;
      const apagar = document.createElement("button");
      apagar.className = "apagar";
      apagar.title = "Apagar conversa";
      apagar.innerHTML = svg("fechar");
      apagar.onclick = async (e) => {
        e.stopPropagation();
        if (!confirm(`Apagar a conversa "${chat.titulo}"?`)) return;
        await api().apagar_conversa(chat.id);
        if (chat.id === estado.chatId) limparChat();
        atualizarEstado();
      };
      item.appendChild(apagar);
      item.onclick = () => abrirConversa(chat.id);
      lista.appendChild(item);
    }
    nav.appendChild(lista);
  }
}

function abrirModulo(id) {
  estado.modulo = id;
  const emIframe = id in MODULOS_IFRAME;
  app.classList.toggle("modo-work", emIframe);
  $("#centro").classList.toggle("oculto", emIframe);
  for (const [modulo, endereco] of Object.entries(MODULOS_IFRAME)) {
    $(`#${modulo}`).classList.toggle("oculto", modulo !== id);
    const quadro = $(`#${modulo}-frame`);
    if (modulo === id && !quadro.src) quadro.src = endereco;
  }
  // O Brain recarrega os neurônios sempre que é aberto (memórias novas aparecem).
  if (id === "brain") $("#brain-frame").contentWindow?.brainAtualizar?.();
  $("#titulo-pasta").textContent = id.toUpperCase();
  fecharGavetas();
  renderizarModulos();
  if (!emIframe) $("#entrada").focus();
}

async function abrirConversa(chatId) {
  if (estado.ocupado) return aviso("Aguarde a resposta terminar.");
  try {
    const falas = await api().abrir_conversa(chatId, estado.pastaNome);
    limparChat();
    for (const fala of falas) adicionarMensagem(fala.papel, fala.texto);
    estado.chatId = chatId;
    abrirModulo("assistente");
  } catch (erro) {
    aviso(String(erro.message || erro));
  }
}

async function novaConversa() {
  if (estado.ocupado) return;
  await api().nova_conversa(estado.pastaId, estado.pastaNome);
  limparChat();
  atualizarEstado();
  $("#entrada").focus();
}

// ===================== Mensagens =====================

function saudacao() {
  const h = new Date().getHours();
  const periodo = h < 12 ? "BOM DIA" : h < 18 ? "BOA TARDE" : "BOA NOITE";
  return `${periodo}, ${(estado.cfg.tratamento || estado.cfg.nome).toUpperCase()} · ONLINE`;
}

function definirLegenda(texto) { $("#legenda").textContent = texto; }

function limparChat() {
  $("#mensagens").replaceChildren();
  app.classList.remove("conversando");
  estado.chatId = null;
  estado.respostaAtual = null;
  definirLegenda(saudacao());
}

function adicionarMensagem(papel, texto) {
  app.classList.add("conversando");
  const msg = document.createElement("div");
  msg.className = `msg ${papel}`;
  const autor = { usuario: "VOCÊ", jarvis: "JARVIS", erro: "AVISO" }[papel];
  msg.innerHTML = '<div class="autor"></div><div class="texto"></div>';
  msg.querySelector(".autor").textContent = autor;
  const corpo = msg.querySelector(".texto");
  if (papel === "jarvis") corpo.innerHTML = Markdown.paraHtml(texto);
  else corpo.textContent = texto;
  $("#mensagens").appendChild(msg);
  rolarParaFim();
  return corpo;
}

function rolarParaFim() {
  const caixa = $("#mensagens");
  caixa.scrollTop = caixa.scrollHeight;
}

function renderizarResposta() {
  estado.renderPendente = false;
  if (!estado.respostaAtual) return;
  const caixa = $("#mensagens");
  const noFim = caixa.scrollHeight - caixa.scrollTop - caixa.clientHeight < 80;
  estado.respostaAtual.innerHTML = Markdown.paraHtml(estado.bufferResposta);
  if (noFim) rolarParaFim();
}

function definirOcupado(ocupado) {
  estado.ocupado = ocupado;
  app.classList.toggle("ocupado", ocupado);
  $("#bt-enviar").innerHTML = svg(ocupado ? "parar" : "enviar");
  $("#bt-enviar").title = ocupado ? "Parar" : "Enviar";
  $("#mostrador-texto").textContent = ocupado ? "ATIVO" : "ONLINE";
  const status = $("#st-status");
  status.textContent = ocupado ? "● PROCESSANDO" : "● ONLINE";
  status.className = ocupado ? "ambar" : "verde";
  if (!ocupado) {
    orbe.estado("repouso");
    definirLegenda(saudacao());
  }
}

// ===================== Voz =====================

function aplicarVozEstado(novo) {
  if (String(novo).startsWith("erro:")) {
    aviso(`Microfone: ${String(novo).slice(5)}`);
    novo = "parado";
  }
  estado.vozEstado = novo;
  const ativo = ["aguardando", "chamado", "falando", "transcrevendo"].includes(novo);
  $("#bt-mic").classList.toggle("ouvindo", ativo);
  if (estado.ocupado) return;
  if (LEGENDAS_VOZ[novo] && (novo !== "ouvindo" || !$("#mensagens").children.length)) {
    definirLegenda(LEGENDAS_VOZ[novo]);
  } else if (novo === "ouvindo" || novo === "parado") {
    definirLegenda(saudacao());
  }
  if (novo === "transcrevendo") orbe.estado("pensando");
  else if (!estado.ocupado) orbe.estado("repouso");
}

function definirEscuta(ligada) {
  estado.escutaContinua = ligada;
  $("#bt-escuta").classList.toggle("escutando", ligada);
  $("#bt-escuta").title = ligada ? "Escuta contínua LIGADA (clique para desligar)" : "Escuta contínua desligada";
  $("#inf-voz").textContent = ligada ? "ESCUTANDO" : "SOB DEMANDA";
  api().voz_continua(ligada);
}

function falarAgora() {
  if (estado.falando) api().fala_parar();  // interrompe a voz e já escuta você
  if (!estado.cfg.voz || estado.ocupado) return;
  if ($("#bt-mic").classList.contains("ouvindo")) return api().voz_cancelar();
  api().voz_ouvir();
  aplicarVozEstado("aguardando");
}

async function enviar(texto) {
  texto = texto.trim();
  if (!texto || estado.ocupado) return;
  adicionarMensagem("usuario", texto);
  estado.respostaAtual = null;
  estado.bufferResposta = "";
  definirOcupado(true);
  orbe.estado("pensando");
  definirLegenda("PROCESSANDO…");
  try {
    if (!(await api().enviar(texto))) { definirOcupado(false); aviso("Aguarde a resposta anterior."); }
  } catch (erro) {
    definirOcupado(false);
    aviso(String(erro.message || erro));
  }
}

// Chamado pelo Python durante a resposta.
window.jarvis = {
  evento(tipo, dado) {
    // O Brain acende os neurônios enquanto o Jarvis pensa, responde e fala.
    if (estado.modulo === "brain") $("#brain-frame").contentWindow?.brainEvento?.(tipo, dado);
    switch (tipo) {
      case "pensando":
        orbe.estado("pensando");
        definirLegenda("PENSANDO…");
        break;
      case "ferramenta":
        orbe.estado("pensando");
        orbe.pulso(0.25, "jarvis");
        definirLegenda(`USANDO: ${String(dado).toUpperCase()}`);
        break;
      case "latencia":
        $("#st-latencia").textContent = `${dado} ms`;
        $("#st-barra").style.width = `${Math.max(6, Math.min(100, 100 - dado / 60))}%`;
        break;
      case "texto":
        if (!estado.respostaAtual) {
          estado.respostaAtual = adicionarMensagem("jarvis", "");
          estado.respostaAtual.classList.add("cursor");
        }
        estado.bufferResposta += dado;
        orbe.estado("jarvis");
        orbe.pulso(Math.min(0.4, dado.length / 45), "jarvis");
        definirLegenda("RESPONDENDO…");
        if (!estado.renderPendente) {
          estado.renderPendente = true;
          requestAnimationFrame(renderizarResposta);
        }
        break;
      case "erro":
        adicionarMensagem("erro", dado);
        // fallthrough
      case "fim":
        renderizarResposta();
        if (estado.respostaAtual) estado.respostaAtual.classList.remove("cursor");
        estado.respostaAtual = null;
        definirOcupado(false);
        break;
      case "estado":
        aplicarEstado(dado);
        break;
      case "voz_estado":
        aplicarVozEstado(dado);
        break;
      case "voz_nivel":
        if (!estado.ocupado && dado > 0.04) orbe.pulso(dado * 0.35, "usuario");
        break;
      case "voz_texto":
        enviar(dado);
        break;
      case "fala_estado":
        if (String(dado).startsWith("erro:")) {
          aviso(`Voz: ${String(dado).slice(5)}`);
          dado = "fim";
        }
        estado.falando = dado === "inicio";
        app.classList.toggle("falando", estado.falando);
        if (estado.falando) {
          orbe.estado("jarvis");
          if (!estado.ocupado) definirLegenda("FALANDO… (clique no microfone para interromper)");
        } else if (!estado.ocupado) {
          orbe.estado("repouso");
          definirLegenda(saudacao());
        }
        break;
      case "fala_nivel":
        if (dado > 0.02) orbe.pulso(dado * 0.5, "jarvis");
        break;
    }
  },
};

// Usado pelo Brain: clicar num neurônio de conversa abre ela no Assistente.
window.jarvisUi = { abrirConversa: (id) => abrirConversa(Number(id)) };

// ===================== Janelas: memórias e tarefas =====================

function abrirModal(titulo, preencher) {
  $("#modal-titulo").textContent = titulo;
  $("#modal").classList.remove("oculto");
  preencher($("#modal-corpo"));
}
function fecharModal() { $("#modal").classList.add("oculto"); }

function botaoRemover(acao) {
  const bt = document.createElement("button");
  bt.className = "remover";
  bt.title = "Remover";
  bt.innerHTML = svg("fechar");
  bt.onclick = acao;
  return bt;
}

async function mostrarMemorias() {
  const memorias = await api().memorias();
  abrirModal("MEMÓRIAS", (corpo) => {
    corpo.replaceChildren();
    if (!memorias.length) corpo.innerHTML = '<p class="vazio">Nada ainda. Conte algo sobre você ao Jarvis.</p>';
    for (const m of memorias) {
      const item = document.createElement("div");
      item.className = "item";
      item.innerHTML = '<span class="categoria"></span><span class="conteudo"></span>';
      item.querySelector(".categoria").textContent = m.categoria;
      item.querySelector(".conteudo").textContent = m.conteudo;
      item.appendChild(botaoRemover(async () => {
        await api().esquecer(m.id);
        mostrarMemorias();
        atualizarEstado();
      }));
      corpo.appendChild(item);
    }
  });
}

async function mostrarTarefas() {
  const tarefas = await api().tarefas();
  abrirModal("TAREFAS", (corpo) => {
    corpo.replaceChildren();
    const form = document.createElement("form");
    form.className = "form-tarefa";
    form.innerHTML = '<input maxlength="500" placeholder="Nova tarefa…"><button>Adicionar</button>';
    form.onsubmit = async (e) => {
      e.preventDefault();
      const campo = form.querySelector("input");
      if (!campo.value.trim()) return;
      await api().adicionar_tarefa(campo.value);
      await mostrarTarefas();
      atualizarEstado();
      $("#modal-corpo input").focus();
    };
    corpo.appendChild(form);
    if (!tarefas.length) corpo.insertAdjacentHTML("beforeend", '<p class="vazio">Nenhuma tarefa.</p>');
    for (const t of tarefas) {
      const item = document.createElement("div");
      item.className = "item" + (t.feita ? " feita" : "");
      item.innerHTML = '<input type="checkbox"><span class="conteudo"></span><span class="prazo"></span>';
      const marcar = item.querySelector("input");
      marcar.checked = !!t.feita;
      marcar.onchange = async () => {
        await api().marcar_tarefa(t.id, marcar.checked);
        mostrarTarefas();
        atualizarEstado();
      };
      item.querySelector(".conteudo").textContent = t.texto;
      item.querySelector(".prazo").textContent = t.prazo;
      item.appendChild(botaoRemover(async () => {
        await api().apagar_tarefa(t.id);
        mostrarTarefas();
        atualizarEstado();
      }));
      corpo.appendChild(item);
    }
  });
}

// ===================== Bloqueio =====================

function mostrarBloqueio() {
  fecharModal();
  $("#bloqueio").classList.remove("oculto");
  $("#pin").value = "";
  $("#pin-erro").textContent = "";
  if (!orbePin) orbePin = criarOrbe($("#orbe-pin"), { particulas: 500, escala: 0.3 });
  setTimeout(() => $("#pin").focus(), 50);
}

async function bloquear() {
  if (!estado.cfg.tem_pin) return;
  await api().bloquear();
  mostrarBloqueio();
}

async function tentarDesbloquear(e) {
  e.preventDefault();
  const botao = $("#form-pin button");
  botao.disabled = true;
  orbePin.estado("pensando");
  const resposta = await api().desbloquear($("#pin").value);
  botao.disabled = false;
  orbePin.estado("repouso");
  if (resposta.ok) {
    $("#bloqueio").classList.add("oculto");
    estado.ultimaAtividade = Date.now();
    await atualizarEstado();
    $("#entrada").focus();
  } else {
    $("#pin").value = "";
    $("#pin-erro").textContent = resposta.restantes > 0
      ? `PIN incorreto. ${resposta.restantes} tentativa(s) restante(s).`
      : "Tentativas esgotadas. Encerrando.";
    $("#pin").focus();
  }
}

function vigiarInatividade() {
  const { tem_pin, bloqueio_minutos } = estado.cfg;
  if (!tem_pin || !bloqueio_minutos) return;
  const marcar = () => { estado.ultimaAtividade = Date.now(); };
  for (const ev of ["keydown", "mousedown", "mousemove", "wheel"]) window.addEventListener(ev, marcar, { passive: true });
  setInterval(() => {
    const parado = Date.now() - estado.ultimaAtividade > bloqueio_minutos * 60_000;
    if (parado && $("#bloqueio").classList.contains("oculto")) bloquear();
  }, 5000);
}

// ===================== Avisos e atalhos =====================

let temporizadorAviso = null;
function aviso(texto) {
  const caixa = $("#aviso");
  caixa.textContent = texto;
  caixa.classList.remove("oculto");
  clearTimeout(temporizadorAviso);
  temporizadorAviso = setTimeout(() => caixa.classList.add("oculto"), 5000);
}

function ligarEventos() {
  const entrada = $("#entrada");
  const ajustarAltura = () => {
    entrada.style.height = "auto";
    entrada.style.height = `${entrada.scrollHeight}px`;
  };
  entrada.addEventListener("input", ajustarAltura);
  entrada.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const texto = entrada.value;
      entrada.value = "";
      ajustarAltura();
      enviar(texto);
      return;
    }
    if (!estado.ocupado && (e.key.length === 1 || e.key === "Backspace")) orbe.pulso(0.09, "usuario");
  });

  $("#bt-enviar").onclick = () => {
    if (estado.ocupado) return api().parar();
    if (estado.falando && !entrada.value.trim()) return api().fala_parar();
    const texto = entrada.value;
    entrada.value = "";
    ajustarAltura();
    enviar(texto);
  };
  $("#bt-esquerda").onclick = () => alternarLado("esquerda");
  $("#bt-direita").onclick = () => alternarLado("direita");
  $("#bt-nova").onclick = novaConversa;
  $("#bt-mic").onclick = falarAgora;
  $("#bt-escuta").onclick = () => definirEscuta(!estado.escutaContinua);
  $("#bt-memorias").onclick = mostrarMemorias;
  $("#bt-tarefas").onclick = mostrarTarefas;
  $("#bt-bloquear").onclick = bloquear;
  $("#bt-tela").onclick = () => api().tela_cheia();
  $("#veu").onclick = fecharGavetas;
  $("#modal-fechar").onclick = fecharModal;
  $("#modal").onclick = (e) => { if (e.target.id === "modal") fecharModal(); };
  $("#form-pin").onsubmit = tentarDesbloquear;

  for (const bt of document.querySelectorAll("[data-abrir]")) {
    bt.onclick = () => (bt.dataset.abrir === "tarefas" ? mostrarTarefas() : mostrarMemorias());
  }
  for (const bt of document.querySelectorAll("[data-acao]")) {
    bt.onclick = () => {
      fecharGavetas();
      if (bt.dataset.acao === "pesquisa") {
        entrada.value = "Pesquise na web: ";
        entrada.focus();
      } else enviar(ACOES[bt.dataset.acao]);
    };
  }

  for (const modulo of Object.keys(MODULOS_IFRAME)) {
    $(`#${modulo}-frame`).addEventListener("load", () => {
      // Se o build do Work não existir, o iframe carrega uma página de erro vazia.
      const vazio = !$(`#${modulo}-frame`).contentDocument?.querySelector("#root");
      $(`#${modulo}-vazio`).classList.toggle("oculto", !vazio);
    });
  }

  $("#mensagens").addEventListener("click", (e) => {
    const link = e.target.closest("a[data-href]");
    if (link) { e.preventDefault(); api().abrir_link(link.dataset.href); }
  });

  window.addEventListener("resize", ajustarLayout);
  window.addEventListener("keydown", (e) => {
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && (e.key === "+" || e.key === "=")) { e.preventDefault(); aplicarZoom(estado.zoom + 0.1, true); }
    else if (ctrl && e.key === "-") { e.preventDefault(); aplicarZoom(estado.zoom - 0.1, true); }
    else if (ctrl && e.key === "0") {
      e.preventDefault();
      api().salvar_zoom(0);  // 0 = voltar ao automático
      estado.cfg.zoom_salvo = null;
      aplicarZoom(zoomInicial());
    }
    else if (ctrl && e.key.toLowerCase() === "l") { e.preventDefault(); bloquear(); }
    else if (ctrl && e.key.toLowerCase() === "n") { e.preventDefault(); novaConversa(); }
    else if (ctrl && e.code === "Space") { e.preventDefault(); falarAgora(); }
    else if (e.key === "F11") { e.preventDefault(); api().tela_cheia(); }
    else if (e.key === "Escape") { fecharModal(); fecharGavetas(); if (estado.falando) api().fala_parar(); }
  });

  setInterval(() => {
    $("#st-hora").textContent = new Date().toLocaleTimeString("pt-BR");
  }, 1000);
}

// ===================== Início =====================

async function iniciar() {
  estado.cfg = await api().inicial();
  const { cfg } = estado;

  for (const [id, icone] of [["#bt-esquerda", "esquerda"], ["#bt-direita", "direita"], ["#bt-nova", "nova"],
    ["#bt-memorias", "memorias"], ["#bt-tarefas", "tarefas"], ["#bt-bloquear", "bloquear"],
    ["#bt-tela", "tela"], ["#modal-fechar", "fechar"], ["#bt-enviar", "enviar"],
    ["#bt-mic", "mic"], ["#bt-escuta", "escuta"]]) {
    $(id).innerHTML = svg(icone);
  }
  for (const i of document.querySelectorAll("[data-icone]")) i.outerHTML = svg(i.dataset.icone);
  if (!cfg.tem_pin) $("#bt-bloquear").classList.add("oculto");

  $("#st-modelo").textContent = cfg.modelo;
  $("#st-esforco").textContent = cfg.esforco;
  $("#inf-chave").textContent = cfg.chave;
  $("#inf-web").textContent = cfg.busca_web ? "LIGADA" : "DESLIGADA";
  $("#inf-versao").textContent = cfg.versao;
  if (cfg.voz) {
    $("#bt-mic").classList.remove("oculto");
    $("#bt-escuta").classList.remove("oculto");
    estado.escutaContinua = cfg.escuta_continua;
    $("#bt-escuta").classList.toggle("escutando", cfg.escuta_continua);
    $("#inf-voz").textContent = cfg.escuta_continua ? "ESCUTANDO" : "SOB DEMANDA";
  } else {
    $("#inf-voz").textContent = "DESLIGADA";
  }

  aplicarZoom(zoomInicial());
  desenharMostrador();
  orbe = criarOrbe($("#orbe"));
  ligarEventos();
  vigiarInatividade();
  definirLegenda(saudacao());
  if (cfg.aviso_permissoes) aviso("As permissões do .env estavam abertas e foram corrigidas para 600.");

  if (cfg.bloqueado) mostrarBloqueio();
  else {
    await atualizarEstado();
    $("#entrada").focus();
  }
}

if (window.pywebview && window.pywebview.api) iniciar();
else window.addEventListener("pywebviewready", iniciar, { once: true });
