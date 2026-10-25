/**
 * Projetos estilo Maestri: cada agente do projeto tem um terminal de IA próprio,
 * e todos trabalham ao mesmo tempo. Quem roda as IAs é o Python (jarvis/work_agentes.py).
 *
 * "Executar tudo" liga o projeto: cada agente livre pega a próxima tarefa pendente
 * da sua fila e, ao terminar, já puxa a seguinte. Os agentes não esperam uns pelos outros.
 */
import { functionsOf, NOME_FUNCAO } from "../lib/botFunctions";
import { useStore } from "../store/useStore";
import type { Project } from "../types";

interface TerminalApi {
  work_terminal_enviar(contexto: string, texto: string): Promise<boolean>;
  work_terminal_historico(projetoId: string): Promise<{
    terminais: Record<string, Array<{ papel: "voce" | "agente"; texto: string }>>;
    ocupados: string[];
  }>;
  work_terminal_limpar(projetoId: string, agenteId?: string): Promise<void>;
  work_terminal_parar(projetoId: string, agenteId?: string): Promise<void>;
  work_abrir_pasta(escopo: string): Promise<void>;
  work_listar_arquivos(escopo: string): Promise<string[]>;
  work_projeto_planejar(contexto: string): Promise<{ tarefas?: Array<{ agentId: string; title: string }>; erro?: string }>;
}

function api(): TerminalApi | null {
  try {
    const p = (window.parent as unknown as { pywebview?: { api?: Partial<TerminalApi> } })?.pywebview?.api;
    return p?.work_terminal_enviar ? (p as TerminalApi) : null;
  } catch {
    return null;
  }
}

export const terminalsAvailable = () => api() !== null;

const projeto = (id: string) => useStore.getState().projects.find((p) => p.id === id);

/** Contexto que o agente recebe: o projeto, os colegas e o que já foi entregue. */
function contexto(p: Project, agentId: string, tarefaId?: string) {
  const loja = useStore.getState();
  const porId = new Map(loja.agents.map((a) => [a.id, a]));
  const agente = porId.get(agentId)!;
  return {
    empresa: loja.companyName,
    projeto: { id: p.id, name: p.name, goal: p.goal },
    agente: { id: agente.id, name: agente.name, role: agente.role, instructions: agente.instructions, functions: functionsOf(agente) },
    colegas: p.agentIds.map((id) => porId.get(id)).filter(Boolean).map((a) => ({ id: a!.id, name: a!.name, role: a!.role })),
    mural: p.tasks.filter((t) => t.status === "feita" && t.result).map((t) => ({
      agente: porId.get(t.agentId)?.name ?? "Agente", titulo: t.title, resumo: t.result!,
    })),
    tarefaId,
  };
}

export async function loadTerminals(projectId: string) {
  const ponte = api();
  if (!ponte) return;
  const { terminais, ocupados } = await ponte.work_terminal_historico(projectId);
  const loja = useStore.getState();
  for (const [agentId, linhas] of Object.entries(terminais)) {
    loja.setTerminal(projectId, agentId, { lines: linhas, busy: ocupados.includes(agentId) });
  }
}

/** Manda um pedido direto para o terminal de um agente. */
export async function sendToTerminal(projectId: string, agentId: string, texto: string, tarefaId?: string): Promise<boolean> {
  const ponte = api();
  const p = projeto(projectId);
  const loja = useStore.getState();
  if (!ponte || !p || !texto.trim() || loja.terminals[projectId]?.[agentId]?.busy) return false;
  if (!loja.agents.some((a) => a.id === agentId)) return false;

  loja.pushTerminal(projectId, agentId, { papel: "voce", texto: texto.trim() });
  loja.setTerminal(projectId, agentId, { busy: true, thinking: true });
  if (tarefaId) loja.updateTask(projectId, tarefaId, { status: "rodando" });
  const aceito = await ponte.work_terminal_enviar(JSON.stringify(contexto(p, agentId, tarefaId)), texto);
  if (!aceito) {
    loja.setTerminal(projectId, agentId, { busy: false, thinking: false });
    if (tarefaId) loja.updateTask(projectId, tarefaId, { status: "pendente" });
  }
  return aceito;
}

/** Se o agente estiver livre, ele pega a próxima tarefa pendente da fila dele. */
function puxarProxima(projectId: string, agentId: string) {
  const p = projeto(projectId);
  const loja = useStore.getState();
  if (!p || !loja.running[projectId] || loja.terminals[projectId]?.[agentId]?.busy) return;
  const agente = loja.agents.find((a) => a.id === agentId);
  if (!agente || agente.status !== "ativo") return;
  const tarefa = p.tasks.find((t) => t.agentId === agentId && t.status === "pendente");
  if (tarefa) void sendToTerminal(projectId, agentId, tarefa.title, tarefa.id);
}

