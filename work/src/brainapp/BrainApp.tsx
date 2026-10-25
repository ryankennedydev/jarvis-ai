import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  abrirConversa, carregarConta, carregarDados, COR_PROVEDOR, dentroDoJarvis, esquecer,
  type Conta, type DadosBrain, type Habilidade,
} from "./brainApi";
import { KIND_COLOR, NeuralScene, REGIOES, type DataNeuron, type NeuronKind } from "./neuralScene";

interface Neuronio extends DataNeuron {
  subtitulo: string;
  corpo: string;
  acao?: { rotulo: string; fazer(): Promise<void> | void };
}

const ROTULO_TIPO: Record<NeuronKind, string> = {
  memoria: "Memória", conversa: "Conversa", tarefa: "Tarefa", habilidade: "Habilidade", agente: "Agente do Work",
};

const quando = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
};

function montarNeuronios(d: DadosBrain, habilidades: Habilidade[], recarregar: () => void): Neuronio[] {
  return [
    ...d.memorias.map((m): Neuronio => ({
      id: `m${m.id}`, kind: "memoria", title: m.texto, subtitulo: `${m.categoria} · ${quando(m.quando)}`, corpo: m.texto,
      acao: { rotulo: "Esquecer esta memória", fazer: async () => {
        if (confirm("O Jarvis vai esquecer esta memória. Continuar?")) { await esquecer(m.id); recarregar(); }
      } },
    })),
    ...d.conversas.map((c): Neuronio => ({
      id: `c${c.id}`, kind: "conversa", title: c.titulo, subtitulo: `pasta ${c.pasta} · ${quando(c.quando)}`, corpo: c.titulo,
      acao: { rotulo: "Abrir no Assistente", fazer: () => abrirConversa(c.id) },
    })),
    ...d.tarefas.map((t): Neuronio => ({
      id: `t${t.id}`, kind: "tarefa", title: t.texto,
      subtitulo: `${t.feita ? "concluída" : "pendente"}${t.prazo ? ` · prazo ${t.prazo}` : ""}`, corpo: t.texto,
    })),
    ...habilidades.map((h): Neuronio => ({
      id: `h${h.nome}`, kind: "habilidade", title: h.nome.replace(/_/g, " "), subtitulo: h.tipo, corpo: h.descricao,
    })),
    ...d.agentes.map((a): Neuronio => ({
      id: `a${a.id}`, kind: "agente", title: a.nome, subtitulo: `${a.funcao} · ${a.setor}`, corpo: `${a.nome}: ${a.funcao}, setor ${a.setor}.`,
    })),
  ];
}

