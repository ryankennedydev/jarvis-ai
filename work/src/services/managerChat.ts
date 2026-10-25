/**
 * Chat com o gerente de IA de cada setor. Quem roda as IAs é o Python do Jarvis
 * (jarvis/work_agentes.py); aqui só enviamos mensagens e recebemos os eventos.
 */
import { newId } from "../lib/util";
import { useStore } from "../store/useStore";
import { terminalEvento } from "./projectRunner";
import { functionsOf, NOME_FUNCAO } from "../lib/botFunctions";

interface ChatApi {
  work_chat_enviar(contexto: string, texto: string): Promise<boolean>;
  work_chat_historico(setorId: string): Promise<{ falas: Array<{ kind: string; text: string; agentId?: string; done?: boolean }>; ocupado: boolean }>;
  work_chat_limpar(setorId: string): Promise<void>;
  work_chat_parar(setorId: string): Promise<void>;
}

function api(): ChatApi | null {
  try {
    const p = (window.parent as unknown as { pywebview?: { api?: Partial<ChatApi> } })?.pywebview?.api;
    return p?.work_chat_enviar ? (p as ChatApi) : null;
  } catch {
    return null;
  }
}

export const chatAvailable = () => api() !== null;

export async function loadHistory(sectorId: string) {
  const loja = useStore.getState();
  const ponte = api();
  if (!ponte) return loja.setChat(sectorId, { loaded: true });
  const { falas, ocupado } = await ponte.work_chat_historico(sectorId);
  loja.setChat(sectorId, {
    loaded: true,
    busy: ocupado,
    entries: falas.map((f) => ({ id: newId("m"), kind: f.kind as "usuario", text: f.text, agentId: f.agentId, done: f.done })),
  });
}

export async function sendToManager(sectorId: string, texto: string) {
  const ponte = api();
  const loja = useStore.getState();
  const setor = loja.sectors.find((s) => s.id === sectorId);
  if (!ponte || !setor || !texto.trim()) return;

  loja.pushChat(sectorId, { id: newId("m"), kind: "usuario", text: texto.trim() });
  loja.setChat(sectorId, { busy: true });
  const contexto = {
    empresa: loja.companyName,
    setor: { id: setor.id, name: setor.name, manager: setor.manager },
    agentes: loja.agents.filter((a) => a.sectorId === sectorId).map((a) => ({ ...a, functions: functionsOf(a) })),
  };
  const aceito = await ponte.work_chat_enviar(JSON.stringify(contexto), texto);
  if (!aceito) loja.setChat(sectorId, { busy: false });
}

export const stopManager = (sectorId: string) => api()?.work_chat_parar(sectorId);

export async function clearHistory(sectorId: string) {
  await api()?.work_chat_limpar(sectorId);
  useStore.getState().setChat(sectorId, { entries: [] });
}

// --- Eventos vindos do Python (chamados via evaluate_js) ------------------------
type Evento = { setor: string; texto?: string; agente?: string; nome?: string; estado?: "inicio" | "fim" | "erro" };

function workEvento(tipo: string, dado: Evento) {
  // Eventos dos terminais dos projetos têm o próprio tratador.
  if (tipo.startsWith("terminal_")) {
    terminalEvento(tipo, dado as unknown as Parameters<typeof terminalEvento>[1]);
    return;
  }
  const loja = useStore.getState();
  const setor = dado.setor;
  switch (tipo) {
    case "work_texto":
      loja.appendManagerText(setor, dado.texto ?? "");
      break;
    case "work_atividade": {
      const agente = dado.agente ?? "";
      if (dado.estado === "inicio") {
        loja.setAgentWorking(agente, true);
        loja.pushChat(setor, { id: newId("m"), kind: "atividade", agentId: agente, text: dado.texto ?? "" });
      } else {
        loja.setAgentWorking(agente, false);
        const chat = useStore.getState().chats[setor];
        if (!chat) break;
        const entries = chat.entries.map((e) => (e.kind === "atividade" && e.agentId === agente && !e.done
          ? { ...e, done: true, text: dado.estado === "erro" ? `${e.text} (falhou)` : e.text } : e));
        loja.setChat(setor, { entries });
      }
      break;
    }
    case "work_funcao": {
      const acao = NOME_FUNCAO[dado.nome ?? ""] ?? dado.nome ?? "executando";
      const texto = dado.estado === "erro" ? `${dado.nome} falhou: ${dado.texto ?? ""}` : `${acao}${dado.texto ? `: ${dado.texto}` : ""}`;
      loja.pushChat(setor, { id: newId("m"), kind: "atividade", agentId: dado.agente, text: `⚙ ${texto}`, done: true });
      break;
    }
    case "work_erro":
      loja.pushChat(setor, { id: newId("m"), kind: "erro", text: dado.texto ?? "Erro." });
      break;
    case "work_fim":
      loja.setChat(setor, { busy: false });
      break;
  }
}

(window as unknown as { workEvento: typeof workEvento }).workEvento = workEvento;
