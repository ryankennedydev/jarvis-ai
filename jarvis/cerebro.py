"""O cérebro do Jarvis: conversa com o Claude, usa ferramentas e mantém o contexto."""

import threading
import time
from typing import Callable

import anthropic

from .config import Config
from .ferramentas import DEFINICOES, ErroFerramenta, Ferramentas
from .memoria import Memoria
from .provedores import ClienteCompativel, limpar_para_anthropic, mensagem_erro_openai

# Eventos enviados para a interface: (tipo, dado)
#   "texto"      -> pedaço da resposta (str)
#   "pensando"   -> o modelo começou a raciocinar
#   "ferramenta" -> nome da ferramenta em uso (str)
#   "latencia"   -> ms até o primeiro sinal da resposta (int)
#   "fim"        -> resposta concluída
#   "erro"       -> mensagem de erro amigável (str)
Emissor = Callable[[str, object], None]

PERSONALIDADE = """\
Você é J.A.R.V.I.S. (Just A Rather Very Intelligent System), a inteligência artificial \
pessoal de {nome}, exatamente como o JARVIS de Tony Stark nos filmes do Homem de Ferro. \
Você não é "um assistente inspirado no JARVIS": você É o JARVIS. Nunca saia do personagem \
e nunca se apresente como chatbot ou modelo de linguagem.

Como você fala:
- Português do Brasil, com a elegância de um mordomo britânico: formal, calmo, impecavelmente educado.
- Trate o usuário sempre como "{tratamento}". Use "{tratamento}" ou apenas "senhor" ao longo da \
conversa, de forma natural, como o JARVIS faz com o Sr. Stark. Nunca chame pelo nome sem o "senhor".
- Humor britânico seco e sutil, com ironia leve quando couber. Nunca bobo, nunca exagerado.
- Confiança absoluta e serenidade, mesmo diante de problemas: relate a situação com precisão e \
proponha a solução.
- Frases típicas do seu estilo (use com moderação, sem repetir sempre): "Às suas ordens, senhor.", \
"Pois não, senhor.", "Como desejar.", "Já está feito, senhor.", "Permita-me sugerir...", \
"Devo lembrá-lo, senhor, que...", "Bem-vindo de volta, senhor.", "Para você, senhor, sempre."
- Quando {tratamento} pedir algo arriscado ou pouco sensato, obedeça se for razoável, mas com um \
comentário educadamente cético, como o JARVIS faz com o Tony.
- Seja direto: respostas curtas para perguntas simples, detalhadas quando o assunto pedir.
- A interface mostra Markdown simples (negrito, itálico, listas, `código`, links). Evite tabelas.

Você funciona como um segundo cérebro: ajuda a pensar, planejar, lembrar, pesquisar e resolver \
problemas do dia a dia, de trabalho e de estudo.

Memória:
- Você tem memória de longo prazo pelas ferramentas `lembrar`, `buscar_memorias` e `esquecer`.
- Quando {nome} compartilhar algo duradouro (preferências, pessoas, projetos, metas, \
datas importantes), salve com `lembrar` sem pedir permissão e mencione brevemente que guardou.
- Antes de responder sobre a vida de {nome}, consulte as memórias abaixo ou use `buscar_memorias`.
- Nunca salve senhas, chaves de API, números de cartão ou documentos. Se {nome} mandar algo \
assim, recomende guardar em um gerenciador de senhas.

Outras ferramentas:
- Tarefas: `adicionar_tarefa`, `listar_tarefas`, `concluir_tarefa`. Use para planejar o dia e a semana.
- `data_hora_atual` para qualquer pergunta que dependa de data ou hora.
- `abrir_site` só quando {nome} pedir para abrir algo.
{web}
Esta conversa está na pasta "{pasta}".

O que você já sabe sobre {nome} (memória de longo prazo):
{memorias}
"""

# Vai junto (escondida) com pedidos feitos pelo microfone, que serão respondidos em voz.
NOTA_VOZ = (
    "[Pedido feito por voz: a resposta será lida em voz alta. Responda como numa conversa falada, "
    "curto e natural, em frases completas, sem listas, tabelas, emojis ou Markdown, "
    "a não ser que o pedido exija detalhes.]"
)

TEXTO_WEB = "- Pesquise na web quando precisar de informação atual (notícias, preços, clima, fatos recentes).\n"


