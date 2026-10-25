import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { abrirLink, markdownToHtml } from "../../lib/markdown";
import { chatAvailable, clearHistory, loadHistory, sendToManager, stopManager } from "../../services/managerChat";
import { useStore } from "../../store/useStore";
import type { Agent, ChatEntry } from "../../types";
import { Avatar } from "../ui/Avatar";
import { CloseIcon, GearIcon, SendIcon, StopIcon, TrashIcon } from "../ui/icons";

const SUGESTOES = [
  "O que a sua equipe consegue fazer?",
  "Monte um plano de trabalho para esta semana.",
  "Faça um diagnóstico rápido do setor e aponte prioridades.",
];

/** Chat com o gerente de IA do setor, ao lado do cérebro. */
export function ChatPanel() {
  const sectorId = useStore((s) => s.chatSectorId);
  const setor = useStore((s) => s.sectors.find((x) => x.id === s.chatSectorId));
  const agents = useStore((s) => s.agents);
  const chat = useStore((s) => (sectorId ? s.chats[sectorId] : undefined));
  const working = useStore((s) => s.workingAgents);
  const { openChat, openModal, openAgent, selectSector } = useStore.getState();

  const equipe = useMemo(() => agents.filter((a) => a.sectorId === sectorId), [agents, sectorId]);
  const porId = useMemo(() => new Map(agents.map((a) => [a.id, a])), [agents]);

  useEffect(() => {
    if (sectorId && !useStore.getState().chats[sectorId]?.loaded) loadHistory(sectorId);
  }, [sectorId]);

  if (!sectorId || !setor) return null;
  const ocupado = !!chat?.busy;
  const disponivel = chatAvailable();

  const fechar = () => {
    openChat(null);
    if (useStore.getState().selectedSectorId === sectorId) selectSector(null);
  };

  return (
    <aside className="flex h-full w-full flex-col border-l border-neon/15 bg-[#060906]/90 backdrop-blur-xl lg:w-[25rem] animate-[aparecer_.2s_ease]">
      <header className="flex items-center gap-3 border-b border-white/5 px-4 py-3">
        <Avatar name={setor.manager.name} variant="manager" size="h-10 w-10 text-xs" working={ocupado} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-white">{setor.manager.name}</div>
          <div className="truncate text-[11px] uppercase tracking-[0.18em] text-neon/70">
            Gerente · {setor.name} {ocupado && <span className="text-white">· trabalhando</span>}
          </div>
        </div>
        <BotaoIcone titulo="Configurar gerente" onClick={() => openModal({ kind: "manager", sectorId })}><GearIcon className="h-4 w-4" /></BotaoIcone>
        <BotaoIcone titulo="Limpar conversa" disabled={ocupado || !chat?.entries.length}
                    onClick={() => confirm("Apagar a conversa com este gerente?") && clearHistory(sectorId)}>
          <TrashIcon className="h-4 w-4" />
        </BotaoIcone>
        <BotaoIcone titulo="Fechar chat" onClick={fechar}><CloseIcon className="h-4 w-4" /></BotaoIcone>
      </header>

      <Equipe equipe={equipe} working={working} onAbrir={openAgent} />

      <Mensagens entries={chat?.entries ?? []} ocupado={ocupado} porId={porId}
                 vazio={disponivel ? <Sugestoes nome={setor.manager.name} onEscolher={(t) => sendToManager(sectorId, t)} /> : <SemJarvis />} />

      <Composer key={sectorId} sectorId={sectorId} ocupado={ocupado} desabilitado={!disponivel} nome={setor.manager.name} />
    </aside>
  );
}

function Equipe({ equipe, working, onAbrir }: { equipe: Agent[]; working: Record<string, true>; onAbrir(id: string): void }) {
  if (!equipe.length) return null;
  return (
    <div className="flex gap-1.5 overflow-x-auto border-b border-white/5 px-4 py-2.5">
      {equipe.map((a) => (
        <button key={a.id} onClick={() => onAbrir(a.id)} title={`${a.name} · ${a.role}`}
                className={`flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] transition
                  ${working[a.id] ? "border-white/60 bg-white/10 text-white" : "border-white/10 text-zinc-400 hover:border-neon/40 hover:text-neon"}
                  ${a.status === "inativo" ? "opacity-40" : ""}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${working[a.id] ? "animate-pulse bg-white" : a.status === "ativo" ? "bg-neon" : "bg-zinc-600"}`} />
          {a.name}
        </button>
      ))}
    </div>
  );
}

