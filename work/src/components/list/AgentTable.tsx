import { useMemo, useState } from "react";
import { normalize, sectorColor } from "../../lib/util";
import { useStore } from "../../store/useStore";
import type { Agent } from "../../types";
import { Avatar } from "../ui/Avatar";
import { Select, TextInput } from "../ui/Field";
import { PlusIcon, SortIcon } from "../ui/icons";

type Coluna = "name" | "role" | "sector" | "status";
const COLUNAS: Array<{ id: Coluna; nome: string; classe?: string }> = [
  { id: "name", nome: "Agente" },
  { id: "role", nome: "Função", classe: "hidden md:table-cell" },
  { id: "sector", nome: "Setor" },
  { id: "status", nome: "Status", classe: "hidden sm:table-cell" },
];

export function AgentTable() {
  const agents = useStore((s) => s.agents);
  const sectors = useStore((s) => s.sectors);
  const working = useStore((s) => s.workingAgents);
  const { openAgent, openModal } = useStore.getState();
  const [filtroSetor, setFiltroSetor] = useState("");
  const [busca, setBusca] = useState("");
  const [ordem, setOrdem] = useState<{ col: Coluna; asc: boolean }>({ col: "name", asc: true });

  const setores = useMemo(() => new Map(sectors.map((s) => [s.id, s])), [sectors]);
  const linhas = useMemo(() => {
    const q = normalize(busca.trim());
    const valor = (a: Agent, c: Coluna) => (c === "sector" ? setores.get(a.sectorId)?.name ?? "" : a[c]);
    return agents
      .filter((a) => (!filtroSetor || a.sectorId === filtroSetor) && (!q || normalize(`${a.name} ${a.role}`).includes(q)))
      .sort((a, b) => valor(a, ordem.col).localeCompare(valor(b, ordem.col), "pt-BR") * (ordem.asc ? 1 : -1));
  }, [agents, setores, filtroSetor, busca, ordem]);

  const ordenar = (col: Coluna) => setOrdem((o) => ({ col, asc: o.col === col ? !o.asc : true }));

  return (
    <section className="min-w-0 flex-1">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <TextInput className="max-w-xs" placeholder="Buscar agente ou função…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <Select className="max-w-[12rem]" value={filtroSetor} onChange={(e) => setFiltroSetor(e.target.value)}>
          <option value="">Todos os setores</option>
          {[...sectors].sort((a, b) => b.order - a.order).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
        <span className="text-xs text-zinc-500">{linhas.length} de {agents.length}</span>
        <button onClick={() => openModal({ kind: "agent", presetSectorId: filtroSetor || undefined })}
                className="ml-auto flex items-center gap-1.5 rounded-lg bg-neon px-3 py-2 text-xs font-semibold text-black hover:shadow-[0_0_18px_rgba(196,255,61,0.4)]">
          <PlusIcon className="h-3.5 w-3.5" /> Agente de IA
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/5">
        <table className="w-full text-left text-sm">
          <thead className="bg-white/[0.03] text-[10px] uppercase tracking-[0.2em] text-zinc-500">
            <tr>
              {COLUNAS.map((c) => (
                <th key={c.id} className={`px-4 py-3 font-medium ${c.classe ?? ""}`}>
                  <button onClick={() => ordenar(c.id)} className={`flex items-center gap-1 uppercase hover:text-white ${ordem.col === c.id ? "text-neon" : ""}`}>
                    {c.nome} <SortIcon className="h-3 w-3" />
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {linhas.map((a) => {
              const setor = setores.get(a.sectorId);
              return (
                <tr key={a.id} onClick={() => openAgent(a.id)} className="cursor-pointer border-t border-white/5 transition hover:bg-neon/[0.04]">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-3">
                      <Avatar name={a.name} size="h-8 w-8 text-[10px]" working={!!working[a.id]} inactive={a.status === "inativo"} />
                      <div className="min-w-0">
                        <div className="truncate text-white">{a.name}</div>
                        <div className="truncate text-xs text-zinc-500 md:hidden">{a.role}</div>
                      </div>
                    </div>
                  </td>
                  <td className="hidden px-4 py-2.5 text-zinc-300 md:table-cell">{a.role}</td>
                  <td className="px-4 py-2.5" style={{ color: sectorColor(setor?.color) }}>
                    {setor?.name ?? "—"}
                    <div className="text-[11px] text-zinc-600">gerente {setor?.manager.name}</div>
                  </td>
                  <td className="hidden px-4 py-2.5 sm:table-cell">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider ${working[a.id] ? "bg-white/15 text-white" : a.status === "ativo" ? "bg-neon/10 text-neon" : "bg-zinc-800 text-zinc-400"}`}>
                      {working[a.id] ? "trabalhando" : a.status}
                    </span>
                  </td>
                </tr>
              );
            })}
            {linhas.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-10 text-center text-zinc-500">Nenhum agente encontrado.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
