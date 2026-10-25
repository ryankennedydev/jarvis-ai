"""GPT (OpenAI) e Gemini (Google) com a mesma "cara" de resposta do Claude.

O histórico continua salvo no formato da Anthropic (blocos text / tool_use / tool_result).
Este módulo traduz esse histórico para o formato de chat da OpenAI, chama o modelo
em streaming e devolve uma resposta com .content e .stop_reason, como o SDK do Claude.
O Gemini é usado pelo endpoint compatível com a OpenAI que o Google oferece.
"""

import json
import threading
import uuid
from dataclasses import dataclass, field
from typing import Callable

import openai

URL_GEMINI = "https://generativelanguage.googleapis.com/v1beta/openai/"

NOMES = {"anthropic": "Anthropic", "openai": "OpenAI", "gemini": "Google"}

# A OpenAI e o Gemini só aceitam low | medium | high.
ESFORCO_OPENAI = {"low": "low", "medium": "medium", "high": "high", "xhigh": "high", "max": "high"}


@dataclass
class Bloco:
    type: str
    text: str = ""
    id: str = ""
    name: str = ""
    input: dict = field(default_factory=dict)
    extra: dict | None = None  # assinatura de pensamento do Gemini 3

    def model_dump(self, **_) -> dict:
        if self.type == "text":
            return {"type": "text", "text": self.text}
        bloco = {"type": "tool_use", "id": self.id, "name": self.name, "input": self.input}
        if self.extra:
            bloco["extra_content"] = self.extra
        return bloco


@dataclass
class Resposta:
    content: list
    stop_reason: str


def criar_cliente(provedor: str, api_key: str) -> openai.OpenAI:
    if provedor == "gemini":
        return openai.OpenAI(api_key=api_key, base_url=URL_GEMINI, max_retries=1)
    return openai.OpenAI(api_key=api_key, max_retries=1)


def _texto_resultado(conteudo) -> str:
    if isinstance(conteudo, str):
        return conteudo
    if isinstance(conteudo, list):
        return "".join(b.get("text", "") for b in conteudo if isinstance(b, dict))
    return json.dumps(conteudo, ensure_ascii=False)


# Assinatura aceita pelo Gemini para chamadas que ele não gerou (ex.: conversa antiga do Claude).
ASSINATURA_NEUTRA = {"google": {"thought_signature": "skip_thought_signature_validator"}}


def limpar_para_anthropic(mensagens: list[dict]) -> list[dict]:
    """Tira campos do Gemini que a API do Claude não aceita (conversas que trocaram de provedor)."""
    if not any(isinstance(m["content"], list) and any("extra_content" in b for b in m["content"])
               for m in mensagens):
        return mensagens
    limpas = []
    for m in mensagens:
        if isinstance(m["content"], list):
            m = {**m, "content": [{k: v for k, v in b.items() if k != "extra_content"} for b in m["content"]]}
        limpas.append(m)
    return limpas


def converter_mensagens(sistema: str, mensagens: list[dict], provedor: str = "openai") -> list[dict]:
    """Histórico no formato da Anthropic -> mensagens de chat da OpenAI."""
    saida = [{"role": "system", "content": sistema}]
    for msg in mensagens:
        conteudo = msg["content"]
        if msg["role"] == "user":
            if isinstance(conteudo, str):
                saida.append({"role": "user", "content": conteudo})
                continue
            textos = []
            for bloco in conteudo:
                if bloco.get("type") == "tool_result":
                    texto = _texto_resultado(bloco.get("content", ""))
                    if bloco.get("is_error"):
                        texto = f"ERRO: {texto}"
                    saida.append({"role": "tool", "tool_call_id": bloco["tool_use_id"], "content": texto})
                elif bloco.get("type") == "text":
                    textos.append(bloco.get("text", ""))
            if textos:
                saida.append({"role": "user", "content": "\n".join(textos)})
            continue

        # Assistente: só texto e chamadas de ferramenta locais. Raciocínio e pesquisa
        # na web feitos pelo Claude em conversas antigas ficam de fora.
        texto = "".join(b.get("text", "") for b in conteudo if b.get("type") == "text")
        chamadas = []
        for b in conteudo:
            if b.get("type") != "tool_use":
                continue
            chamada = {"id": b["id"], "type": "function",
                       "function": {"name": b["name"],
                                    "arguments": json.dumps(b.get("input") or {}, ensure_ascii=False)}}
            if provedor == "gemini":
                # O Gemini 3 exige a assinatura só na primeira chamada de cada resposta.
                assinatura = b.get("extra_content") or (None if chamadas else ASSINATURA_NEUTRA)
                if assinatura:
                    chamada["extra_content"] = assinatura
            chamadas.append(chamada)
        item = {"role": "assistant", "content": texto or None}
        if chamadas:
            item["tool_calls"] = chamadas
        if texto or chamadas:
            saida.append(item)
    return saida