function Mensagens({ entries, ocupado, porId, vazio }:
  { entries: ChatEntry[]; ocupado: boolean; porId: Map<string, Agent>; vazio: ReactNode }) {
  const caixa = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = caixa.current;
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 160) el.scrollTop = el.scrollHeight;
  }, [entries, ocupado]);

  const ultima = entries[entries.length - 1];
  const digitando = ocupado && ultima?.kind !== "gerente";

  return (
    <div ref={caixa} className="flex-1 space-y-3 overflow-y-auto px-4 py-4"
         onClick={(e) => {
           const link = (e.target as HTMLElement).closest("a[data-href]");
           if (link) { e.preventDefault(); abrirLink(link.getAttribute("data-href") ?? ""); }
         }}>
      {!entries.length && vazio}
      {entries.map((e) => <Fala key={e.id} entry={e} agente={e.agentId ? porId.get(e.agentId) : undefined} />)}
      {digitando && (
        <div className="flex gap-1 px-1 py-2" aria-label="Gerente pensando">
          {[0, 1, 2].map((i) => (
            <span key={i} className="h-1.5 w-1.5 animate-bounce rounded-full bg-neon/70" style={{ animationDelay: `${i * 0.15}s` }} />
          ))}
        </div>
      )}
    </div>
  );
}

function Fala({ entry, agente }: { entry: ChatEntry; agente?: Agent }) {
  switch (entry.kind) {
    case "usuario":
      return (
        <div className="flex justify-end">
          <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md border border-neon/20 bg-neon/10 px-3.5 py-2 text-sm text-white">
            {entry.text}
          </div>
        </div>
      );
    case "atividade":
      return (
        <div className="flex items-start gap-2 rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2 text-xs">
          <span className={`mt-0.5 h-3.5 w-3.5 shrink-0 rounded-full border-2 ${entry.done ? "border-neon bg-neon/30" : "animate-spin border-white/70 border-t-transparent"}`} />
          <div className="min-w-0">
            <span className="font-semibold text-neon">{agente?.name ?? "Agente"}</span>
            <span className="text-zinc-500"> {entry.done ? "concluiu" : "trabalhando em"}: </span>
            <span className="line-clamp-2 text-zinc-300">{entry.text}</span>
          </div>
        </div>
      );
    case "erro":
      return <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-3 py-2 text-sm text-red-300">{entry.text}</div>;
    default:
      return (
        <div className="markdown text-sm leading-relaxed text-zinc-200"
             // markdownToHtml escapa todo o texto antes de montar o HTML.
             dangerouslySetInnerHTML={{ __html: markdownToHtml(entry.text) }} />
      );
  }
}

function Sugestoes({ nome, onEscolher }: { nome: string; onEscolher(t: string): void }) {
  return (
    <div className="pt-6 text-center">
      <p className="text-sm text-zinc-400">Converse com <b className="text-white">{nome}</b>.</p>
      <p className="mt-1 text-xs text-zinc-600">Ele distribui as tarefas para os agentes do setor.</p>
      <div className="mt-5 space-y-2">
        {SUGESTOES.map((s) => (
          <button key={s} onClick={() => onEscolher(s)}
                  className="block w-full rounded-xl border border-white/10 px-3 py-2 text-left text-xs text-zinc-300 transition hover:border-neon/40 hover:text-neon">
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

function SemJarvis() {
  return (
    <p className="pt-8 text-center text-sm text-zinc-500">
      O chat com as IAs funciona quando o Work está aberto dentro do Jarvis.
    </p>
  );
}

function Composer({ sectorId, ocupado, desabilitado, nome }: { sectorId: string; ocupado: boolean; desabilitado: boolean; nome: string }) {
  const [texto, setTexto] = useState("");
  const campo = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { campo.current?.focus(); }, [sectorId]);

  const enviar = () => {
    if (ocupado) { stopManager(sectorId); return; }
    if (!texto.trim()) return;
    sendToManager(sectorId, texto);
    setTexto("");
  };

  return (
    <div className="border-t border-white/5 p-3">
      <div className="flex items-end gap-2 rounded-2xl border border-white/10 bg-black/40 p-1.5 transition focus-within:border-neon/50">
        <textarea ref={campo} rows={1} value={texto} disabled={desabilitado}
                  onChange={(e) => { setTexto(e.target.value); e.target.style.height = "auto"; e.target.style.height = `${e.target.scrollHeight}px`; }}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(); } }}
                  placeholder={`Peça algo a ${nome}…`}
                  className="max-h-40 min-h-9 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm text-white outline-none placeholder:text-zinc-600 disabled:opacity-40" />
        <button onClick={enviar} disabled={desabilitado || (!ocupado && !texto.trim())} title={ocupado ? "Parar" : "Enviar"}
                className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl transition disabled:opacity-30
                  ${ocupado ? "bg-white/10 text-white" : "bg-neon text-black hover:shadow-[0_0_16px_rgba(196,255,61,0.5)]"}`}>
          {ocupado ? <StopIcon className="h-4 w-4" /> : <SendIcon className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

function BotaoIcone({ titulo, onClick, children, disabled }: { titulo: string; onClick(): void; children: ReactNode; disabled?: boolean }) {
  return (
    <button onClick={onClick} title={titulo} aria-label={titulo} disabled={disabled}
            className="grid h-8 w-8 place-items-center rounded-lg text-zinc-500 transition hover:bg-white/5 hover:text-neon disabled:opacity-30">
      {children}
    </button>
  );
}
