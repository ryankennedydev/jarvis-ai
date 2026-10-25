import { useEffect, useMemo, useRef, useState } from "react";
import { abrirLink, markdownToHtml } from "../../lib/markdown";
import {
  clearProjectTerminals, clearTerminal, listProjectFiles, loadTerminals, openProjectFolder, planProject, runProject, sendToTerminal,
  stopProject, stopTerminal, terminalsAvailable,
} from "../../services/projectRunner";
import { useStore } from "../../store/useStore";
import type { Agent, Project, ProjectTask, TerminalState } from "../../types";
import { Avatar } from "../ui/Avatar";
import { CloseIcon, PlusIcon, SendIcon, StopIcon, TrashIcon } from "../ui/icons";

const terminalVazio: TerminalState = { lines: [], busy: false, thinking: false };

/** Aba Projetos: um terminal por agente, todos trabalhando ao mesmo tempo (estilo Maestri). */
export function ProjectsView() {
  const projects = useStore((s) => s.projects);
  const selectedId = useStore((s) => s.selectedProjectId);
  const projeto = projects.find((p) => p.id === selectedId) ?? projects[0];

  return (
    <div className="flex h-full flex-col lg:flex-row">
      <ListaProjetos projects={projects} selecionado={projeto?.id ?? null} />
      <section className="min-h-0 min-w-0 flex-1 overflow-y-auto">
        {projeto ? <Projeto key={projeto.id} projeto={projeto} /> : <SemProjeto />}
      </section>
    </div>
  );
}

function ListaProjetos({ projects, selecionado }: { projects: Project[]; selecionado: string | null }) {
  const running = useStore((s) => s.running);
  const { selectProject, addProject } = useStore.getState();
  return (
    <aside className="flex shrink-0 gap-2 overflow-x-auto border-b border-white/5 bg-black/30 p-3 lg:w-64 lg:flex-col lg:overflow-y-auto lg:border-b-0 lg:border-r">
      <button onClick={() => addProject("Novo projeto", "", [])}
              className="flex shrink-0 items-center justify-center gap-1.5 rounded-xl border border-neon/30 px-3 py-2 text-xs font-medium text-neon transition hover:border-neon hover:shadow-[0_0_16px_rgba(196,255,61,0.25)]">
        <PlusIcon className="h-3.5 w-3.5" /> Novo projeto
      </button>
      {projects.map((p) => {
        const feitas = p.tasks.filter((t) => t.status === "feita").length;
        return (
          <button key={p.id} onClick={() => selectProject(p.id)}
                  className={`shrink-0 rounded-xl border px-3 py-2 text-left transition lg:w-full
                    ${p.id === selecionado ? "border-neon/50 bg-neon/10" : "border-white/5 hover:border-white/20"}`}>
            <div className="flex items-center gap-2">
              {running[p.id] && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />}
              <span className="truncate text-sm font-medium text-white">{p.name}</span>
            </div>
            <div className="mt-0.5 text-[11px] text-zinc-500">
              {p.agentIds.length} agentes · {feitas}/{p.tasks.length} tarefas
            </div>
          </button>
        );
      })}
    </aside>
  );
}

function SemProjeto() {
  return (
    <div className="grid h-full place-items-center p-8 text-center">
      <div>
        <p className="text-sm text-zinc-300">Nenhum projeto ainda.</p>
        <p className="mt-1 max-w-sm text-xs text-zinc-500">
          Crie um projeto, escolha os agentes e cada um ganha um terminal próprio. Todos trabalham ao mesmo tempo.
        </p>
      </div>
    </div>
  );
}