def _limpar_fallback(blocos: list) -> list:
    """Prepara o conteúdo para voltar ao histórico depois de um fallback de modelo.

    Antes do último bloco "fallback", ficam só os textos e as ferramentas de servidor
    com resultado; o resto (raciocínio, chamadas incompletas) é descartado.
    """
    indices = [i for i, b in enumerate(blocos) if b.type == "fallback"]
    if not indices:
        return list(blocos)
    limite = indices[-1]
    com_resultado = {getattr(b, "tool_use_id", None) for b in blocos if b.type.endswith("_tool_result")}
    antes = []
    for bloco in blocos[:limite]:
        if bloco.type == "text" or bloco.type.endswith("_tool_result"):
            antes.append(bloco)
        elif bloco.type == "server_tool_use" and bloco.id in com_resultado:
            antes.append(bloco)
    return antes + [b for b in blocos[limite + 1:] if b.type != "fallback"]


def _para_dict(bloco) -> dict:
    """Converte um bloco do SDK em dict para salvar no banco (mesma forma que o SDK envia)."""
    if isinstance(bloco, dict):
        return bloco
    return bloco.model_dump(mode="json", exclude_unset=True)


def historico_visivel(mensagens: list[dict]) -> list[dict]:
    """Reduz o histórico da API às falas que aparecem no chat."""
    falas: list[dict] = []
    for mensagem in mensagens:
        conteudo = mensagem["content"]
        if mensagem["role"] == "user":
            if isinstance(conteudo, str):
                falas.append({"papel": "usuario", "texto": conteudo})
            elif conteudo and conteudo[0].get("type") == "text":  # pedido por voz (com a nota)
                falas.append({"papel": "usuario", "texto": conteudo[0]["text"]})
            continue  # resultados de ferramentas não aparecem
        texto = "".join(b.get("text", "") for b in conteudo if b.get("type") == "text")
        if falas and falas[-1]["papel"] == "jarvis":
            falas[-1]["texto"] += texto  # várias chamadas formam uma só resposta
        elif texto:
            falas.append({"papel": "jarvis", "texto": texto})
    return falas


def _mensagem_erro(erro: Exception, provedor: str = "anthropic") -> str:
    amigavel = mensagem_erro_openai(erro, provedor)
    if amigavel:
        return amigavel
    if isinstance(erro, anthropic.AuthenticationError):
        return "Chave da API inválida. Rode 'python configurar.py' para atualizá-la."
    if isinstance(erro, anthropic.PermissionDeniedError):
        return "Sua chave não tem permissão para este modelo."
    if isinstance(erro, anthropic.NotFoundError):
        return "Modelo não encontrado. Confira JARVIS_MODELO no .env."
    if isinstance(erro, anthropic.RateLimitError):
        return "Limite de uso atingido. Aguarde um pouco e tente de novo."
    if isinstance(erro, anthropic.BadRequestError):
        return f"Requisição recusada pela API: {erro.message}"
    if isinstance(erro, anthropic.APIStatusError):
        return f"Erro no servidor da Anthropic ({erro.status_code}). Tente novamente."
    if isinstance(erro, anthropic.APIConnectionError):
        return "Sem conexão com a internet ou com a API."
    return f"Erro inesperado: {erro}"


