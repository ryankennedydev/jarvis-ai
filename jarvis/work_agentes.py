"""Equipes de IA do módulo Work: um gerente por setor que delega tarefas aos agentes.

Fluxo de uma mensagem:
  você -> gerente (Claude, streaming) -> ferramenta `delegar` -> agente (Claude, com as
  instruções dele) -> resultado volta ao gerente -> resposta consolidada para você.
"""

import json
import threading
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Callable

import anthropic

from . import bots
from .cerebro import _limpar_fallback, _mensagem_erro, _para_dict
from .config import Config
from .provedores import ClienteCompativel, limpar_para_anthropic
from .seguranca import proteger_arquivo

Emissor = Callable[[str, object], None]

LIMITE_TEXTO = 8000
MAX_AGENTES_PARALELO = 4

PROMPT_GERENTE = """\
Você é {gerente}, gerente de IA do setor {setor} da empresa {empresa}.
Quem fala com você é o dono da empresa.

Suas instruções (definidas pelo dono):
{instrucoes}

Sua equipe de agentes de IA:
{equipe}

Como trabalhar:
- Seus agentes são BOTS EXECUTORES: cada um tem funções reais (pesquisar na web, ler sites, criar arquivos, \
calcular, criar tarefas no Jarvis). Delegue o trabalho de verdade para eles, de acordo com a função e as habilidades de cada um.
- Para tarefas que caibam na função de um agente, use a ferramenta `delegar` com uma tarefa clara e completa \
(o agente não vê esta conversa, só a tarefa que você escrever).
- Os arquivos que os bots criam ficam na pasta do setor; cite os nomes dos arquivos na resposta final.
- Você pode delegar para vários agentes ao mesmo tempo, com várias chamadas na mesma resposta.
- Agentes inativos não podem receber tarefas.
- Perguntas simples ou de conversa você mesmo responde, sem delegar.
- No final, consolide o que a equipe entregou em uma resposta clara e acionável, citando quem fez o quê.
- Responda em português do Brasil. A interface mostra Markdown simples (negrito, listas, `código`).
"""

PROMPT_AGENTE = """\
Você é {nome}, agente de IA do setor {setor} da empresa {empresa}. Sua função: {funcao}.

Suas instruções:
{instrucoes}

Você recebe tarefas do seu gerente, {gerente}. Você é um BOT EXECUTOR: use suas funções ({funcoes}) para \
fazer o trabalho de verdade (pesquisar, ler fontes, calcular, salvar arquivos) em vez de só descrever o que faria. \
Nunca diga que não tem acesso à internet ou a arquivos se tiver a função correspondente.
Entregue o resultado completo e direto, em português do Brasil, pronto para o gerente usar, citando fontes \
e arquivos criados. Se faltar informação, faça suposições razoáveis e diga quais foram.
"""


def _texto_de(blocos) -> str:
    return "".join(getattr(b, "text", "") for b in blocos if getattr(b, "type", "") == "text").strip()