function verificarFim(projectId: string) {
  const p = projeto(projectId);
  const loja = useStore.getState();
  if (!p || !loja.running[projectId]) return;
  const ativos = new Set(loja.agents.filter((a) => a.status === "ativo").map((a) => a.id));
  const restam = p.tasks.some((t) => t.status === "rodando" || (t.status === "pendente" && ativos.has(t.agentId)));
  if (!restam) loja.setRunning(projectId, false);
}

/** Liga o projeto: todos os agentes começam juntos, cada um na sua fila. */
export function runProject(projectId: string) {
  const p = projeto(projectId);
  if (!p) return;
  useStore.getState().setRunning(projectId, true);
  for (const agentId of new Set(p.tasks.map((t) => t.agentId))) puxarProxima(projectId, agentId);
  verificarFim(projectId);
}

export function stopProject(projectId: string) {
  useStore.getState().setRunning(projectId, false);
  void api()?.work_terminal_parar(projectId);
}

export const stopTerminal = (projectId: string, agentId: string) => api()?.work_terminal_parar(projectId, agentId);

export async function clearTerminal(projectId: string, agentId: string) {
  await api()?.work_terminal_limpar(projectId, agentId);
  useStore.getState().setTerminal(projectId, agentId, { lines: [] });
}

/** Pasta onde os bots do projeto salvam os arquivos. */
export const openProjectFolder = (projectId: string) => api()?.work_abrir_pasta(projectId);
export const listProjectFiles = async (projectId: string) => (await api()?.work_listar_arquivos(projectId)) ?? [];

export async function clearProjectTerminals(projectId: string) {
  await api()?.work_terminal_limpar(projectId);
}

/** O gerente lê o objetivo e cria as tarefas de cada agente. Devolve a mensagem de erro, se houver. */
export async function planProject(projectId: string): Promise<string | null> {
  const ponte = api();
  const p = projeto(projectId);
  if (!ponte) return "Os projetos funcionam com o Work aberto dentro do Jarvis.";
  if (!p) return "Projeto não encontrado.";
  const loja = useStore.getState();
  const agentes = loja.agents.filter((a) => p.agentIds.includes(a.id));
  const setor = loja.sectors.find((s) => s.id === agentes[0]?.sectorId);
  const resposta = await ponte.work_projeto_planejar(JSON.stringify({
    empresa: loja.companyName, gerente: setor?.manager.name,
    projeto: { id: p.id, name: p.name, goal: p.goal },
    agentes: agentes.map((a) => ({ id: a.id, name: a.name, role: a.role, status: a.status, functions: functionsOf(a) })),
  }));
  if (resposta.erro) return resposta.erro;
  loja.addTasks(projectId, resposta.tarefas ?? []);
  return null;
}

// --- Eventos vindos do Python (repassados por managerChat.workEvento) -------------
type Evento = { projeto: string; agente: string; tarefa?: string | null; texto?: string; estado?: string; resultado?: string; nome?: string };

export function terminalEvento(tipo: string, dado: Evento): boolean {
  const loja = useStore.getState();
  const { projeto: projectId, agente: agentId } = dado;
  switch (tipo) {
    case "terminal_inicio":
      loja.setTerminal(projectId, agentId, { busy: true, thinking: true });
      loja.setAgentWorking(agentId, true);
      return true;
    case "terminal_pensando":
      loja.setTerminal(projectId, agentId, { thinking: true });
      return true;
    case "terminal_funcao": {
      // O bot está executando uma função de verdade (pesquisa, arquivo, cálculo…).
      const acao = NOME_FUNCAO[dado.nome ?? ""] ?? dado.nome ?? "executando";
      loja.pushTerminal(projectId, agentId, dado.estado === "erro"
        ? { papel: "erro", texto: `${dado.nome} falhou: ${dado.texto ?? ""}` }
        : { papel: "funcao", texto: `${acao}${dado.texto ? `: ${dado.texto}` : ""}` });
      loja.setTerminal(projectId, agentId, { thinking: true });
      return true;
    }
    case "terminal_texto":
      loja.appendTerminal(projectId, agentId, dado.texto ?? "");
      return true;
    case "terminal_fim": {
      const estado = dado.estado;
      if (estado === "erro") loja.pushTerminal(projectId, agentId, { papel: "erro", texto: dado.resultado ?? "Erro." });
      if (estado === "cancelado") loja.pushTerminal(projectId, agentId, { papel: "erro", texto: "Interrompido." });
      loja.setTerminal(projectId, agentId, { busy: false, thinking: false });
      loja.setAgentWorking(agentId, false);
      if (dado.tarefa) {
        loja.updateTask(projectId, dado.tarefa, estado === "feito"
          ? { status: "feita", result: dado.resultado ?? "" }
          : { status: estado === "cancelado" ? "pendente" : "erro" });
      }
      if (estado === "cancelado") loja.setRunning(projectId, false);
      // O agente que terminou já puxa a próxima tarefa, sem esperar os outros.
      puxarProxima(projectId, agentId);
      verificarFim(projectId);
      return true;
    }
  }
  return false;
}
