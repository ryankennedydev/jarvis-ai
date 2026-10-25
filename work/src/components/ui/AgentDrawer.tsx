import { useState, type ReactNode } from "react";
import { formatDate, sectorColor } from "../../lib/util";
import { useStore } from "../../store/useStore";
import { Avatar } from "./Avatar";
import { Select } from "./Field";
import { BOT_FUNCTIONS, functionsOf } from "../../lib/botFunctions";
import { CloseIcon, EditIcon, TrashIcon } from "./icons";
import { Button } from "./Modal";

export function AgentDrawer() {
  const id = useStore((s) => s.selectedAgentId);
  const agente = useStore((s) => s.agents.find((a) => a.id === id));
  const sectors = useStore((s) => s.sectors);
  const trabalhando = useStore((s) => (id ? !!s.workingAgents[id] : false));
  const { openAgent, openModal, deleteAgent, moveAgent, updateAgent } = useStore.getState();
  const [confirmando, setConfirmando] = useState(false);

  if (!agente) return null;
  const setor = sectors.find((s) => s.id === agente.sectorId);
  const fechar = () => { setConfirmando(false); openAgent(null); };
  const alternarStatus = () => updateAgent(agente.id, { ...agente, status: agente.status === "ativo" ? "inativo" : "ativo" });

  return (
    <aside className="fixed inset-y-0 right-0 z-40 flex w-full max-w-sm flex-col border-l border-neon/20 bg-[#080b07]/95 shadow-[-20px_0_60px_rgba(0,0,0,0.6)] backdrop-blur-xl animate-[deslizar_.25s_ease]">
      <header className="flex items-center border-b border-white/5 px-5 py-4">
        <span className="flex-1 text-xs font-semibold uppercase tracking-[0.25em] text-neon">Agente de IA</span>
        <button onClick={fechar} className="rounded-lg p-1.5 text-zinc-500 hover:bg-white/5 hover:text-white" aria-label="Fechar">
          <CloseIcon className="h-4 w-4" />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-5 py-6">
        <div className="flex flex-col items-center text-center">
          <Avatar name={agente.name} size="h-20 w-20 text-xl" working={trabalhando} inactive={agente.status === "inativo"} />
          <h2 className="mt-4 text-lg font-semibold text-white">{agente.name}</h2>
          <p className="text-sm text-neon/80">{agente.role}</p>
          <button onClick={alternarStatus} title="Clique para ativar/pausar"
                  className={`mt-3 rounded-full px-3 py-0.5 text-[11px] font-medium uppercase tracking-wider transition
                    ${trabalhando ? "bg-white/15 text-white" : agente.status === "ativo" ? "bg-neon/10 text-neon hover:bg-neon/20" : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"}`}>
            {trabalhando ? "trabalhando agora" : agente.status}
          </button>
        </div>

        <dl className="mt-8 space-y-4 text-sm">
          <Linha rotulo="Setor">
            <span style={{ color: sectorColor(setor?.color) }}>{setor?.name ?? "—"}</span>
            {setor && <span className="text-zinc-500"> · {setor.order + 1}º andar</span>}
          </Linha>
          <Linha rotulo="Gerente">{setor?.manager.name ?? "—"}</Linha>
          <Linha rotulo="Criado em">{formatDate(agente.createdAt)}</Linha>
        </dl>

        <div className="mt-6">
          <span className="mb-1.5 block text-[11px] uppercase tracking-[0.15em] text-zinc-500">Funções do bot</span>
          <div className="flex flex-wrap gap-1.5">
            {functionsOf(agente).length ? BOT_FUNCTIONS.filter((f) => functionsOf(agente).includes(f.id)).map((f) => (
              <span key={f.id} title={f.descricao} className="rounded-full border border-neon/30 px-2.5 py-0.5 text-[11px] text-neon">{f.nome}</span>
            )) : <span className="text-xs text-zinc-500">Nenhuma: só responde com texto.</span>}
          </div>
        </div>

        <div className="mt-6">
          <span className="mb-1.5 block text-[11px] uppercase tracking-[0.15em] text-zinc-500">O que ele faz</span>
          <p className="whitespace-pre-wrap rounded-xl border border-white/5 bg-white/[0.02] p-3 text-sm leading-relaxed text-zinc-300">
            {agente.instructions || "Sem instruções. Edite para dizer o que este agente deve fazer."}
          </p>
        </div>

        <div className="mt-6">
          <span className="mb-1.5 block text-[11px] uppercase tracking-[0.15em] text-zinc-500">Mover para outro setor</span>
          <Select value={agente.sectorId} onChange={(e) => moveAgent(agente.id, e.target.value)}>
            {[...sectors].sort((a, b) => b.order - a.order).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </div>
      </div>

      <footer className="flex gap-2 border-t border-white/5 px-5 py-4">
        {confirmando ? (
          <>
            <span className="flex-1 self-center text-sm text-red-300">Remover {agente.name}?</span>
            <Button onClick={() => setConfirmando(false)}>Não</Button>
            <Button variant="danger" onClick={() => { deleteAgent(agente.id); setConfirmando(false); }}>Remover</Button>
          </>
        ) : (
          <>
            <Button className="flex flex-1 items-center justify-center gap-2" onClick={() => openModal({ kind: "agent", editingId: agente.id })}>
              <EditIcon className="h-4 w-4" /> Editar
            </Button>
            <Button variant="danger" className="flex items-center gap-2" onClick={() => setConfirmando(true)}>
              <TrashIcon className="h-4 w-4" /> Remover
            </Button>
          </>
        )}
      </footer>
    </aside>
  );
}

function Linha({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-white/5 pb-3">
      <dt className="text-zinc-500">{rotulo}</dt>
      <dd className="truncate text-right text-zinc-200">{children}</dd>
    </div>
  );
}