class EquipesWork:
    def __init__(self, config: Config, arquivo_historico: Path, pasta_arquivos: Path | None = None, memoria=None):
        self.config = config
        self.pasta_arquivos = pasta_arquivos or arquivo_historico.parent / "work_arquivos"
        self.memoria = memoria
        if config.provedor == "anthropic":
            self.cliente = anthropic.Anthropic(api_key=config.api_key, max_retries=3)
        else:
            self.cliente = ClienteCompativel(config.provedor, config.api_key, config.modelo)
        self._arquivo = arquivo_historico
        self._trava = threading.Lock()
        self._ocupados: set[str] = set()
        self._cancelar: dict[str, threading.Event] = {}
        try:
            self._historicos: dict[str, list] = json.loads(arquivo_historico.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            self._historicos = {}

    # --- Histórico ------------------------------------------------

    def _salvar(self) -> None:
        with self._trava:
            temporario = self._arquivo.with_suffix(".tmp")
            temporario.write_text(json.dumps(self._historicos, ensure_ascii=False), encoding="utf-8")
            proteger_arquivo(temporario)
            temporario.replace(self._arquivo)

    def historico(self, setor_id: str) -> list[dict]:
        """O que aparece no chat: suas falas, delegações e respostas do gerente."""
        falas: list[dict] = []
        for msg in self._historicos.get(setor_id, []):
            conteudo = msg["content"]
            if msg["role"] == "user":
                if isinstance(conteudo, str):
                    falas.append({"kind": "usuario", "text": conteudo})
                continue
            for bloco in conteudo:
                if bloco.get("type") == "tool_use" and bloco.get("name") == "delegar":
                    entrada = bloco.get("input") or {}
                    falas.append({"kind": "atividade", "agentId": entrada.get("agente_id"),
                                  "text": entrada.get("tarefa", ""), "done": True})
                elif bloco.get("type") == "text" and bloco.get("text", "").strip():
                    if falas and falas[-1]["kind"] == "gerente":
                        falas[-1]["text"] += bloco["text"]
                    else:
                        falas.append({"kind": "gerente", "text": bloco["text"]})
        return falas

    def limpar(self, setor_id: str) -> None:
        if setor_id in self._ocupados:
            raise RuntimeError("Aguarde o gerente terminar.")
        self._historicos.pop(setor_id, None)
        self._salvar()

    def ocupado(self, setor_id: str) -> bool:
        return setor_id in self._ocupados

    def parar(self, setor_id: str) -> None:
        if setor_id in self._cancelar:
            self._cancelar[setor_id].set()

    # --- Conversa com o gerente --------------------------------------

    def conversar(self, contexto: dict, texto: str, emitir: Emissor) -> None:
        """Processa uma mensagem para o gerente do setor (bloqueante: rode numa thread)."""
        setor = contexto["setor"]
        setor_id = setor["id"]
        texto = texto.strip()[:LIMITE_TEXTO]
        if not texto or setor_id in self._ocupados:
            return
        self._ocupados.add(setor_id)
        cancelar = self._cancelar[setor_id] = threading.Event()

        agentes = {a["id"]: a for a in contexto["agentes"] if a.get("sectorId") == setor_id}
        ativos = [a for a in agentes.values() if a.get("status") == "ativo"]
        sistema = PROMPT_GERENTE.format(
            gerente=setor["manager"]["name"], setor=setor["name"], empresa=contexto["empresa"],
            instrucoes=setor["manager"]["instructions"].strip() or "(sem instruções específicas)",
            equipe="\n".join(
                f"- {a['id']}: {a['name']} — {a['role']} ({a['status']}) · funções: {bots.descrever(bots.grupos_do_agente(a))}"
                for a in agentes.values()
            ) or "(nenhum agente ainda: responda você mesmo)",
        )
        ferramentas = []
        if ativos:
            ferramentas.append({
                "name": "delegar",
                "description": "Passa uma tarefa para um agente da sua equipe e recebe o resultado dele.",
                "eager_input_streaming": True,
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "agente_id": {"type": "string", "enum": [a["id"] for a in ativos]},
                        "tarefa": {"type": "string", "description": "Tarefa completa e autossuficiente."},
                    },
                    "required": ["agente_id", "tarefa"],
                    "additionalProperties": False,
                },
            })

        mensagens = self._historicos.setdefault(setor_id, [])
        tamanho_inicial = len(mensagens)
        mensagens.append({"role": "user", "content": texto})
        evento = lambda tipo, dado=None: emitir(tipo, {"setor": setor_id, **(dado or {})})  # noqa: E731

        try:
            falhas_json = 0
            while True:
                try:
                    resposta = self._chamar_gerente(sistema, mensagens, ferramentas, cancelar, evento)
                    falhas_json = 0
                except ValueError:
                    falhas_json += 1
                    if falhas_json > 2:
                        raise
                    continue
                if resposta is None:  # cancelado
                    del mensagens[tamanho_inicial:]
                    break
                if resposta.stop_reason == "refusal":
                    del mensagens[tamanho_inicial:]
                    evento("work_erro", {"texto": "O gerente não pode ajudar com esse pedido. Tente reformular."})
                    break

                conteudo = _limpar_fallback(resposta.content)
                mensagens.append({"role": "assistant", "content": [_para_dict(b) for b in conteudo]})
                if resposta.stop_reason == "pause_turn":
                    continue
                chamadas = [b for b in conteudo if b.type == "tool_use"]
                if not chamadas:
                    break
                truncada = resposta.stop_reason == "max_tokens"
                resultados = self._executar_delegacoes(chamadas, truncada, setor, agentes, contexto, evento)
                mensagens.append({"role": "user", "content": resultados})
        except Exception as erro:  # noqa: BLE001 - qualquer falha vira mensagem no chat
            del mensagens[tamanho_inicial:]
            evento("work_erro", {"texto": _mensagem_erro(erro, self.config.provedor)})
        finally:
            self._ocupados.discard(setor_id)
            self._cancelar.pop(setor_id, None)
            self._salvar()
            evento("work_fim")

    def _chamar_gerente(self, sistema, mensagens, ferramentas, cancelar, evento):
        if self.config.provedor != "anthropic":
            return self.cliente.chamar(
                sistema, mensagens, ferramentas, self.config.esforco,
                ao_texto=lambda t: evento("work_texto", {"texto": t}), cancelar=cancelar,
            )
        parametros = dict(
            model=self.config.modelo,
            max_tokens=64000,
            system=sistema,
            messages=limpar_para_anthropic(mensagens),
            thinking={"type": "adaptive", "display": "summarized"},
            output_config={"effort": self.config.esforco},
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
        )
        if ferramentas:
            parametros["tools"] = ferramentas
        with self.cliente.beta.messages.stream(**parametros) as stream:
            for ev in stream:
                if cancelar.is_set():
                    return None
                if ev.type == "content_block_start" and ev.content_block.type == "thinking":
                    evento("work_pensando")
                elif ev.type == "text":
                    evento("work_texto", {"texto": ev.text})
            return stream.get_final_message()

    # --- Agentes ------------------------------------------------------

    def _executar_delegacoes(self, chamadas, truncada, setor, agentes, contexto, evento) -> list[dict]:
        def executar(chamada) -> dict:
            base = {"type": "tool_result", "tool_use_id": chamada.id}
            entrada = chamada.input if isinstance(chamada.input, dict) else {}
            agente = agentes.get(str(entrada.get("agente_id", "")))
            tarefa = str(entrada.get("tarefa", "")).strip()
            if truncada:
                return {**base, "is_error": True, "content": "Chamada cortada pelo limite de tokens. Tente de novo."}
            if chamada.name != "delegar" or not agente or not tarefa:
                return {**base, "is_error": True, "content": "Agente ou tarefa inválidos."}
            if agente.get("status") != "ativo":
                return {**base, "is_error": True, "content": f"{agente['name']} está inativo."}

            evento("work_atividade", {"agente": agente["id"], "texto": tarefa, "estado": "inicio"})
            try:
                resultado = self._rodar_agente(agente, setor, contexto["empresa"], tarefa, evento)
                evento("work_atividade", {"agente": agente["id"], "texto": tarefa, "estado": "fim"})
                return {**base, "content": resultado or "(o agente não retornou texto)"}
            except Exception as erro:  # noqa: BLE001
                evento("work_atividade", {"agente": agente["id"], "texto": tarefa, "estado": "erro"})
                return {**base, "is_error": True, "content": _mensagem_erro(erro, self.config.provedor)}

        with ThreadPoolExecutor(max_workers=MAX_AGENTES_PARALELO) as pool:
            return list(pool.map(executar, chamadas))

    def _rodar_agente(self, agente: dict, setor: dict, empresa: str, tarefa: str, evento=None) -> str:
        grupos = bots.grupos_do_agente(agente)
        sistema = PROMPT_AGENTE.format(
            nome=agente["name"], setor=setor["name"], empresa=empresa, funcao=agente["role"],
            instrucoes=agente.get("instructions", "").strip() or "(sem instruções específicas)",
            gerente=setor["manager"]["name"], funcoes=bots.descrever(grupos),
        )
        executor = bots.ExecutorBot(grupos, bots.pasta_de(self.pasta_arquivos, f"setor_{setor['id']}"), self.memoria)

        def ao_funcao(nome: str, resumo: str, estado: str) -> None:
            if evento and estado != "ok":
                evento("work_funcao", {"agente": agente["id"], "nome": nome, "texto": resumo, "estado": estado})

        resultado = bots.rodar_bot(
            self.cliente, self.config, sistema, [{"role": "user", "content": tarefa[:LIMITE_TEXTO]}],
            executor, self.config.esforco_agentes, ao_funcao=ao_funcao,
        )
        return resultado or ""