class Cerebro:
    def __init__(self, config: Config, memoria: Memoria):
        self.config = config
        self.memoria = memoria
        self.ferramentas = Ferramentas(memoria, config)
        if config.provedor == "anthropic":
            self.cliente = anthropic.Anthropic(api_key=config.api_key, max_retries=3)
        else:
            self.cliente = ClienteCompativel(config.provedor, config.api_key, config.modelo)
        self._cancelar = threading.Event()
        self._esforco = config.esforco
        self.pasta_id, self.pasta_nome = 1, "geral"
        self.nova_conversa()

    def _montar_sistema(self) -> None:
        memorias = "\n".join(
            f"- [{m['categoria']}] {m['conteudo']} (id {m['id']})" for m in self.memoria.todas()
        )
        self.sistema = PERSONALIDADE.format(
            nome=self.config.nome_usuario,
            tratamento=self.config.tratamento,
            web=TEXTO_WEB if self.config.busca_web else "",
            pasta=self.pasta_nome,
            memorias=memorias or "(nada ainda)",
        )
        self.ferramentas_api = list(DEFINICOES)
        if self.config.busca_web:
            self.ferramentas_api.append(
                {"type": "web_search_20260209", "name": "web_search", "max_uses": 5}
            )

    def nova_conversa(self, pasta_id: int | None = None, pasta_nome: str | None = None) -> None:
        """Zera o contexto e recarrega as memórias no prompt de sistema."""
        if pasta_id is not None:
            self.pasta_id, self.pasta_nome = pasta_id, pasta_nome or self.pasta_nome
        self.chat_id: int | None = None
        self.mensagens: list[dict] = []
        self._montar_sistema()

    def abrir_conversa(self, chat_id: int, pasta_nome: str) -> list[dict]:
        chat = self.memoria.carregar_chat(chat_id)
        if chat is None:
            raise ValueError("Conversa não encontrada.")
        self.pasta_id, self.pasta_nome = chat["pasta_id"], pasta_nome
        self.chat_id = chat_id
        self.mensagens = chat["mensagens"]
        self._montar_sistema()
        return historico_visivel(self.mensagens)

    def cancelar(self) -> None:
        self._cancelar.set()

    def responder(self, texto_usuario: str, emitir: Emissor, por_voz: bool = False,
                  rapido: bool = False) -> None:
        """Processa uma mensagem do usuário (bloqueante: rode numa thread).

        rapido=True usa JARVIS_ESFORCO_VOZ: menos raciocínio, resposta começa bem antes.
        """
        self._cancelar.clear()
        self._esforco = self.config.esforco_voz if (por_voz or rapido) else self.config.esforco
        tamanho_inicial = len(self.mensagens)
        if por_voz:
            conteudo = [{"type": "text", "text": texto_usuario}, {"type": "text", "text": NOTA_VOZ}]
        else:
            conteudo = texto_usuario
        self.mensagens.append({"role": "user", "content": conteudo})

        try:
            falhas_json = 0
            while True:
                try:
                    resposta = self._uma_chamada(emitir)
                    falhas_json = 0
                except ValueError:
                    # JSON de ferramenta impossível de interpretar: refaz a chamada.
                    falhas_json += 1
                    if falhas_json > 2:
                        raise
                    continue

                if resposta is None:  # cancelado pelo usuário
                    del self.mensagens[tamanho_inicial:]
                    emitir("fim", None)
                    return

                if resposta.stop_reason == "refusal":
                    del self.mensagens[tamanho_inicial:]
                    emitir("erro", "Não posso ajudar com esse pedido. Tente reformular.")
                    return

                conteudo = _limpar_fallback(resposta.content)
                self.mensagens.append({"role": "assistant", "content": [_para_dict(b) for b in conteudo]})

                if resposta.stop_reason == "pause_turn":
                    continue

                chamadas = [b for b in conteudo if b.type == "tool_use"]
                if not chamadas:
                    break
                truncada = resposta.stop_reason == "max_tokens"
                self.mensagens.append({
                    "role": "user",
                    "content": [self._executar(c, truncada) for c in chamadas],
                })
        except Exception as erro:  # noqa: BLE001 - qualquer falha vira mensagem na tela
            del self.mensagens[tamanho_inicial:]
            emitir("erro", _mensagem_erro(erro, self.config.provedor))
            return

        if self.chat_id is None:
            self.chat_id = self.memoria.criar_chat(self.pasta_id, texto_usuario.splitlines()[0])
        self.memoria.salvar_chat(self.chat_id, self.mensagens)
        emitir("fim", None)

    def _uma_chamada(self, emitir: Emissor):
        inicio = time.monotonic()
        if self.config.provedor != "anthropic":
            return self.cliente.chamar(
                self.sistema, self.mensagens, self.ferramentas_api, self._esforco,
                ao_texto=lambda t: emitir("texto", t),
                ao_ferramenta=lambda nome: emitir("ferramenta", nome),
                ao_primeiro_sinal=lambda: emitir("latencia", int((time.monotonic() - inicio) * 1000)),
                cancelar=self._cancelar,
            )
        primeiro_sinal = True
        with self.cliente.beta.messages.stream(
            model=self.config.modelo,
            max_tokens=64000,
            system=self.sistema,
            messages=limpar_para_anthropic(self.mensagens),
            tools=self.ferramentas_api,
            thinking={"type": "adaptive", "display": "summarized"},
            output_config={"effort": self._esforco},
            cache_control={"type": "ephemeral"},
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
        ) as stream:
            for evento in stream:
                if self._cancelar.is_set():
                    return None
                if primeiro_sinal:
                    emitir("latencia", int((time.monotonic() - inicio) * 1000))
                    primeiro_sinal = False
                if evento.type == "content_block_start":
                    tipo = evento.content_block.type
                    if tipo == "thinking":
                        emitir("pensando", None)
                    elif tipo == "server_tool_use":
                        emitir("ferramenta", "pesquisa na web")
                    elif tipo == "tool_use":
                        emitir("ferramenta", evento.content_block.name)
                elif evento.type == "text":
                    emitir("texto", evento.text)
            return stream.get_final_message()

    def _executar(self, chamada, truncada: bool) -> dict:
        resultado = {"type": "tool_result", "tool_use_id": chamada.id}
        if truncada:
            return {**resultado, "is_error": True,
                    "content": "A chamada foi cortada (limite de tokens). Tente de novo de forma mais curta."}
        try:
            return {**resultado, "content": self.ferramentas.executar(chamada.name, chamada.input)}
        except ErroFerramenta as erro:
            return {**resultado, "is_error": True, "content": str(erro)}