function Projeto({ projeto }: { projeto: Project }) {
  const agents = useStore((s) => s.agents);
  const sectors = useStore((s) => s.sectors);
  const rodando = useStore((s) => !!s.running[projeto.id]);
  const terminais = useStore((s) => s.terminals[projeto.id]);
  const { updateProject, deleteProject } = useStore.getState();
  const [planejando, setPlanejando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const disponivel = terminalsAvailable();

  useEffect(() => { void loadTerminals(projeto.id); }, [projeto.id]);

  const equipe = useMemo(() => projeto.agentIds.map((id) => agents.find((a) => a.id === id)).filter(Boolean) as Agent[],
                         [projeto.agentIds, agents]);
  const feitas = projeto.tasks.filter((t) => t.status === "feita").length;
  const total = projeto.tasks.length;
  const trabalhando = equipe.filter((a) => terminais?.[a.id]?.busy).length;
  const pendentes = projeto.tasks.some((t) => t.status === "pendente" || t.status === "erro");

  const planejar = async () => {
    setPlanejando(true); setAviso(null);
    const erro = await planProject(projeto.id);
    setPlanejando(false);
    if (erro) setAviso(erro);
  };
  const executar = () => {
    // Tarefas que falharam voltam para a fila antes de rodar de novo.
    for (const t of projeto.tasks) if (t.status === "erro") useStore.getState().updateTask(projeto.id, t.id, { status: "pendente" });
    runProject(projeto.id);
  };
  const apagar = async () => {
    if (!confirm(`Apagar o projeto "${projeto.name}" e os terminais dele?`)) return;
    stopProject(projeto.id);
    await clearProjectTerminals(projeto.id);
    deleteProject(projeto.id);
  };

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <div className="rounded-2xl border border-white/5 bg-black/40 p-4 backdrop-blur">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <input value={projeto.name} onChange={(e) => updateProject(projeto.id, { name: e.target.value })}
                   aria-label="Nome do projeto"
                   className="w-full bg-transparent text-xl font-semibold text-white outline-none placeholder:text-zinc-600" />
            <textarea value={projeto.goal} rows={2} onChange={(e) => updateProject(projeto.id, { goal: e.target.value })}
                      placeholder="Objetivo do projeto: o que a equipe precisa entregar?"
                      className="mt-1 w-full resize-y bg-transparent text-sm text-zinc-300 outline-none placeholder:text-zinc-600" />
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={planejar} disabled={!disponivel || planejando || rodando || !equipe.length || !projeto.goal.trim()}
                    title="O gerente lê o objetivo e cria as tarefas de cada agente"
                    className="rounded-xl border border-white/10 px-3 py-2 text-xs text-zinc-200 transition hover:border-neon/40 hover:text-neon disabled:opacity-30">
              {planejando ? "Planejando…" : "Planejar com IA"}
            </button>
            {rodando ? (
              <button onClick={() => stopProject(projeto.id)}
                      className="flex items-center gap-1.5 rounded-xl bg-white/10 px-3 py-2 text-xs font-semibold text-white">
                <StopIcon className="h-3.5 w-3.5" /> Parar tudo
              </button>
            ) : (
              <button onClick={executar} disabled={!disponivel || !pendentes}
                      className="rounded-xl bg-neon px-4 py-2 text-xs font-semibold text-black transition hover:shadow-[0_0_18px_rgba(196,255,61,0.45)] disabled:opacity-30">
                Executar tudo
              </button>
            )}
            <BotaoArquivos projetoId={projeto.id} desabilitado={!disponivel} versao={feitas} />
            <button onClick={apagar} title="Apagar projeto" aria-label="Apagar projeto"
                    className="grid h-8 w-8 place-items-center rounded-xl text-zinc-500 hover:bg-white/5 hover:text-red-300">
              <TrashIcon className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-3 text-[11px] uppercase tracking-[0.18em] text-zinc-500">
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/5">
            <div className="h-full bg-neon transition-[width] duration-500" style={{ width: `${total ? (feitas / total) * 100 : 0}%` }} />
          </div>
          <span>{feitas}/{total} feitas</span>
          <span className={trabalhando ? "text-white" : ""}>{trabalhando} trabalhando</span>
        </div>
        {aviso && <p className="mt-2 text-sm text-red-300">{aviso}</p>}
        {!disponivel && <p className="mt-2 text-xs text-zinc-500">Os terminais funcionam com o Work aberto dentro do Jarvis.</p>}

        <EscolherEquipe projeto={projeto} agents={agents} sectors={sectors} />
      </div>

      {equipe.length ? (
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {equipe.map((a) => (
            <Terminal key={a.id} projeto={projeto} agente={a} estado={terminais?.[a.id] ?? terminalVazio}
                      tarefas={projeto.tasks.filter((t) => t.agentId === a.id)} desabilitado={!disponivel} />
          ))}
        </div>
      ) : (
        <p className="py-10 text-center text-sm text-zinc-500">Adicione agentes ao projeto para abrir os terminais.</p>
      )}
    </div>
  );
}

/** Abre a pasta onde os bots do projeto salvam o que produzem. */
function BotaoArquivos({ projetoId, desabilitado, versao }: { projetoId: string; desabilitado: boolean; versao: number }) {
  const [total, setTotal] = useState(0);
  useEffect(() => { if (!desabilitado) void listProjectFiles(projetoId).then((l) => setTotal(l.length)); }, [projetoId, desabilitado, versao]);
  return (
    <button onClick={() => void openProjectFolder(projetoId)} disabled={desabilitado}
            title="Abrir a pasta com os arquivos que os bots criaram"
            className="rounded-xl border border-white/10 px-3 py-2 text-xs text-zinc-200 transition hover:border-neon/40 hover:text-neon disabled:opacity-30">
      Arquivos{total ? ` (${total})` : ""}
    </button>
  );
}