export default function BrainApp() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cenaRef = useRef<NeuralScene | null>(null);
  const rotulosRef = useRef<Partial<Record<NeuronKind, HTMLDivElement | null>>>({});
  const [dados, setDados] = useState<DadosBrain | null>(null);
  const [conta, setConta] = useState<Conta | null>(null);
  const [habilidades, setHabilidades] = useState<Habilidade[]>([]);
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);
  const [selecionado, setSelecionado] = useState<number | null>(null);
  const [filtro, setFiltro] = useState<Set<NeuronKind>>(() => new Set(Object.keys(KIND_COLOR) as NeuronKind[]));
  const [busca, setBusca] = useState("");
  const [girando, setGirando] = useState(true);
  const [atividade, setAtividade] = useState("REPOUSO");
  const [painel, setPainel] = useState(true);
  const [verModelos, setVerModelos] = useState(false);

  const recarregar = useCallback(() => { void carregarDados().then(setDados); }, []);
  const neuronios = useMemo(() => (dados ? montarNeuronios(dados, habilidades, recarregar) : []), [dados, habilidades, recarregar]);
  const neuroniosRef = useRef(neuronios);
  neuroniosRef.current = neuronios;
  const accent = conta ? COR_PROVEDOR[conta.provedor] ?? "#c4ff3d" : null;

  // Carrega conta (define a cor do cérebro) e dados.
  useEffect(() => {
    void carregarConta().then(({ conta, habilidades }) => { setConta(conta); setHabilidades(habilidades); });
    recarregar();
    const w = window as unknown as { brainAtualizar?: () => void };
    w.brainAtualizar = recarregar;
  }, [recarregar]);

  // A cena nasce quando a cor da conta é conhecida.
  useEffect(() => {
    if (!accent) return;
    const canvas = canvasRef.current!;
    const cena = new NeuralScene(canvas, accent, {
      onHover: (i, x, y) => setHover(i === null ? null : { i, x, y }),
      onSelect: (i) => setSelecionado(i),
    });
    cenaRef.current = cena;
    const obs = new ResizeObserver(([e]) => cena.resize(e!.contentRect.width, e!.contentRect.height));
    obs.observe(canvas);
    let quadro = 0;
    const laco = () => { cena.render(); quadro = requestAnimationFrame(laco); };
    quadro = requestAnimationFrame(laco);

    // Eventos do Jarvis (repassados pela interface principal) acendem o cérebro.
    let apagar: ReturnType<typeof setTimeout> | undefined;
    const w = window as unknown as { brainEvento?: (tipo: string, dado: unknown) => void };
    w.brainEvento = (tipo, dado) => {
      clearTimeout(apagar);
      if (tipo === "pensando" || tipo === "ferramenta") { cena.estimular(1, true); setAtividade("PENSANDO"); }
      else if (tipo === "texto") { cena.estimular(0.8); setAtividade("RESPONDENDO"); }
      else if (tipo === "fala_nivel" && typeof dado === "number") { cena.estimular(0.45 + dado * 0.6); setAtividade("FALANDO"); }
      else if (tipo === "voz_nivel" && typeof dado === "number" && dado > 0.05) { cena.estimular(0.3 + dado * 0.4); setAtividade("OUVINDO"); }
      else if (tipo === "fim" || tipo === "erro") { cena.estimular(0.4); }
      apagar = setTimeout(() => { cena.estimular(0.15); setAtividade("REPOUSO"); }, 1800);
    };
    return () => { cancelAnimationFrame(quadro); obs.disconnect(); cena.dispose(); cenaRef.current = null; delete w.brainEvento; };
  }, [accent]);

  useEffect(() => {
    const cena = cenaRef.current;
    if (!cena) return;
    cena.setDados(neuronios);
    cena.rotulos = Object.fromEntries(Object.entries(rotulosRef.current).filter(([, el]) => el)) as unknown as Record<NeuronKind, HTMLElement>;
    setSelecionado(null);
  }, [neuronios, accent]);
  useEffect(() => { cenaRef.current?.setFiltro(filtro); }, [filtro, accent]);
  useEffect(() => { cenaRef.current?.setBusca(busca); }, [busca, accent]);
  useEffect(() => { cenaRef.current?.setSelecionado(selecionado); }, [selecionado]);

  const contagem = useMemo(() => {
    const c: Record<NeuronKind, number> = { memoria: 0, conversa: 0, tarefa: 0, habilidade: 0, agente: 0 };
    for (const n of neuronios) c[n.kind]++;
    return c;
  }, [neuronios]);
  const resultados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return termo ? neuronios.map((n, i) => ({ n, i })).filter(({ n }) => n.title.toLowerCase().includes(termo)).slice(0, 8) : [];
  }, [busca, neuronios]);

  const alternarTipo = (k: NeuronKind) => setFiltro((f) => {
    const novo = new Set(f);
    if (novo.has(k)) novo.delete(k); else novo.add(k);
    return novo;
  });
  const sel = selecionado !== null ? neuronios[selecionado] : undefined;
  const hov = hover ? neuronios[hover.i] : undefined;
  const cor = accent ?? "#c4ff3d";

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#010203] text-zinc-200" style={{ ["--accent" as string]: cor }}>
      <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full cursor-grab touch-none" aria-label="Cérebro 3D do Jarvis" />

      {/* Rótulos das regiões (posicionados pela cena a cada quadro) */}
      <div className="pointer-events-none absolute inset-0">
        {REGIOES.map(({ kind, nome }) => (
          <div key={kind} ref={(el) => { rotulosRef.current[kind] = el; }}
               className="absolute left-0 top-0 whitespace-nowrap text-[10px] uppercase tracking-[0.25em] transition-opacity duration-300"
               style={{ color: KIND_COLOR[kind], textShadow: `0 0 12px ${KIND_COLOR[kind]}` }}>
            {nome.split(" · ")[0]} · {contagem[kind]}
          </div>
        ))}
      </div>

      {/* Cabeçalho */}
      <header className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-4">
        <div className="pointer-events-auto">
          <div className="text-[11px] uppercase tracking-[0.4em]" style={{ color: cor }}>J.A.R.V.I.S. · BRAIN</div>
          <div className="mt-0.5 text-lg font-semibold text-white">Cérebro de {dados?.nome ?? "…"}</div>
          <div className="mt-1 flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] text-zinc-500">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: cor, boxShadow: `0 0 10px ${cor}`, animation: atividade !== "REPOUSO" ? "pulse 1s infinite" : undefined }} />
            atividade neural · <span className="text-white">{atividade}</span> · {neuronios.length} neurônios de dados
          </div>
        </div>
        <div className="pointer-events-auto relative w-full max-w-xs">
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar no cérebro…"
                 aria-label="Buscar no cérebro"
                 className="w-full rounded-xl border border-white/10 bg-black/60 px-3 py-2 text-sm text-white outline-none backdrop-blur placeholder:text-zinc-600 focus:border-[var(--accent)]" />
          {resultados.length > 0 && (
            <div className="absolute inset-x-0 top-full mt-1 overflow-hidden rounded-xl border border-white/10 bg-black/85 backdrop-blur">
              {resultados.map(({ n, i }) => (
                <button key={n.id} onClick={() => { setSelecionado(i); setBusca(""); }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-white/5">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: KIND_COLOR[n.kind] }} />
                  <span className="truncate">{n.title}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      {/* Painel esquerdo: conta conectada, habilidades e regiões */}
      <button onClick={() => setPainel(!painel)}
              className="absolute bottom-4 left-4 z-10 rounded-lg border border-white/10 bg-black/60 px-3 py-1.5 text-xs text-zinc-300 backdrop-blur hover:text-white sm:hidden">
        {painel ? "Esconder painel" : "Painel"}
      </button>
      {painel && (
        <aside className="absolute bottom-14 left-4 top-28 z-10 flex w-[min(19rem,calc(100%-2rem))] flex-col gap-3 overflow-y-auto sm:bottom-4">
          <section className="rounded-2xl border bg-black/60 p-4 backdrop-blur" style={{ borderColor: `${cor}40` }}>
            <h2 className="text-[10px] uppercase tracking-[0.3em] text-zinc-500">Conta de IA conectada</h2>
            {conta ? (
              <>
                <div className="mt-2 text-base font-semibold text-white">{conta.empresa}</div>
                <div className="font-mono text-xs" style={{ color: cor }}>{conta.modelo}</div>
                <div className={`mt-2 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider
                  ${conta.status === "ok" ? "bg-emerald-500/10 text-emerald-300" : conta.status === "aviso" ? "bg-amber-500/10 text-amber-300" : "bg-red-500/10 text-red-300"}`}>
                  <span className="h-1.5 w-1.5 rounded-full bg-current" />
                  {conta.status === "ok" ? "chave válida" : conta.status === "aviso" ? "atenção" : "sem acesso"}
                </div>
                {conta.detalhe && <p className="mt-1.5 text-xs text-zinc-400">{conta.detalhe}</p>}
                <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                  <dt className="text-zinc-500">Chave</dt><dd className="truncate text-right font-mono text-zinc-300">{conta.chave}</dd>
                  <dt className="text-zinc-500">Raciocínio</dt><dd className="text-right text-zinc-300">{conta.esforco}</dd>
                  <dt className="text-zinc-500">Pela voz</dt><dd className="text-right text-zinc-300">{conta.esforco_voz}</dd>
                  <dt className="text-zinc-500">Agentes</dt><dd className="text-right text-zinc-300">{conta.esforco_agentes}</dd>
                </dl>
                {conta.modelos.length > 0 && (
                  <>
                    <button onClick={() => setVerModelos(!verModelos)} className="mt-3 text-[11px] hover:underline" style={{ color: cor }}>
                      {verModelos ? "Esconder" : "Ver"} modelos da conta ({conta.modelos.length})
                    </button>
                    {verModelos && (
                      <ul className="mt-1.5 max-h-40 space-y-0.5 overflow-y-auto font-mono text-[10px] text-zinc-400">
                        {conta.modelos.map((m) => <li key={m} className={m === conta.modelo ? "text-white" : ""}>{m === conta.modelo ? "▸ " : ""}{m}</li>)}
                      </ul>
                    )}
                  </>
                )}
              </>
            ) : <p className="mt-2 text-xs text-zinc-500">Conectando à conta…</p>}
          </section>

          <section className="rounded-2xl border border-white/10 bg-black/60 p-4 backdrop-blur">
            <h2 className="text-[10px] uppercase tracking-[0.3em] text-zinc-500">Habilidades · {habilidades.length}</h2>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {habilidades.map((h) => {
                const i = neuronios.findIndex((n) => n.id === `h${h.nome}`);
                return (
                  <button key={h.nome} onClick={() => i >= 0 && setSelecionado(i)} title={h.descricao}
                          className="rounded-full border px-2 py-0.5 text-[11px] transition hover:text-white"
                          style={{ borderColor: `${KIND_COLOR.habilidade}55`, color: KIND_COLOR.habilidade }}>
                    {h.nome.replace(/_/g, " ")}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="rounded-2xl border border-white/10 bg-black/60 p-4 backdrop-blur">
            <h2 className="text-[10px] uppercase tracking-[0.3em] text-zinc-500">Regiões</h2>
            <ul className="mt-2 space-y-1">
              {REGIOES.map(({ kind, nome }) => (
                <li key={kind}>
                  <button onClick={() => alternarTipo(kind)} aria-pressed={filtro.has(kind)}
                          className={`flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left text-xs transition hover:bg-white/5 ${filtro.has(kind) ? "" : "opacity-35"}`}>
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: KIND_COLOR[kind], boxShadow: `0 0 8px ${KIND_COLOR[kind]}` }} />
                    <span className="flex-1">{nome}</span>
                    <span className="tabular-nums text-zinc-500">{contagem[kind]}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      )}

      {/* Detalhe do neurônio escolhido */}
      {sel && (
        <aside className="absolute bottom-4 right-4 z-10 w-[min(22rem,calc(100%-2rem))] rounded-2xl border bg-black/75 p-4 backdrop-blur animate-[aparecer_.2s_ease]"
               style={{ borderColor: `${KIND_COLOR[sel.kind]}66`, boxShadow: `0 0 40px ${KIND_COLOR[sel.kind]}22` }}>
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <div className="text-[10px] uppercase tracking-[0.3em]" style={{ color: KIND_COLOR[sel.kind] }}>{ROTULO_TIPO[sel.kind]}</div>
              <div className="mt-1 text-sm font-semibold text-white">{sel.title}</div>
              <div className="text-[11px] text-zinc-500">{sel.subtitulo}</div>
            </div>
            <button onClick={() => setSelecionado(null)} aria-label="Fechar" className="text-zinc-500 hover:text-white">✕</button>
          </div>
          {sel.corpo !== sel.title && <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">{sel.corpo}</p>}
          {sel.acao && dentroDoJarvis() && (
            <button onClick={() => void sel.acao!.fazer()}
                    className="mt-3 rounded-lg border px-3 py-1.5 text-xs transition hover:bg-white/5"
                    style={{ borderColor: `${KIND_COLOR[sel.kind]}66`, color: KIND_COLOR[sel.kind] }}>
              {sel.acao.rotulo}
            </button>
          )}
        </aside>
      )}

      {/* Dica ao passar o mouse */}
      {hov && hover && hover.i !== selecionado && (
        <div className="pointer-events-none absolute z-20 max-w-xs rounded-lg border border-white/10 bg-black/85 px-2.5 py-1.5 text-xs backdrop-blur"
             style={{ left: hover.x + 14, top: hover.y + 14 }}>
          <div className="text-[9px] uppercase tracking-[0.25em]" style={{ color: KIND_COLOR[hov.kind] }}>{ROTULO_TIPO[hov.kind]}</div>
          <div className="line-clamp-2 text-white">{hov.title}</div>
        </div>
      )}

      {/* Controles */}
      <div className="absolute right-4 top-20 z-10 flex flex-col gap-2 sm:top-24">
        <BotaoHud onClick={() => { const c = cenaRef.current; if (c) { c.setGirar(!c.girando); setGirando(c.girando); } }}>
          {girando ? "Pausar giro" : "Girar"}
        </BotaoHud>
        <BotaoHud onClick={() => { cenaRef.current?.recentrar(); setGirando(true); setSelecionado(null); }}>Recentrar</BotaoHud>
        <BotaoHud onClick={recarregar}>Atualizar</BotaoHud>
      </div>
    </div>
  );
}

function BotaoHud({ onClick, children }: { onClick(): void; children: string }) {
  return (
    <button onClick={onClick}
            className="rounded-lg border border-white/10 bg-black/60 px-3 py-1.5 text-[11px] uppercase tracking-[0.15em] text-zinc-300 backdrop-blur transition hover:border-[var(--accent)] hover:text-white">
      {children}
    </button>
  );
}