def converter_ferramentas(definicoes: list[dict], provedor: str) -> list[dict]:
    """Definições de ferramenta da Anthropic -> funções da OpenAI."""
    funcoes = []
    for d in definicoes:
        if "input_schema" not in d:  # ferramentas de servidor do Claude (ex.: web_search)
            continue
        schema = json.loads(json.dumps(d["input_schema"]))
        funcao = {"name": d["name"], "description": d.get("description", "")}
        if provedor == "gemini":
            schema.pop("additionalProperties", None)  # o Gemini rejeita esse campo
            if schema.get("properties"):
                funcao["parameters"] = schema
        else:
            funcao["parameters"] = schema
        funcoes.append({"type": "function", "function": funcao})
    return funcoes


class ClienteCompativel:
    """Chama GPT ou Gemini e devolve uma Resposta no estilo do Claude."""

    def __init__(self, provedor: str, api_key: str, modelo: str):
        self.provedor = provedor
        self.modelo = modelo
        self.cliente = criar_cliente(provedor, api_key)
        self._usar_esforco = True  # desliga sozinho se o modelo não aceitar

    def chamar(self, sistema: str, mensagens: list[dict], ferramentas: list[dict], esforco: str,
               ao_texto: Callable[[str], None] | None = None,
               ao_ferramenta: Callable[[str], None] | None = None,
               ao_primeiro_sinal: Callable[[], None] | None = None,
               cancelar: threading.Event | None = None) -> Resposta | None:
        parametros = dict(
            model=self.modelo,
            messages=converter_mensagens(sistema, mensagens, self.provedor),
            stream=True,
        )
        funcoes = converter_ferramentas(ferramentas, self.provedor)
        if funcoes:
            parametros["tools"] = funcoes
        if self._usar_esforco:
            parametros["reasoning_effort"] = ESFORCO_OPENAI.get(esforco, "medium")

        try:
            stream = self.cliente.chat.completions.create(**parametros)
        except openai.BadRequestError as erro:
            if "reasoning" not in str(erro).lower() or "reasoning_effort" not in parametros:
                raise
            self._usar_esforco = False  # modelo sem raciocínio configurável
            parametros.pop("reasoning_effort")
            stream = self.cliente.chat.completions.create(**parametros)

        texto: list[str] = []
        chamadas: dict[int, dict] = {}
        motivo = "stop"
        primeiro = True
        with stream:
            for pedaco in stream:
                if cancelar is not None and cancelar.is_set():
                    return None
                if primeiro and ao_primeiro_sinal:
                    ao_primeiro_sinal()
                    primeiro = False
                if not pedaco.choices:
                    continue
                escolha = pedaco.choices[0]
                delta = escolha.delta
                if delta and delta.content:
                    texto.append(delta.content)
                    if ao_texto:
                        ao_texto(delta.content)
                for tc in (delta.tool_calls or []) if delta else []:
                    indice = tc.index if tc.index is not None else len(chamadas)
                    atual = chamadas.setdefault(indice, {"id": "", "nome": "", "args": "", "extra": None})
                    if tc.id:
                        atual["id"] = tc.id
                    extra = (tc.model_extra or {}).get("extra_content")
                    if extra:
                        atual["extra"] = extra
                    if tc.function and tc.function.name:
                        if not atual["nome"] and ao_ferramenta:
                            ao_ferramenta(tc.function.name)
                        atual["nome"] += tc.function.name
                    if tc.function and tc.function.arguments:
                        atual["args"] += tc.function.arguments
                if escolha.finish_reason:
                    motivo = escolha.finish_reason

        blocos: list = []
        if texto:
            blocos.append(Bloco(type="text", text="".join(texto)))
        for indice in sorted(chamadas):
            c = chamadas[indice]
            try:
                entrada = json.loads(c["args"]) if c["args"].strip() else {}
            except json.JSONDecodeError as erro:
                if motivo == "length":
                    entrada = {}
                else:
                    raise ValueError("JSON de ferramenta inválido") from erro
            blocos.append(Bloco(type="tool_use", id=c["id"] or f"call_{uuid.uuid4().hex[:24]}",
                                name=c["nome"], input=entrada, extra=c["extra"]))

        if motivo == "content_filter":
            parada = "refusal"
        elif motivo == "length":
            parada = "max_tokens"
        elif any(b.type == "tool_use" for b in blocos):
            parada = "tool_use"
        else:
            parada = "end_turn"
        return Resposta(content=blocos, stop_reason=parada)


def mensagem_erro_openai(erro: Exception, provedor: str) -> str | None:
    """Mensagem amigável para erros da biblioteca da OpenAI (GPT e Gemini)."""
    empresa = NOMES.get(provedor, provedor)
    if isinstance(erro, openai.AuthenticationError):
        return f"Chave da API da {empresa} inválida. Rode 'python configurar.py' para atualizá-la."
    if isinstance(erro, openai.PermissionDeniedError):
        return "Sua chave não tem permissão para este modelo."
    if isinstance(erro, openai.NotFoundError):
        return "Modelo não encontrado. Confira o modelo no .env."
    if isinstance(erro, openai.RateLimitError):
        return "Limite de uso ou de créditos atingido. Aguarde um pouco ou confira seu saldo."
    if isinstance(erro, openai.BadRequestError):
        return f"Requisição recusada pela API: {erro.message}"
    if isinstance(erro, openai.APIStatusError):
        return f"Erro no servidor da {empresa} ({erro.status_code}). Tente novamente."
    if isinstance(erro, openai.APIConnectionError):
        return "Sem conexão com a internet ou com a API."
    return None