function EscolherEquipe({ projeto, agents, sectors }: { projeto: Project; agents: Agent[]; sectors: { id: string; name: string }[] }) {
  const [aberto, setAberto] = useState(false);
  const { updateProject } = useStore.getState();
  const alternar = (id: string) => updateProject(projeto.id, {
    agentIds: projeto.agentIds.includes(id) ? projeto.agentIds.filter((x) => x !== id) : [...projeto.agentIds, id],
  });
  return (
    <div className="mt-3">
      <button onClick={() => setAberto(!aberto)} className="text-xs text-neon/80 hover:text-neon">
        {aberto ? "Fechar equipe" : `Equipe do projeto (${projeto.agentIds.length}) · editar`}
      </button>
      {aberto && (
        <div className="mt-2 space-y-2">
          {sectors.map((s) => {
            const doSetor = agents.filter((a) => a.sectorId === s.id);
            if (!doSetor.length) return null;
            return (
              <div key={s.id} className="flex flex-wrap items-center gap-1.5">
                <span className="w-24 shrink-0 text-[11px] uppercase tracking-[0.15em] text-zinc-500">{s.name}</span>
                {doSetor.map((a) => {
                  const dentro = projeto.agentIds.includes(a.id);
                  return (
                    <button key={a.id} onClick={() => alternar(a.id)} title={a.role}
                            className={`rounded-full border px-2.5 py-1 text-[11px] transition ${a.status === "inativo" ? "opacity-40" : ""}
                              ${dentro ? "border-neon/60 bg-neon/15 text-neon" : "border-white/10 text-zinc-400 hover:text-white"}`}>
                      {dentro ? "✓ " : "+ "}{a.name}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const ROTULO: Record<ProjectTask["status"], string> = { pendente: "na fila", rodando: "rodando", feita: "feita", erro: "falhou" };
const COR: Record<ProjectTask["status"], string> = {
  pendente: "border-white/10 text-zinc-400",
  rodando: "border-white/60 text-white animate-pulse",
  feita: "border-neon/50 text-neon",
  erro: "border-red-500/40 text-red-300",
};

function Terminal({ projeto, agente, estado, tarefas, desabilitado }:
  { projeto: Project; agente: Agent; estado: TerminalState; tarefas: ProjectTask[]; desabilitado: boolean }) {
  const [texto, setTexto] = useState("");
  const [novaTarefa, setNovaTarefa] = useState("");
  const saida = useRef<HTMLDivElement>(null);
  const { addTasks, removeTask, updateProject } = useStore.getState();
  const inativo = agente.status !== "ativo";

  useEffect(() => {
    const el = saida.current;
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 120) el.scrollTop = el.scrollHeight;
  }, [estado.lines]);

  const enviar = () => {
    if (estado.busy) { void stopTerminal(projeto.id, agente.id); return; }
    if (!texto.trim()) return;
    void sendToTerminal(projeto.id, agente.id, texto);
    setTexto("");
  };
  const adicionarTarefa = () => {
    if (!novaTarefa.trim()) return;
    addTasks(projeto.id, [{ agentId: agente.id, title: novaTarefa }]);
    setNovaTarefa("");
  };

  return (
    <article className={`flex h-[30rem] flex-col overflow-hidden rounded-2xl border bg-[#050805]/90 transition
      ${estado.busy ? "border-white/40 shadow-[0_0_28px_rgba(255,255,255,0.08)]" : "border-neon/15"}`}>
      <header className="flex items-center gap-2.5 border-b border-white/5 px-3 py-2.5">
        <Avatar name={agente.name} size="h-8 w-8 text-[10px]" working={estado.busy} inactive={inativo} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-white">{agente.name}</div>
          <div className="truncate text-[11px] text-zinc-500">{agente.role}</div>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.15em]
          ${estado.busy ? "bg-white/10 text-white" : inativo ? "text-zinc-600" : "text-neon/70"}`}>
          {estado.busy ? (estado.thinking ? "pensando" : "escrevendo") : inativo ? "inativo" : "livre"}
        </span>
        <button onClick={() => confirm(`Limpar o terminal de ${agente.name}?`) && clearTerminal(projeto.id, agente.id)}
                disabled={estado.busy || !estado.lines.length} title="Limpar terminal" aria-label="Limpar terminal"
                className="grid h-7 w-7 place-items-center rounded-lg text-zinc-600 hover:bg-white/5 hover:text-neon disabled:opacity-30">
          <TrashIcon className="h-3.5 w-3.5" />
        </button>
        <button onClick={() => updateProject(projeto.id, { agentIds: projeto.agentIds.filter((x) => x !== agente.id) })}
                disabled={estado.busy} title="Tirar do projeto" aria-label="Tirar do projeto"
                className="grid h-7 w-7 place-items-center rounded-lg text-zinc-600 hover:bg-white/5 hover:text-white disabled:opacity-30">
          <CloseIcon className="h-3.5 w-3.5" />
        </button>
      </header>

      <div className="max-h-28 space-y-1 overflow-y-auto border-b border-white/5 px-3 py-2">
        {tarefas.map((t) => (
          <div key={t.id} className="group flex items-start gap-2 text-xs">
            <span className={`mt-0.5 shrink-0 rounded border px-1.5 text-[9px] uppercase tracking-wider ${COR[t.status]}`}>{ROTULO[t.status]}</span>
            <span className={`min-w-0 flex-1 ${t.status === "feita" ? "text-zinc-500 line-through decoration-neon/40" : "text-zinc-300"}`}>{t.title}</span>
            {t.status !== "rodando" && (
              <button onClick={() => removeTask(projeto.id, t.id)} aria-label="Remover tarefa"
                      className="text-zinc-600 opacity-0 transition hover:text-red-300 group-hover:opacity-100">×</button>
            )}
          </div>
        ))}
        <div className="flex items-center gap-1.5">
          <input value={novaTarefa} onChange={(e) => setNovaTarefa(e.target.value)}
                 onKeyDown={(e) => { if (e.key === "Enter") adicionarTarefa(); }}
                 placeholder="+ tarefa na fila" aria-label={`Nova tarefa para ${agente.name}`}
                 className="min-w-0 flex-1 bg-transparent py-0.5 text-xs text-zinc-300 outline-none placeholder:text-zinc-600" />
        </div>
      </div>

      <div ref={saida} className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-2 font-mono text-[12px] leading-relaxed"
           onClick={(e) => {
             const link = (e.target as HTMLElement).closest("a[data-href]");
             if (link) { e.preventDefault(); abrirLink(link.getAttribute("data-href") ?? ""); }
           }}>
        {!estado.lines.length && (
          <p className="pt-6 text-center font-sans text-xs text-zinc-600">Terminal de {agente.name}. Mande uma tarefa ou adicione na fila.</p>
        )}
        {estado.lines.map((l, i) => l.papel === "voce" ? (
          <div key={i} className="whitespace-pre-wrap text-neon"><span className="select-none text-neon/50">❯ </span>{l.texto}</div>
        ) : l.papel === "funcao" ? (
          <div key={i} className="flex items-center gap-1.5 text-[11px] text-sky-300/90">
            <span className="select-none">⚙</span><span className="truncate">{l.texto}</span>
          </div>
        ) : l.papel === "erro" ? (
          <div key={i} className="text-red-300">✕ {l.texto}</div>
        ) : (
          <div key={i} className="markdown font-sans text-[13px] text-zinc-200"
               // markdownToHtml escapa todo o texto antes de montar o HTML.
               dangerouslySetInnerHTML={{ __html: markdownToHtml(l.texto) }} />
        ))}
        {estado.busy && estado.thinking && (
          <div className="flex items-center gap-1 text-zinc-500">
            {[0, 1, 2].map((i) => (
              <span key={i} className="h-1 w-1 animate-bounce rounded-full bg-white/70" style={{ animationDelay: `${i * 0.15}s` }} />
            ))}
          </div>
        )}
      </div>

      <div className="flex items-end gap-1.5 border-t border-white/5 p-2">
        <textarea rows={1} value={texto} disabled={desabilitado || inativo}
                  onChange={(e) => setTexto(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(); } }}
                  placeholder={inativo ? "Agente inativo" : `Falar direto com ${agente.name}…`}
                  className="max-h-24 min-h-8 flex-1 resize-none bg-transparent px-2 py-1.5 font-mono text-xs text-white outline-none placeholder:text-zinc-600 disabled:opacity-40" />
        <button onClick={enviar} disabled={desabilitado || inativo || (!estado.busy && !texto.trim())}
                title={estado.busy ? "Parar" : "Enviar"} aria-label={estado.busy ? "Parar" : "Enviar"}
                className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg transition disabled:opacity-30
                  ${estado.busy ? "bg-white/10 text-white" : "bg-neon text-black"}`}>
          {estado.busy ? <StopIcon className="h-3.5 w-3.5" /> : <SendIcon className="h-3.5 w-3.5" />}
        </button>
      </div>
    </article>
  );
}
