/**
 * Calcula onde cada nó do cérebro fica (coordenadas de "mundo", centro = núcleo).
 * Puro e determinístico: mesmos dados => mesmo desenho.
 */
import { sectorColor } from "../../lib/util";
import type { Agent, Sector } from "../../types";

export interface SectorNode {
  kind: "sector";
  id: string;
  sector: Sector;
  x: number;
  y: number;
  angle: number;
  color: string;
  agents: AgentNode[];
  label: { x: number; y: number; align: CanvasTextAlign };
}

export interface AgentNode {
  kind: "agent";
  id: string;
  agent: Agent;
  sectorId: string;
  x: number;
  y: number;
  color: string;
}

export type BrainNode = SectorNode | AgentNode;

export interface BrainLayout {
  sectors: SectorNode[];
  agents: AgentNode[];
  byId: Map<string, BrainNode>;
  /** Meia-largura da área ocupada (para enquadrar a câmera). */
  extent: number;
}

const ANEL_INICIAL = 58;   // distância do setor até o 1º anel de funcionários
const ANEL_PASSO = 36;     // distância entre anéis
const ABERTURA = Math.PI * 0.95;

/** Quantos funcionários cabem em cada anel (cresce para fora). */
const capacidade = (anel: number) => 7 + anel * 5;

function aneis(total: number): number {
  let restantes = total, anel = 0;
  while (restantes > 0) { restantes -= capacidade(anel); anel++; }
  return Math.max(1, anel);
}

export function computeLayout(sectors: Sector[], porSetor: Map<string, Agent[]>): BrainLayout {
  const ordenados = [...sectors].sort((a, b) => a.order - b.order);
  const n = ordenados.length;
  const maiorEquipe = Math.max(0, ...ordenados.map((s) => porSetor.get(s.id)?.length ?? 0));
  const raioLeque = ANEL_INICIAL + (aneis(maiorEquipe) - 1) * ANEL_PASSO;

  // Raio do círculo de setores: grande o bastante para os leques não se tocarem.
  const separacao = n > 1 ? (raioLeque * 2 + 70) / (2 * Math.sin(Math.PI / Math.max(n, 3))) : 0;
  const R = Math.max(240, raioLeque + 150, separacao);

  const setoresNos: SectorNode[] = [];
  const funcionarios: AgentNode[] = [];
  const byId = new Map<string, BrainNode>();

  ordenados.forEach((sector, i) => {
    // Começa embaixo (térreo) e gira no sentido horário, como subir o prédio.
    const angle = Math.PI / 2 + (i / Math.max(n, 1)) * Math.PI * 2;
    const x = Math.cos(angle) * R, y = Math.sin(angle) * R;
    const color = sectorColor(sector.color);
    const distRotulo = R + raioLeque + 64;
    const cos = Math.cos(angle);
    const no: SectorNode = {
      kind: "sector", id: sector.id, sector, x, y, angle, color, agents: [],
      label: {
        x: Math.cos(angle) * distRotulo,
        y: Math.sin(angle) * distRotulo,
        align: cos > 0.3 ? "left" : cos < -0.3 ? "right" : "center",
      },
    };

    const equipe = porSetor.get(sector.id) ?? [];
    let usados = 0, anel = 0;
    while (usados < equipe.length) {
      const noAnel = Math.min(capacidade(anel), equipe.length - usados);
      const raio = ANEL_INICIAL + anel * ANEL_PASSO;
      // Anéis externos abrem um pouco menos para manter o leque compacto.
      const abertura = noAnel === 1 ? 0 : Math.min(ABERTURA, ABERTURA * (noAnel / capacidade(anel)) + 0.5);
      for (let k = 0; k < noAnel; k++) {
        const t = noAnel === 1 ? 0 : k / (noAnel - 1) - 0.5;
        const a = angle + t * abertura + (anel % 2) * 0.06;
        const agent = equipe[usados + k]!;
        const en: AgentNode = {
          kind: "agent", id: agent.id, agent, sectorId: sector.id,
          x: x + Math.cos(a) * raio, y: y + Math.sin(a) * raio, color,
        };
        no.agents.push(en);
        funcionarios.push(en);
        byId.set(en.id, en);
      }
      usados += noAnel;
      anel++;
    }
    setoresNos.push(no);
    byId.set(no.id, no);
  });

  return { sectors: setoresNos, agents: funcionarios, byId, extent: n ? R + raioLeque + 230 : 260 };
}
