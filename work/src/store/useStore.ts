/**
 * Estado global do Work. Toda regra de dados mora aqui (componentes só leem e chamam ações).
 * Qualquer mudança em empresa/setores/agentes é salva pela camada services/storage.
 */
import { create } from "zustand";
import { defaultManager, emptyCompany, sampleCompany } from "../data/seed";
import { getRepository } from "../services/storage";
import { newId } from "../lib/util";
import type {
  Agent, AgentDraft, ChatEntry, CompanyData, Manager, Project, ProjectTask, Sector, SectorDraft, Tab,
  TerminalLine, TerminalState,
} from "../types";

type Modal =
  | { kind: "none" }
  | { kind: "sector"; editingId?: string }
  | { kind: "manager"; sectorId: string }
  | { kind: "agent"; editingId?: string; presetSectorId?: string }
  | { kind: "deleteSector"; sectorId: string }
  | { kind: "settings" };

interface ChatState {
  entries: ChatEntry[];
  busy: boolean;
  loaded: boolean;
}

interface WorkState {
  loaded: boolean;
  companyName: string;
  sectors: Sector[];
  agents: Agent[];
  projects: Project[];

  // Projetos (terminais não são salvos aqui: o histórico fica no Python)
  selectedProjectId: string | null;
  /** terminais[projetoId][agenteId] */
  terminals: Record<string, Record<string, TerminalState>>;
  /** Projetos com "executar tudo" ligado: cada agente puxa a próxima tarefa ao terminar. */
  running: Record<string, true>;

  // Interface
  tab: Tab;
  selectedSectorId: string | null;
  hoveredSectorId: string | null;
  selectedAgentId: string | null;
  paletteOpen: boolean;
  modal: Modal;
  /** Pedido para o cérebro centralizar num nó (muda o `nonce` a cada pedido). */
  focus: { nodeId: string; nonce: number } | null;
  /** Chat com o gerente do setor aberto ao lado (null = fechado). */
  chatSectorId: string | null;
  chats: Record<string, ChatState>;
  /** Agentes trabalhando agora (piscam no cérebro e no prédio). */
  workingAgents: Record<string, true>;

  load(): Promise<void>;

  setTab(tab: Tab): void;
  selectSector(id: string | null): void;
  hoverSector(id: string | null): void;
  openAgent(id: string | null): void;
  focusNode(nodeId: string): void;
  setPaletteOpen(open: boolean): void;
  openModal(modal: Modal): void;
  closeModal(): void;
  openChat(sectorId: string | null): void;

  renameCompany(nome: string): void;
  resetToEmpty(): void;
  resetToSample(): void;

  addSector(draft: SectorDraft): void;
  updateSector(id: string, draft: SectorDraft): void;
  updateManager(sectorId: string, manager: Manager): void;
  deleteSector(id: string, moveAgentsTo: string | null): void;
  reorderSectors(idsBottomToTop: string[]): void;

  addAgent(draft: AgentDraft): void;
  updateAgent(id: string, draft: AgentDraft): void;
  deleteAgent(id: string): void;
  moveAgent(id: string, sectorId: string): void;

  selectProject(id: string | null): void;
  addProject(name: string, goal: string, agentIds: string[]): string;
  updateProject(id: string, patch: Partial<Omit<Project, "id">>): void;
  deleteProject(id: string): void;
  addTasks(projectId: string, tasks: Array<Pick<ProjectTask, "agentId" | "title">>): void;
  updateTask(projectId: string, taskId: string, patch: Partial<ProjectTask>): void;
  removeTask(projectId: string, taskId: string): void;
  setRunning(projectId: string, running: boolean): void;
  setTerminal(projectId: string, agentId: string, patch: Partial<TerminalState>): void;
  pushTerminal(projectId: string, agentId: string, line: TerminalLine): void;
  appendTerminal(projectId: string, agentId: string, text: string): void;

  // Chat (alimentado por services/managerChat)
  setChat(sectorId: string, patch: Partial<ChatState>): void;
  pushChat(sectorId: string, entry: ChatEntry): void;
  appendManagerText(sectorId: string, text: string): void;
  setAgentWorking(agentId: string, working: boolean): void;
}

const renumber = (sectors: Sector[]) =>
  [...sectors].sort((a, b) => a.order - b.order).map((s, i) => ({ ...s, order: i }));

function placeAt(sectors: Sector[], sector: Sector, pos: number): Sector[] {
  const lista = renumber(sectors.filter((s) => s.id !== sector.id));
  lista.splice(Math.max(0, Math.min(pos, lista.length)), 0, sector);
  return lista.map((s, i) => ({ ...s, order: i }));
}

const chatVazio: ChatState = { entries: [], busy: false, loaded: false };
const terminalVazio: TerminalState = { lines: [], busy: false, thinking: false };
const hoje = () => new Date().toISOString().slice(0, 10);

const mudarProjeto = (projects: Project[], id: string, f: (p: Project) => Project) =>
  projects.map((p) => (p.id === id ? f(p) : p));

