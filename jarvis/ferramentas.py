"""Ferramentas que o Jarvis pode usar (executadas localmente, com validação)."""

import json
import webbrowser
from datetime import datetime
from urllib.parse import urlparse

from .config import Config
from .memoria import Memoria

DIAS_SEMANA = ["segunda-feira", "terça-feira", "quarta-feira", "quinta-feira",
               "sexta-feira", "sábado", "domingo"]

DEFINICOES = [
    {
        "name": "lembrar",
        "description": (
            "Salva um fato duradouro sobre o usuário na memória de longo prazo "
            "(preferências, pessoas, projetos, metas, rotinas). Use quando o usuário "
            "contar algo que valha lembrar em conversas futuras ou pedir para lembrar."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "conteudo": {"type": "string", "description": "O fato, em uma frase clara."},
                "categoria": {
                    "type": "string",
                    "description": "Ex.: pessoal, trabalho, preferencia, saude, projeto, agenda.",
                },
            },
            "required": ["conteudo", "categoria"],
            "additionalProperties": False,
        },
    },
    {
        "name": "buscar_memorias",
        "description": "Procura na memória de longo prazo. Termo vazio lista as mais recentes.",
        "input_schema": {
            "type": "object",
            "properties": {"termo": {"type": "string"}},
            "required": ["termo"],
            "additionalProperties": False,
        },
    },
    {
        "name": "esquecer",
        "description": "Apaga uma memória pelo id. Só use quando o usuário pedir.",
        "input_schema": {
            "type": "object",
            "properties": {"id": {"type": "integer"}},
            "required": ["id"],
            "additionalProperties": False,
        },
    },
    {
        "name": "adicionar_tarefa",
        "description": "Adiciona uma tarefa à lista de afazeres do usuário.",
        "input_schema": {
            "type": "object",
            "properties": {
                "texto": {"type": "string", "description": "O que precisa ser feito."},
                "prazo": {"type": "string", "description": "Opcional, ex.: 'hoje', '25/10 14h'."},
            },
            "required": ["texto"],
            "additionalProperties": False,
        },
    },
    {
        "name": "listar_tarefas",
        "description": "Lista as tarefas do usuário (com ids). Use para planejar o dia ou a semana.",
        "input_schema": {
            "type": "object",
            "properties": {"incluir_concluidas": {"type": "boolean"}},
            "required": [],
            "additionalProperties": False,
        },
    },
    {
        "name": "concluir_tarefa",
        "description": "Marca uma tarefa como concluída pelo id.",
        "input_schema": {
            "type": "object",
            "properties": {"id": {"type": "integer"}},
            "required": ["id"],
            "additionalProperties": False,
        },
    },
    {
        "name": "data_hora_atual",
        "description": "Retorna a data, hora e dia da semana atuais do computador do usuário.",
        "input_schema": {"type": "object", "properties": {}, "additionalProperties": False},
    },
    {
        "name": "abrir_site",
        "description": "Abre uma página https no navegador padrão do usuário.",
        "input_schema": {
            "type": "object",
            "properties": {"url": {"type": "string", "description": "URL completa com https://"}},
            "required": ["url"],
            "additionalProperties": False,
        },
    },
]

# Faz o input das ferramentas chegar em streaming conforme é gerado.
for _definicao in DEFINICOES:
    _definicao["eager_input_streaming"] = True


class ErroFerramenta(Exception):
    pass


def _validar(nome: str, entrada: object) -> dict:
    """Confere o input contra o schema (com streaming ansioso a API não valida por nós)."""
    definicao = next((d for d in DEFINICOES if d["name"] == nome), None)
    if definicao is None:
        raise ErroFerramenta(f"Ferramenta desconhecida: {nome}")
    if not isinstance(entrada, dict):
        raise ErroFerramenta("Entrada inválida: esperado um objeto JSON.")
    schema = definicao["input_schema"]
    for campo in schema.get("required", []):
        if campo not in entrada:
            raise ErroFerramenta(f"Campo obrigatório ausente: {campo}")
    tipos = {"string": str, "integer": int, "boolean": bool}
    for campo, valor in entrada.items():
        propriedade = schema["properties"].get(campo)
        if propriedade is None:
            raise ErroFerramenta(f"Campo não permitido: {campo}")
        esperado = tipos[propriedade["type"]]
        # bool é subclasse de int em Python: True não pode passar como inteiro.
        if not isinstance(valor, esperado) or (esperado is not bool and isinstance(valor, bool)):
            raise ErroFerramenta(f"Campo '{campo}' deveria ser {propriedade['type']}.")
    return entrada


class Ferramentas:
    def __init__(self, memoria: Memoria, config: Config):
        self.memoria = memoria
        self.config = config

    def executar(self, nome: str, entrada: object) -> str:
        """Executa uma ferramenta e devolve o resultado como texto (JSON)."""
        dados = _validar(nome, entrada)
        metodo = getattr(self, f"_{nome}")
        return json.dumps(metodo(**dados), ensure_ascii=False)

    def _lembrar(self, conteudo: str, categoria: str) -> dict:
        if not conteudo.strip():
            raise ErroFerramenta("Conteúdo vazio.")
        if len(conteudo) > 2000:
            raise ErroFerramenta("Memória longa demais (máx. 2000 caracteres).")
        memoria_id = self.memoria.lembrar(conteudo, categoria)
        return {"ok": True, "id": memoria_id}

    def _buscar_memorias(self, termo: str) -> dict:
        linhas = self.memoria.buscar(termo)
        return {"memorias": [
            {"id": l["id"], "categoria": l["categoria"], "conteudo": l["conteudo"]} for l in linhas
        ]}

    def _esquecer(self, id: int) -> dict:
        return {"ok": self.memoria.esquecer(id)}

    def _adicionar_tarefa(self, texto: str, prazo: str = "") -> dict:
        if not texto.strip():
            raise ErroFerramenta("Tarefa vazia.")
        return {"ok": True, "id": self.memoria.adicionar_tarefa(texto[:500], prazo[:60])}

    def _listar_tarefas(self, incluir_concluidas: bool = False) -> dict:
        return {"tarefas": [
            {"id": t["id"], "texto": t["texto"], "prazo": t["prazo"], "feita": bool(t["feita"])}
            for t in self.memoria.tarefas(incluir_concluidas)
        ]}

    def _concluir_tarefa(self, id: int) -> dict:
        return {"ok": self.memoria.concluir_tarefa(id)}

    def _data_hora_atual(self) -> dict:
        agora = datetime.now().astimezone()
        return {
            "data": agora.strftime("%d/%m/%Y"),
            "hora": agora.strftime("%H:%M"),
            "dia_semana": DIAS_SEMANA[agora.weekday()],
            "fuso": agora.strftime("%Z %z"),
        }

    def _abrir_site(self, url: str) -> dict:
        partes = urlparse(url)
        if partes.scheme != "https" or not partes.hostname:
            raise ErroFerramenta("Só abro endereços https:// válidos.")
        host = partes.hostname.lower()
        permitidos = self.config.sites_permitidos
        if permitidos and not any(host == d or host.endswith("." + d) for d in permitidos):
            raise ErroFerramenta(f"O domínio {host} não está em JARVIS_SITES_PERMITIDOS.")
        webbrowser.open(url, new=2)
        return {"ok": True, "aberto": url}
