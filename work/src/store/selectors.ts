/** Dados derivados (contagens, agrupamentos). Funções puras para usar com useMemo. */
import type { Agent, Sector } from "../types";

export function groupBySector(agents: Agent[]): Map<string, Agent[]> {
  const mapa = new Map<string, Agent[]>();
  for (const a of agents) {
    const lista = mapa.get(a.sectorId);
    if (lista) lista.push(a);
    else mapa.set(a.sectorId, [a]);
  }
  return mapa;
}

export function companyStats(sectors: Sector[], agents: Agent[]) {
  const porSetor = groupBySector(agents);
  const contagens = sectors.map((s) => ({ sector: s, total: porSetor.get(s.id)?.length ?? 0 }));
  const maior = contagens.reduce<(typeof contagens)[number] | null>((m, c) => (!m || c.total > m.total ? c : m), null);
  const ativos = agents.filter((a) => a.status === "ativo").length;
  return {
    totalAgents: agents.length,
    totalSectors: sectors.length,
    biggest: maior && maior.total > 0 ? maior : null,
    active: ativos,
    inactive: agents.length - ativos,
    perSector: contagens,
  };
}
