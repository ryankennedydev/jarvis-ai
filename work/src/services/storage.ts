/**
 * Camada de dados do Work. É o ÚNICO lugar que sabe onde os dados ficam:
 * para trocar por uma API, basta implementar outro `DataRepository`.
 *
 * - Dentro do Jarvis: salva via Python (arquivo dados/work.json com permissão 600).
 * - Fora dele (npm run dev, navegador): usa localStorage.
 */
import { defaultManager, sampleCompany } from "../data/seed";
import type { Agent, CompanyData, Sector } from "../types";

export interface DataRepository {
  load(): Promise<CompanyData | null>;
  save(data: CompanyData): Promise<void>;
}

const CHAVE = "skilltree:v1";

interface JarvisApi {
  work_carregar(): Promise<string | null>;
  work_salvar(json: string): Promise<void>;
}

function jarvisApi(): JarvisApi | null {
  try {
    const api = (window.parent as unknown as { pywebview?: { api?: Partial<JarvisApi> } })?.pywebview?.api;
    return api?.work_carregar && api?.work_salvar ? (api as JarvisApi) : null;
  } catch {
    return null; // iframe de outra origem
  }
}

interface DadosV1 {
  version: 1;
  companyName: string;
  sectors: Array<Omit<Sector, "manager">>;
  employees: Array<{ id: string; name: string; role: string; sectorId: string; status: Agent["status"]; joinedAt: string }>;
}

/** v1 tinha "funcionários" humanos; a v2 tem gerente + agentes de IA por setor. */
function migrarV1(d: DadosV1): CompanyData {
  // Dados de exemplo antigos (ids "s1-e1"...) viram a nova empresa de exemplo com IAs.
  if (d.employees.every((e) => /^s\d+-e\d+$/.test(e.id))) return sampleCompany();
  return {
    version: 2,
    companyName: d.companyName,
    sectors: d.sectors.map((s) => ({ ...s, manager: defaultManager(s.name) })),
    agents: d.employees.map((e) => ({
      id: e.id, name: e.name, role: e.role, sectorId: e.sectorId, status: e.status, createdAt: e.joinedAt,
      instructions: `Você é responsável por: ${e.role}. Execute as tarefas recebidas do gerente com objetividade.`,
    })),
  };
}

function validar(bruto: unknown): CompanyData | null {
  const d = bruto as CompanyData | DadosV1;
  if (!d || !Array.isArray(d.sectors)) return null;
  if (d.version === 1 && Array.isArray(d.employees)) return migrarV1(d);
  if (d.version === 2 && Array.isArray(d.agents)) return d;
  return null;
}

const localRepository: DataRepository = {
  async load() {
    try {
      const texto = localStorage.getItem(CHAVE);
      return texto ? validar(JSON.parse(texto)) : null;
    } catch {
      return null;
    }
  },
  async save(data) {
    try {
      localStorage.setItem(CHAVE, JSON.stringify(data));
    } catch (erro) {
      console.warn("Não foi possível salvar no localStorage", erro);
    }
  },
};

const jarvisRepository = (api: JarvisApi): DataRepository => ({
  async load() {
    const texto = await api.work_carregar();
    return texto ? validar(JSON.parse(texto)) : null;
  },
  async save(data) {
    await api.work_salvar(JSON.stringify(data));
  },
});

/** Espera a ponte do pywebview ficar pronta (o iframe pode carregar antes dela). */
async function detectar(): Promise<DataRepository> {
  for (let i = 0; i < 20; i++) {
    const api = jarvisApi();
    if (api) return jarvisRepository(api);
    const dentroDoJarvis = window.parent !== window;
    if (!dentroDoJarvis) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  return localRepository;
}

let repositorio: Promise<DataRepository> | null = null;
export const getRepository = () => (repositorio ??= detectar());
