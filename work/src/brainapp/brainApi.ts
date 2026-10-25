/** Ponte do Brain com o Python do Jarvis (e dados de demonstração fora dele). */

export interface Conta {
  provedor: string;
  empresa: string;
  modelo: string;
  chave: string;
  esforco: string;
  esforco_voz: string;
  esforco_agentes: string;
  status: "ok" | "aviso" | "erro";
  detalhe: string;
  modelos: string[];
}
export interface Habilidade { nome: string; descricao: string; tipo: "ferramenta" | "sentido" | "skill" }
export interface DadosBrain {
  nome: string;
  memorias: Array<{ id: number; texto: string; categoria: string; quando: string }>;
  tarefas: Array<{ id: number; texto: string; prazo: string; feita: boolean }>;
  conversas: Array<{ id: number; titulo: string; pasta: string; quando: string }>;
  agentes: Array<{ id: string; nome: string; funcao: string; setor: string }>;
}

interface BrainApi {
  brain_dados(): Promise<DadosBrain>;
  brain_conta(): Promise<{ conta: Conta; habilidades: Habilidade[] }>;
  brain_esquecer(id: number): Promise<boolean>;
}

function api(): BrainApi | null {
  try {
    const p = (window.parent as unknown as { pywebview?: { api?: Partial<BrainApi> } })?.pywebview?.api;
    return p?.brain_dados ? (p as BrainApi) : null;
  } catch {
    return null;
  }
}

/** Espera a ponte do pywebview (o iframe pode carregar antes dela). */
async function ponte(): Promise<BrainApi | null> {
  for (let i = 0; i < 20 && window.parent !== window; i++) {
    const a = api();
    if (a) return a;
    await new Promise((r) => setTimeout(r, 100));
  }
  return api();
}

export const dentroDoJarvis = () => api() !== null;

export async function carregarDados(): Promise<DadosBrain> {
  const a = await ponte();
  if (a) return a.brain_dados();
  return {
    nome: "senhor", memorias: [
      { id: 1, texto: "Prefere respostas curtas pela manhã.", categoria: "preferencia", quando: "2026-10-20T08:00:00" },
      { id: 2, texto: "Está construindo o próprio Jarvis.", categoria: "projeto", quando: "2026-10-24T14:00:00" },
    ],
    tarefas: [{ id: 1, texto: "Revisar o módulo Work", prazo: "amanhã", feita: false }],
    conversas: [{ id: 1, titulo: "Planejamento da semana", pasta: "geral", quando: "2026-10-24T20:00:00" }],
    agentes: [{ id: "a1", nome: "Ledger", funcao: "Conciliação contábil", setor: "Finanças" }],
  };
}

export async function carregarConta(): Promise<{ conta: Conta; habilidades: Habilidade[] }> {
  const a = await ponte();
  if (a) return a.brain_conta();
  return {
    conta: { provedor: "demo", empresa: "Demonstração", modelo: "—", chave: "—", esforco: "—", esforco_voz: "—",
             esforco_agentes: "—", status: "aviso", detalhe: "Abra o Brain dentro do Jarvis para ver a sua conta.", modelos: [] },
    habilidades: [{ nome: "lembrar", descricao: "Guarda fatos na memória.", tipo: "ferramenta" }],
  };
}

export const esquecer = async (id: number) => (await ponte())?.brain_esquecer(id) ?? false;

export function abrirConversa(id: number) {
  try {
    (window.parent as unknown as { jarvisUi?: { abrirConversa(id: number): void } }).jarvisUi?.abrirConversa(id);
  } catch { /* fora do Jarvis */ }
}

/** Cor do cérebro conforme a IA conectada. */
export const COR_PROVEDOR: Record<string, string> = {
  anthropic: "#ff9a5c",
  openai: "#5cffc8",
  gemini: "#6ea8ff",
};