# =====================================================================
#  Projetos (estilo Maestri): cada agente é um terminal próprio que
#  trabalha em paralelo com os outros, dentro de um mesmo projeto.
# =====================================================================

MAX_HISTORICO_TERMINAL = 40  # mensagens guardadas por terminal

PROMPT_TERMINAL = """\
Você é {nome}, agente de IA da empresa {empresa}. Sua função: {funcao}.

Suas instruções:
{instrucoes}

Você está trabalhando no projeto "{projeto}".
Objetivo do projeto: {objetivo}

Outros agentes trabalham no mesmo projeto ao mesmo tempo que você:
{colegas}

O que a equipe já entregou neste projeto (resumo):
{mural}

Você é um BOT EXECUTOR com estas funções: {funcoes}.
Os arquivos do projeto ficam numa pasta compartilhada com os colegas (use listar_arquivos e ler_arquivo \
para aproveitar o que eles salvaram).

Como trabalhar:
- Use suas funções para fazer o trabalho de verdade (pesquisar, ler fontes, calcular, salvar arquivos), \
em vez de só descrever o que faria. Nunca diga que não tem acesso à internet ou a arquivos se tiver a função.
- Execute a tarefa recebida por completo e entregue o resultado pronto para uso, citando fontes e arquivos criados.
- Aproveite o que os colegas já entregaram, sem refazer o trabalho deles.
- Se faltar informação, faça suposições razoáveis e diga quais foram.
- Responda em português do Brasil, em Markdown simples (negrito, listas, `código`).
"""

