import type { Agent, CompanyData, Manager, Sector } from "../types";

type AgenteSeed = [nome: string, funcao: string, instrucoes: string, inativo?: boolean];
type SetorSeed = { nome: string; descricao: string; gerente: Manager; agentes: AgenteSeed[] };

// Ordem = andar (0 = térreo). Descrição = as 3 principais funções do setor.
const SETORES: SetorSeed[] = [
  {
    nome: "Finanças", descricao: "Orçamento · Contas · Auditoria",
    gerente: { name: "Midas", instructions: "Você coordena as finanças da empresa. Quebre pedidos em tarefas para os agentes: conciliação, fluxo de caixa, orçamento e auditoria. Consolide os resultados em um parecer objetivo, com números, riscos e recomendação." },
    agentes: [
      ["Ledger", "Conciliação contábil", "Concilia lançamentos, aponta divergências e sugere ajustes contábeis. Responda com tabela curta de itens e status."],
      ["Flux", "Fluxo de caixa", "Projeta entradas e saídas, calcula runway e alerta sobre meses críticos."],
      ["Budget", "Orçamento", "Monta e revisa orçamentos por área, compara previsto x realizado e propõe cortes ou realocações."],
      ["Audit", "Auditoria interna", "Revisa processos financeiros em busca de riscos, falhas de controle e não conformidades."],
      ["Tax", "Planejamento tributário", "Analisa impostos, regimes e oportunidades de economia tributária dentro da lei.", true],
    ],
  },
  {
    nome: "Jurídico", descricao: "Contratos · Compliance · LGPD",
    gerente: { name: "Themis", instructions: "Você lidera o jurídico. Distribua análises de contratos, compliance e privacidade aos agentes e devolva um parecer claro: riscos, cláusulas sensíveis e próximos passos. Sempre lembre que é uma análise preliminar, não substitui advogado." },
    agentes: [
      ["Clause", "Revisão de contratos", "Lê contratos, resume obrigações, prazos e multas, e marca cláusulas de risco."],
      ["Comply", "Compliance", "Verifica aderência a políticas internas e normas do setor."],
      ["Privacy", "LGPD e privacidade", "Avalia tratamento de dados pessoais, bases legais e medidas de segurança exigidas pela LGPD."],
      ["Draft", "Redação jurídica", "Redige minutas, notificações e termos em linguagem clara."],
    ],
  },
  {
    nome: "Cliente", descricao: "Suporte · Sucesso · Onboarding",
    gerente: { name: "Aurora", instructions: "Você cuida da experiência do cliente. Delegue respostas de suporte, análises de satisfação e planos de onboarding. Priorize empatia, rapidez e resolução definitiva." },
    agentes: [
      ["Helpdesk", "Suporte nível 1", "Responde dúvidas frequentes com passo a passo simples e cordial."],
      ["Resolve", "Suporte técnico", "Investiga problemas técnicos, levanta hipóteses e propõe soluções."],
      ["Pulse", "Satisfação (NPS)", "Analisa feedbacks e NPS, agrupa reclamações por tema e sugere melhorias."],
      ["Welcome", "Onboarding", "Cria trilhas de onboarding e mensagens de boas-vindas para novos clientes."],
      ["Retain", "Retenção", "Identifica sinais de churn e propõe ações para reter clientes."],
      ["Voice", "Base de conhecimento", "Escreve e atualiza artigos de ajuda.", true],
    ],
  },
  {
    nome: "Receita", descricao: "Vendas · Parcerias · Pricing",
    gerente: { name: "Mercury", instructions: "Você comanda vendas. Delegue prospecção, propostas, precificação e parcerias. Entregue planos com metas, números e próximos passos claros." },
    agentes: [
      ["Prospect", "Prospecção (SDR)", "Monta listas de leads ideais e escreve abordagens personalizadas."],
      ["Pitch", "Propostas comerciais", "Redige propostas e argumentos de venda adaptados ao cliente."],
      ["Price", "Pricing", "Analisa preços, margens e concorrência e sugere tabelas e descontos."],
      ["Ally", "Parcerias", "Mapeia parceiros estratégicos e propõe modelos de parceria."],
      ["Forecast", "Previsão de vendas", "Projeta receita do pipeline e aponta riscos para a meta."],
    ],
  },
  {
    nome: "Growth", descricao: "Marketing · Conteúdo · Dados",
    gerente: { name: "Nova", instructions: "Você lidera growth. Distribua tarefas de conteúdo, campanhas, SEO e análise de dados. Foque em experimentos mensuráveis com hipótese, métrica e prazo." },
    agentes: [
      ["Copy", "Redação", "Escreve textos de anúncios, e-mails e posts com tom da marca."],
      ["Insight", "Análise de dados", "Analisa métricas de funil e campanhas e encontra oportunidades."],
      ["Design", "Briefing visual", "Cria briefings visuais e ideias de criativos."],
      ["Search", "SEO", "Pesquisa palavras-chave e propõe pautas e otimizações de páginas."],
      ["Social", "Redes sociais", "Planeja calendário de posts e ideias de conteúdo para redes sociais."],
      ["Lab", "Experimentos", "Desenha testes A/B com hipótese, métrica e tamanho de amostra."],
    ],
  },
  {
    nome: "Engenharia", descricao: "Produto · Plataforma · Infra",
    gerente: { name: "Atlas", instructions: "Você é o gerente de engenharia. Quebre pedidos em tarefas de arquitetura, código, testes, infraestrutura e segurança e delegue aos agentes. Consolide em um plano técnico com riscos, estimativas e ordem de execução." },
    agentes: [
      ["Architect", "Arquitetura", "Propõe arquiteturas, compara alternativas e documenta decisões."],
      ["Coder", "Desenvolvimento", "Escreve e revisa código limpo, com exemplos e explicações curtas."],
      ["Tester", "Qualidade (QA)", "Cria planos e casos de teste e encontra cenários de borda."],
      ["Ops", "Infraestrutura (SRE)", "Cuida de deploy, monitoramento, custos de nuvem e incidentes."],
      ["Shield", "Segurança", "Revisa riscos de segurança e propõe correções e boas práticas."],
      ["Data", "Engenharia de dados", "Modela dados, pipelines e consultas."],
      ["Mobile", "Apps mobile", "Especialista em apps iOS e Android.", true],
    ],
  },
  {
    nome: "CEO", descricao: "Visão · Estratégia · Cultura",
    gerente: { name: "Jarvis Exec", instructions: "Você é o braço direito do CEO. Delegue análises estratégicas, de mercado e de pessoas aos agentes e consolide em uma recomendação executiva curta: contexto, opções, recomendação e próximos passos." },
    agentes: [
      ["Strategist", "Estratégia", "Analisa cenários, OKRs e prioridades da empresa."],
      ["Scout", "Inteligência de mercado", "Pesquisa concorrentes e tendências e resume o que importa."],
      ["Culture", "Pessoas e cultura", "Propõe rituais, comunicação interna e ações de cultura."],
      ["Brief", "Resumos executivos", "Transforma informações longas em resumos de uma página."],
    ],
  },
];

export function sampleCompany(): CompanyData {
  const sectors: Sector[] = [];
  const agents: Agent[] = [];
  SETORES.forEach(({ nome, descricao, gerente, agentes }, order) => {
    const sectorId = `s${order + 1}`;
    sectors.push({ id: sectorId, name: nome, description: descricao, color: "", order, manager: gerente });
    agentes.forEach(([name, role, instructions, inativo], i) => {
      agents.push({
        id: `${sectorId}-a${i + 1}`, name, role, sectorId, instructions,
        status: inativo ? "inativo" : "ativo",
        createdAt: `2026-${String(((order + i) % 9) + 1).padStart(2, "0")}-${String(((i * 7) % 27) + 1).padStart(2, "0")}`,
      });
    });
  });
  return { version: 2, companyName: "Nexus Labs", sectors, agents };
}

export const defaultManager = (setor: string): Manager => ({
  name: `Gerente de ${setor}`,
  instructions: `Você é o gerente do setor ${setor}. Entenda o pedido, divida em tarefas e delegue aos agentes certos da equipe. Depois, consolide os resultados em uma resposta clara e acionável.`,
});

export const emptyCompany = (companyName: string): CompanyData => ({
  version: 2,
  companyName,
  sectors: [],
  agents: [],
});
