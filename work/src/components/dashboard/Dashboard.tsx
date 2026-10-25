import { useMemo } from "react";
import { sectorColor } from "../../lib/util";
import { companyStats } from "../../store/selectors";
import { useStore } from "../../store/useStore";

export function Dashboard() {
  const sectors = useStore((s) => s.sectors);
  const agents = useStore((s) => s.agents);
  const stats = useMemo(() => companyStats(sectors, agents), [sectors, agents]);
  const maximo = Math.max(1, ...stats.perSector.map((p) => p.total));
  const barras = [...stats.perSector].sort((a, b) => b.sector.order - a.sector.order);

  return (
    <div className="mx-auto h-full max-w-6xl overflow-y-auto px-4 py-6 sm:px-8">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Cartao rotulo="Agentes de IA" valor={stats.totalAgents} sub={`+ ${stats.totalSectors} gerentes`} />
        <Cartao rotulo="Setores" valor={stats.totalSectors} sub="andares no prédio" />
        <Cartao rotulo="Maior setor" valor={stats.biggest?.sector.name ?? "—"}
                sub={stats.biggest ? `${stats.biggest.total} agentes` : undefined} pequeno />
        <Cartao rotulo="Ativos / inativos" valor={`${stats.active} / ${stats.inactive}`}
                sub={stats.totalAgents ? `${Math.round((stats.active / stats.totalAgents) * 100)}% ativos` : undefined} />
      </div>

      <section className="mt-6 rounded-2xl border border-white/5 bg-white/[0.02] p-5 sm:p-6">
        <h2 className="text-xs font-semibold uppercase tracking-[0.25em] text-neon">Agentes de IA por setor</h2>
        {barras.length === 0 && <p className="mt-6 text-sm text-zinc-500">Nenhum setor cadastrado.</p>}
        <div className="mt-6 space-y-3">
          {barras.map(({ sector, total }) => {
            const cor = sectorColor(sector.color);
            return (
              <div key={sector.id} className="grid grid-cols-[7rem_1fr_2.5rem] items-center gap-3 sm:grid-cols-[10rem_1fr_3rem]">
                <span className="truncate text-sm text-zinc-300">{sector.name}</span>
                <div className="h-7 overflow-hidden rounded-lg bg-white/[0.04]">
                  <div className="h-full rounded-lg transition-[width] duration-700"
                       style={{ width: `${(total / maximo) * 100}%`, background: `linear-gradient(90deg, ${cor}33, ${cor})`,
                                boxShadow: `0 0 16px ${cor}55` }} />
                </div>
                <span className="text-right font-mono text-sm text-white">{total}</span>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function Cartao({ rotulo, valor, sub, pequeno }: { rotulo: string; valor: string | number; sub?: string; pequeno?: boolean }) {
  return (
    <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-5 transition hover:border-neon/25">
      <div className="text-[10px] font-medium uppercase tracking-[0.22em] text-zinc-500">{rotulo}</div>
      <div className={`mt-2 truncate font-semibold text-white ${pequeno ? "text-2xl" : "text-3xl"} drop-shadow-[0_0_12px_rgba(196,255,61,0.25)]`}>
        {valor}
      </div>
      {sub && <div className="mt-1 text-xs text-neon/70">{sub}</div>}
    </div>
  );
}
