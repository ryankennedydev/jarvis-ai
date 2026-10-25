/** Grupos de funções que um bot (agente) pode executar. Espelha jarvis/bots.py (GRUPOS). */
export const BOT_FUNCTIONS = [
  { id: "web", nome: "Web", descricao: "Pesquisa na internet e lê páginas" },
  { id: "arquivos", nome: "Arquivos", descricao: "Cria, lê e lista arquivos na pasta do projeto" },
  { id: "calculo", nome: "Cálculo", descricao: "Contas exatas, data e hora" },
  { id: "jarvis", nome: "Jarvis", descricao: "Guarda memórias e cria tarefas no Jarvis" },
] as const;

export const DEFAULT_FUNCTIONS = ["web", "arquivos", "calculo"];

/** Agentes antigos (sem o campo) usam o padrão. */
export const functionsOf = (a: { functions?: string[] }) => a.functions ?? DEFAULT_FUNCTIONS;

export const NOME_FUNCAO: Record<string, string> = {
  pesquisar_web: "pesquisando", ler_pagina: "lendo", criar_arquivo: "salvando", ler_arquivo: "abrindo",
  listar_arquivos: "listando arquivos", calcular: "calculando", data_hora: "consultando a hora",
  lembrar: "memorizando", adicionar_tarefa: "criando tarefa",
};
