export type AgentStatus = "ativo" | "inativo";

/** O gerente (IA) de um setor: conversa com você e distribui o trabalho para os agentes. */
export interface Manager {
  name: string;
  /** O que o gerente faz: objetivos, regras, como coordenar a equipe. */
  instructions: string;
}

export interface Sector {
  id: string;
  name: string;
  description: string;
  /** Cor de destaque opcional (hex). Vazio = verde neon padrão. */
  color: string;
  /** Posição no prédio: 0 = térreo. */
  order: number;
  manager: Manager;
}

/** Um agente de IA da equipe de um setor. */
export interface Agent {
  id: string;
  name: string;
  /** Função curta, ex.: "Conciliação contábil". */
  role: string;
  sectorId: string;
  /** O que este agente faz e como (vira o prompt de sistema dele). */
  instructions: string;
  status: AgentStatus;
  /** Data ISO (AAAA-MM-DD). */
  createdAt: string;
  /** Funções reais que o bot executa (web, arquivos, calculo, jarvis). Ausente = padrão. */
  functions?: string[];
}

export type TaskStatus = "pendente" | "rodando" | "feita" | "erro";

/** Uma tarefa do projeto, na fila de um agente. */
export interface ProjectTask {
  id: string;
  title: string;
  agentId: string;
  status: TaskStatus;
  /** Resumo do que o agente entregou (vai para o mural do projeto). */
  result?: string;
}

/** Projeto estilo Maestri: vários agentes trabalhando em paralelo, cada um no seu terminal. */
export interface Project {
  id: string;
  name: string;
  goal: string;
  agentIds: string[];
  tasks: ProjectTask[];
  /** Data ISO (AAAA-MM-DD). */
  createdAt: string;
}

export interface CompanyData {
  version: 2;
  companyName: string;
  sectors: Sector[];
  agents: Agent[];
  projects?: Project[];
}

export type Tab = "mapa" | "projetos" | "dashboard" | "lista";

/** Uma fala no terminal de um agente. */
export interface TerminalLine {
  papel: "voce" | "agente" | "erro" | "funcao";
  texto: string;
}

export interface TerminalState {
  lines: TerminalLine[];
  busy: boolean;
  thinking: boolean;
}

export type SectorDraft = Omit<Sector, "id" | "order" | "manager"> & { order?: number; manager?: Manager };
export type AgentDraft = Omit<Agent, "id">;

/** Uma fala no chat com o gerente do setor. */
export interface ChatEntry {
  id: string;
  kind: "usuario" | "gerente" | "atividade" | "erro";
  text: string;
  /** Para "atividade": agente envolvido (nó que pisca no cérebro). */
  agentId?: string;
  done?: boolean;
}