export const useStore = create<WorkState>()((set, get) => ({
  loaded: false,
  companyName: "",
  sectors: [],
  agents: [],
  projects: [],
  selectedProjectId: null,
  terminals: {},
  running: {},

  tab: "mapa",
  selectedSectorId: null,
  hoveredSectorId: null,
  selectedAgentId: null,
  paletteOpen: false,
  modal: { kind: "none" },
  focus: null,
  chatSectorId: null,
  chats: {},
  workingAgents: {},

  async load() {
    const repo = await getRepository();
    const dados = (await repo.load()) ?? sampleCompany();
    set({ companyName: dados.companyName, agents: dados.agents, sectors: renumber(dados.sectors),
          projects: (dados.projects ?? []).map((p) => ({
            ...p,
            // Tarefa que estava rodando quando o app fechou volta para a fila.
            tasks: p.tasks.map((t) => (t.status === "rodando" ? { ...t, status: "pendente" as const } : t)),
          })),
          selectedProjectId: dados.projects?.[0]?.id ?? null, loaded: true });
  },

  setTab: (tab) => set({ tab }),
  // Selecionar um setor também abre o chat com o gerente dele.
  selectSector: (id) => set((s) => {
    const novo = s.selectedSectorId === id ? null : id;
    return { selectedSectorId: novo, chatSectorId: novo ?? s.chatSectorId };
  }),
  hoverSector: (id) => { if (get().hoveredSectorId !== id) set({ hoveredSectorId: id }); },
  openAgent: (id) => set({ selectedAgentId: id }),
  focusNode: (nodeId) => set({ focus: { nodeId, nonce: Date.now() } }),
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  openModal: (modal) => set({ modal }),
  closeModal: () => set({ modal: { kind: "none" } }),
  openChat: (sectorId) => set({ chatSectorId: sectorId }),

  renameCompany: (nome) => set({ companyName: nome.trim() || get().companyName }),
  resetToEmpty: () => set({ ...semVersao(emptyCompany(get().companyName)), selectedSectorId: null, selectedAgentId: null, chatSectorId: null, selectedProjectId: null }),
  resetToSample: () => set({ ...semVersao(sampleCompany()), selectedSectorId: null, selectedAgentId: null, chatSectorId: null, selectedProjectId: null }),

  addSector(draft) {
    const name = draft.name.trim();
    const sector: Sector = { id: newId("s"), name, description: draft.description.trim(), color: draft.color, order: 0,
                             manager: draft.manager ?? defaultManager(name) };
    set((s) => ({ sectors: placeAt(s.sectors, sector, draft.order ?? s.sectors.length) }));
  },
  updateSector(id, draft) {
    set((s) => {
      const atual = s.sectors.find((x) => x.id === id);
      if (!atual) return {};
      const editado = { ...atual, name: draft.name.trim(), description: draft.description.trim(), color: draft.color,
                        manager: draft.manager ?? atual.manager };
      return { sectors: placeAt(s.sectors, editado, draft.order ?? atual.order) };
    });
  },
  updateManager(sectorId, manager) {
    set((s) => ({ sectors: s.sectors.map((x) => (x.id === sectorId
      ? { ...x, manager: { name: manager.name.trim() || x.manager.name, instructions: manager.instructions.trim() } } : x)) }));
  },
  deleteSector(id, moveAgentsTo) {
    set((s) => ({
      sectors: renumber(s.sectors.filter((x) => x.id !== id)),
      agents: moveAgentsTo
        ? s.agents.map((a) => (a.sectorId === id ? { ...a, sectorId: moveAgentsTo } : a))
        : s.agents.filter((a) => a.sectorId !== id),
      selectedSectorId: s.selectedSectorId === id ? null : s.selectedSectorId,
      chatSectorId: s.chatSectorId === id ? null : s.chatSectorId,
    }));
  },
  reorderSectors(ids) {
    set((s) => ({
      sectors: s.sectors.map((x) => ({ ...x, order: ids.indexOf(x.id) }))
        .filter((x) => x.order >= 0).sort((a, b) => a.order - b.order),
    }));
  },

  addAgent(draft) { set((s) => ({ agents: [...s.agents, { ...draft, id: newId("a") }] })); },
  updateAgent(id, draft) { set((s) => ({ agents: s.agents.map((a) => (a.id === id ? { ...draft, id } : a)) })); },
  deleteAgent(id) {
    set((s) => ({
      agents: s.agents.filter((a) => a.id !== id),
      selectedAgentId: s.selectedAgentId === id ? null : s.selectedAgentId,
      projects: s.projects.map((p) => ({ ...p, agentIds: p.agentIds.filter((x) => x !== id),
                                         tasks: p.tasks.filter((t) => t.agentId !== id) })),
    }));
  },
  moveAgent(id, sectorId) { set((s) => ({ agents: s.agents.map((a) => (a.id === id ? { ...a, sectorId } : a)) })); },

  selectProject: (id) => set({ selectedProjectId: id }),
  addProject(name, goal, agentIds) {
    const projeto: Project = { id: newId("p"), name: name.trim() || "Novo projeto", goal: goal.trim(),
                               agentIds, tasks: [], createdAt: hoje() };
    set((s) => ({ projects: [projeto, ...s.projects], selectedProjectId: projeto.id }));
    return projeto.id;
  },
  updateProject(id, patch) { set((s) => ({ projects: mudarProjeto(s.projects, id, (p) => ({ ...p, ...patch })) })); },
  deleteProject(id) {
    set((s) => {
      const projects = s.projects.filter((p) => p.id !== id);
      const { [id]: _t, ...terminals } = s.terminals;
      const { [id]: _r, ...running } = s.running;
      return { projects, terminals, running,
               selectedProjectId: s.selectedProjectId === id ? projects[0]?.id ?? null : s.selectedProjectId };
    });
  },
  addTasks(projectId, tasks) {
    set((s) => ({ projects: mudarProjeto(s.projects, projectId, (p) => ({
      ...p,
      agentIds: [...new Set([...p.agentIds, ...tasks.map((t) => t.agentId)])],
      tasks: [...p.tasks, ...tasks.map((t) => ({ id: newId("t"), title: t.title.trim(), agentId: t.agentId, status: "pendente" as const }))],
    })) }));
  },
  updateTask(projectId, taskId, patch) {
    set((s) => ({ projects: mudarProjeto(s.projects, projectId, (p) => ({
      ...p, tasks: p.tasks.map((t) => (t.id === taskId ? { ...t, ...patch } : t)),
    })) }));
  },
  removeTask(projectId, taskId) {
    set((s) => ({ projects: mudarProjeto(s.projects, projectId, (p) => ({ ...p, tasks: p.tasks.filter((t) => t.id !== taskId) })) }));
  },
  setRunning(projectId, running) {
    set((s) => {
      const lista = { ...s.running };
      if (running) lista[projectId] = true;
      else delete lista[projectId];
      return { running: lista };
    });
  },
  setTerminal(projectId, agentId, patch) {
    set((s) => {
      const doProjeto = s.terminals[projectId] ?? {};
      return { terminals: { ...s.terminals, [projectId]: { ...doProjeto, [agentId]: { ...(doProjeto[agentId] ?? terminalVazio), ...patch } } } };
    });
  },
  pushTerminal(projectId, agentId, line) {
    const atual = get().terminals[projectId]?.[agentId] ?? terminalVazio;
    get().setTerminal(projectId, agentId, { lines: [...atual.lines, line] });
  },
  appendTerminal(projectId, agentId, text) {
    const atual = get().terminals[projectId]?.[agentId] ?? terminalVazio;
    const lines = [...atual.lines];
    const ultima = lines[lines.length - 1];
    if (ultima?.papel === "agente") lines[lines.length - 1] = { ...ultima, texto: ultima.texto + text };
    else lines.push({ papel: "agente", texto: text });
    get().setTerminal(projectId, agentId, { lines, thinking: false });
  },

  setChat(sectorId, patch) {
    set((s) => ({ chats: { ...s.chats, [sectorId]: { ...(s.chats[sectorId] ?? chatVazio), ...patch } } }));
  },
  pushChat(sectorId, entry) {
    set((s) => {
      const atual = s.chats[sectorId] ?? chatVazio;
      return { chats: { ...s.chats, [sectorId]: { ...atual, entries: [...atual.entries, entry] } } };
    });
  },
  appendManagerText(sectorId, text) {
    set((s) => {
      const atual = s.chats[sectorId] ?? chatVazio;
      const entries = [...atual.entries];
      const ultima = entries[entries.length - 1];
      if (ultima?.kind === "gerente") entries[entries.length - 1] = { ...ultima, text: ultima.text + text };
      else entries.push({ id: newId("m"), kind: "gerente", text });
      return { chats: { ...s.chats, [sectorId]: { ...atual, entries } } };
    });
  },
  setAgentWorking(agentId, working) {
    set((s) => {
      const lista = { ...s.workingAgents };
      if (working) lista[agentId] = true;
      else delete lista[agentId];
      return { workingAgents: lista };
    });
  },
}));

const semVersao = ({ companyName, sectors, agents, projects }: CompanyData) =>
  ({ companyName, sectors, agents, projects: projects ?? [] });

// --- Persistência: salva (com atraso curto) sempre que os dados mudam --------------
let timer: ReturnType<typeof setTimeout> | undefined;
useStore.subscribe((estado, anterior) => {
  if (!estado.loaded) return;
  if (estado.sectors === anterior.sectors && estado.agents === anterior.agents
      && estado.projects === anterior.projects && estado.companyName === anterior.companyName) return;
  clearTimeout(timer);
  timer = setTimeout(async () => {
    const { companyName, sectors, agents, projects } = useStore.getState();
    await (await getRepository()).save({ version: 2, companyName, sectors, agents, projects });
  }, 400);
});