PROMPT_PLANEJAR = """\
Você é {gerente}, gerente de projetos da empresa {empresa}.
Divida o projeto abaixo em tarefas para a equipe, aproveitando o trabalho em paralelo.

Projeto: {projeto}
Objetivo: {objetivo}

Equipe disponível (id: nome, função, funções que o bot sabe executar):
{equipe}

Regras:
- De 1 a 3 tarefas por agente, só para quem tiver a ver com o objetivo.
- Cada tarefa precisa ser autossuficiente: o agente só vê o texto dela e o objetivo do projeto.
- Responda APENAS com JSON, sem comentários, neste formato:
{{"tarefas": [{{"agente_id": "id", "titulo": "tarefa curta e clara"}}]}}
"""


class TerminaisWork:
    """Um terminal de IA por (projeto, agente). Vários rodam ao mesmo tempo."""

    def __init__(self, equipes: EquipesWork, arquivo: Path):
        self._equipes = equipes
        self._arquivo = arquivo
        self._trava = threading.Lock()
        self._ocupados: set[str] = set()
        self._cancelar: dict[str, threading.Event] = {}
        try:
            self._historicos: dict[str, list] = json.loads(arquivo.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            self._historicos = {}

    @staticmethod
    def chave(projeto_id: str, agente_id: str) -> str:
        return f"{projeto_id}:{agente_id}"

    def _salvar(self) -> None:
        with self._trava:
            temporario = self._arquivo.with_suffix(".tmp")
            temporario.write_text(json.dumps(self._historicos, ensure_ascii=False), encoding="utf-8")
            proteger_arquivo(temporario)
            temporario.replace(self._arquivo)

    def ocupados(self, projeto_id: str) -> list[str]:
        prefixo = f"{projeto_id}:"
        return [c.split(":", 1)[1] for c in self._ocupados if c.startswith(prefixo)]

    def historico(self, projeto_id: str) -> dict[str, list[dict]]:
        """Falas de cada terminal do projeto: {agente_id: [{papel, texto}]}."""
        prefixo = f"{projeto_id}:"
        saida: dict[str, list[dict]] = {}
        for chave, mensagens in self._historicos.items():
            if not chave.startswith(prefixo):
                continue
            falas = []
            for m in mensagens:
                texto = m["content"] if isinstance(m["content"], str) else _texto_de_dicts(m["content"])
                if texto.strip():
                    falas.append({"papel": "voce" if m["role"] == "user" else "agente", "texto": texto})
            saida[chave.split(":", 1)[1]] = falas
        return saida

    def limpar_projeto(self, projeto_id: str) -> None:
        prefixo = f"{projeto_id}:"
        for chave in [c for c in self._historicos if c.startswith(prefixo)]:
            if chave not in self._ocupados:
                del self._historicos[chave]
        self._salvar()

    def limpar(self, projeto_id: str, agente_id: str) -> None:
        chave = self.chave(projeto_id, agente_id)
        if chave in self._ocupados:
            raise RuntimeError("Aguarde o agente terminar.")
        self._historicos.pop(chave, None)
        self._salvar()

    def parar(self, projeto_id: str, agente_id: str | None = None) -> None:
        for chave, evento in list(self._cancelar.items()):
            if chave.startswith(f"{projeto_id}:") and (agente_id is None or chave.endswith(f":{agente_id}")):
                evento.set()

    def ocupado(self, projeto_id: str, agente_id: str) -> bool:
        return self.chave(projeto_id, agente_id) in self._ocupados

    def reservar(self, projeto_id: str, agente_id: str) -> bool:
        """Marca o terminal como ocupado antes de abrir a thread (evita dois pedidos juntos)."""
        chave = self.chave(projeto_id, agente_id)
        with self._trava:
            if chave in self._ocupados:
                return False
            self._ocupados.add(chave)
            return True

    # --- Execução ---------------------------------------------------

    def enviar(self, contexto: dict, texto: str, emitir: Emissor) -> None:
        """Roda um pedido num terminal (bloqueante: rode numa thread já reservada)."""
        projeto, agente = contexto["projeto"], contexto["agente"]
        chave = self.chave(projeto["id"], agente["id"])
        tarefa_id = contexto.get("tarefaId")
        cancelar = self._cancelar[chave] = threading.Event()
        base = {"projeto": projeto["id"], "agente": agente["id"], "tarefa": tarefa_id}
        evento = lambda tipo, dado=None: emitir(tipo, {**base, **(dado or {})})  # noqa: E731

        colegas = "\n".join(f"- {c['name']}: {c['role']}" for c in contexto.get("colegas", [])
                            if c.get("id") != agente["id"]) or "(só você)"
        mural = "\n".join(f"- {m['agente']}: {m['titulo']} -> {m['resumo'][:600]}"
                          for m in contexto.get("mural", [])[-12:]) or "(nada ainda)"
        sistema = PROMPT_TERMINAL.format(
            nome=agente["name"], empresa=contexto.get("empresa", ""), funcao=agente.get("role", ""),
            instrucoes=agente.get("instructions", "").strip() or "(sem instruções específicas)",
            projeto=projeto.get("name", ""), objetivo=projeto.get("goal", "").strip() or "(não definido)",
            colegas=colegas, mural=mural, funcoes=bots.descrever(bots.grupos_do_agente(agente)),
        )
        mensagens = self._historicos.setdefault(chave, [])
        tamanho_inicial = len(mensagens)
        mensagens.append({"role": "user", "content": texto.strip()[:LIMITE_TEXTO]})
        partes: list[str] = []

        def ao_texto(t: str) -> None:
            partes.append(t)
            evento("terminal_texto", {"texto": t})

        grupos = bots.grupos_do_agente(agente)

        def ao_funcao(nome: str, resumo: str, estado: str) -> None:
            if estado != "ok":
                evento("terminal_funcao", {"nome": nome, "texto": resumo, "estado": estado})

        try:
            evento("terminal_inicio")
            executor = bots.ExecutorBot(grupos, bots.pasta_de(self._equipes.pasta_arquivos, projeto["id"]),
                                        self._equipes.memoria)
            texto_final = bots.rodar_bot(
                self._equipes.cliente, self._equipes.config, sistema, mensagens, executor,
                self._equipes.config.esforco_agentes, ao_texto=ao_texto, ao_funcao=ao_funcao,
                cancelar=cancelar, ao_pensar=lambda: evento("terminal_pensando"),
            )
            if texto_final is None:  # cancelado
                del mensagens[tamanho_inicial:]
                evento("terminal_fim", {"estado": "cancelado"})
                return
            mensagens.append({"role": "assistant", "content": texto_final or "".join(partes)})
            del mensagens[:-MAX_HISTORICO_TERMINAL]
            evento("terminal_fim", {"estado": "feito", "resultado": (texto_final or "".join(partes))[:4000]})
        except Exception as erro:  # noqa: BLE001 - qualquer falha vira mensagem no terminal
            del mensagens[tamanho_inicial:]
            evento("terminal_fim", {"estado": "erro", "resultado": _mensagem_erro(erro, self._equipes.config.provedor)})
        finally:
            self._ocupados.discard(chave)
            self._cancelar.pop(chave, None)
            self._salvar()

    # --- Planejamento pelo gerente --------------------------------------

    def planejar(self, contexto: dict) -> list[dict]:
        """O gerente divide o objetivo do projeto em tarefas por agente."""
        projeto, equipe = contexto["projeto"], contexto["agentes"]
        ativos = {a["id"]: a for a in equipe if a.get("status") == "ativo"}
        if not ativos:
            raise RuntimeError("Coloque pelo menos um agente ativo no projeto.")
        if not projeto.get("goal", "").strip():
            raise RuntimeError("Escreva o objetivo do projeto primeiro.")
        sistema = PROMPT_PLANEJAR.format(
            gerente=contexto.get("gerente") or "o gerente", empresa=contexto.get("empresa", ""),
            projeto=projeto.get("name", ""), objetivo=projeto["goal"].strip()[:LIMITE_TEXTO],
            equipe="\n".join(f"- {a['id']}: {a['name']}, {a['role']}, funções: {bots.descrever(bots.grupos_do_agente(a))}"
                              for a in ativos.values()),
        )
        pedido = [{"role": "user", "content": "Monte o plano de tarefas agora."}]
        config, cliente = self._equipes.config, self._equipes.cliente
        if config.provedor != "anthropic":
            texto = _texto_de(cliente.chamar(sistema, pedido, [], config.esforco_agentes).content)
        else:
            resposta = cliente.beta.messages.create(
                model=config.modelo, max_tokens=8000, system=sistema, messages=pedido,
                output_config={"effort": config.esforco_agentes},
                betas=["server-side-fallback-2026-07-01"], fallbacks="default",
            )
            texto = _texto_de(resposta.content)
        return _ler_plano(texto, ativos)


def _texto_de_dicts(blocos: list) -> str:
    return "".join(b.get("text", "") for b in blocos if isinstance(b, dict) and b.get("type") == "text")


def _ler_plano(texto: str, ativos: dict) -> list[dict]:
    """Extrai o JSON do plano, tolerando cercas de código e texto em volta."""
    inicio, fim = texto.find("{"), texto.rfind("}")
    if inicio < 0 or fim <= inicio:
        raise RuntimeError("O gerente não devolveu um plano válido. Tente de novo.")
    try:
        dados = json.loads(texto[inicio:fim + 1])
    except json.JSONDecodeError:
        raise RuntimeError("O gerente não devolveu um plano válido. Tente de novo.")
    tarefas = []
    for t in dados.get("tarefas", []) if isinstance(dados, dict) else []:
        agente_id, titulo = str(t.get("agente_id", "")), str(t.get("titulo", "")).strip()
        if agente_id in ativos and titulo:
            tarefas.append({"agentId": agente_id, "title": titulo[:600]})
    if not tarefas:
        raise RuntimeError("O plano veio vazio. Detalhe melhor o objetivo e tente de novo.")
    return tarefas[:30]
