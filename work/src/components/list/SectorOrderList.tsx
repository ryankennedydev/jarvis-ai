import { useMemo, useState } from "react";
import { sectorColor } from "../../lib/util";
import { groupBySector } from "../../store/selectors";
import { useStore } from "../../store/useStore";
import { EditIcon, GripIcon, PlusIcon } from "../ui/icons";

/** Andares do topo para o térreo; arrastar e soltar reordena o prédio. */
export function SectorOrderList() {
  const sectors = useStore((s) => s.sectors);
  const agents = useStore((s) => s.agents);
  const { reorderSectors, openModal } = useStore.getState();
  const porSetor = useMemo(() => groupBySector(agents), [agents]);
  const doTopo = useMemo(() => [...sectors].sort((a, b) => b.order - a.order), [sectors]);
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [sobre, setSobre] = useState<string | null>(null);

  const soltar = (alvoId: string) => {
    if (!arrastando || arrastando === alvoId) return;
    const ids = doTopo.map((s) => s.id).filter((id) => id !== arrastando);
    ids.splice(ids.indexOf(alvoId), 0, arrastando);
    reorderSectors(ids.reverse()); // a store guarda do térreo para o topo
  };

  return (
    <section className="w-full shrink-0 lg:w-80">
      <div className="mb-4 flex items-center">
        <h2 className="flex-1 text-xs font-semibold uppercase tracking-[0.25em] text-neon">Andares</h2>
        <button onClick={() => openModal({ kind: "sector" })}
                className="flex items-center gap-1 rounded-lg border border-neon/30 px-2.5 py-1.5 text-xs text-neon hover:border-neon">
          <PlusIcon className="h-3.5 w-3.5" /> Novo andar
        </button>
      </div>
      <p className="mb-3 text-xs text-zinc-500">Arraste para mudar a ordem. O primeiro da lista é o topo do prédio.</p>
      <ol className="space-y-1.5">
        {doTopo.map((s) => (
          <li key={s.id} draggable
              onDragStart={(e) => { setArrastando(s.id); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", s.id); }}
              onDragOver={(e) => { e.preventDefault(); setSobre(s.id); }}
              onDragLeave={() => setSobre((v) => (v === s.id ? null : v))}
              onDrop={(e) => { e.preventDefault(); soltar(s.id); setSobre(null); setArrastando(null); }}
              onDragEnd={() => { setArrastando(null); setSobre(null); }}
              className={`group flex cursor-grab items-center gap-3 rounded-xl border px-3 py-2.5 transition active:cursor-grabbing
                ${sobre === s.id && arrastando !== s.id ? "border-neon/60 bg-neon/[0.06]" : "border-white/5 bg-white/[0.02]"}
                ${arrastando === s.id ? "opacity-40" : ""}`}>
            <GripIcon className="h-4 w-4 text-zinc-600" />
            <span className="w-7 font-mono text-xs text-zinc-500">{s.order + 1}º</span>
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: sectorColor(s.color), boxShadow: `0 0 8px ${sectorColor(s.color)}` }} />
            <span className="min-w-0 flex-1"><span className="block truncate text-sm text-white">{s.name}</span><span className="block truncate text-[11px] text-zinc-600">gerente {s.manager.name}</span></span>
            <span className="text-xs text-zinc-500">{porSetor.get(s.id)?.length ?? 0}</span>
            <button onClick={() => openModal({ kind: "sector", editingId: s.id })} aria-label={`Editar ${s.name}`}
                    className="rounded p-1 text-zinc-500 opacity-0 transition hover:text-neon group-hover:opacity-100 focus:opacity-100">
              <EditIcon className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
        {doTopo.length === 0 && <li className="text-sm text-zinc-500">Nenhum andar ainda.</li>}
      </ol>
    </section>
  );
}
