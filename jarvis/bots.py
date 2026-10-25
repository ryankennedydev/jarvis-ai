"""Funções reais dos bots do Work: o que cada agente consegue EXECUTAR, não só escrever.

Cada agente tem grupos de funções ligados no cadastro dele (web, arquivos, cálculo, jarvis).
O laço `rodar_bot` deixa a IA chamar essas funções quantas vezes precisar até entregar.

Segurança:
- Arquivos ficam presos numa pasta própria por projeto/setor (dados/work_arquivos/...).
- Leitura de sites só aceita http(s) públicos: endereços da rede local são bloqueados.
"""

import ast
import html
import ipaddress
import json
import math
import operator
import re
import socket
import threading
import urllib.parse
import urllib.request
from datetime import datetime
from pathlib import Path
from typing import Callable

from .seguranca import proteger_pasta

LIMITE_PAGINA = 12_000       # caracteres de texto devolvidos por página
LIMITE_DOWNLOAD = 2_000_000  # bytes baixados no máximo
LIMITE_ARQUIVO = 200_000     # caracteres por arquivo criado
MAX_PASSOS = 12              # chamadas de função por tarefa
USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64) JarvisBot/1.0"

# --- Catálogo -----------------------------------------------------------------------

GRUPOS = {
    "web": "Pesquisar na internet e ler páginas",
    "arquivos": "Criar, ler e listar arquivos na pasta do projeto",
    "calculo": "Fazer contas exatas e saber data e hora",
    "jarvis": "Guardar memórias e criar tarefas no Jarvis",
}
PADRAO = ["web", "arquivos", "calculo"]


def _funcao(nome, descricao, propriedades=None, obrigatorios=()):
    return {
        "name": nome, "description": descricao,
        "input_schema": {"type": "object", "properties": propriedades or {},
                         "required": list(obrigatorios), "additionalProperties": False},
    }


_TEXTO = {"type": "string"}
DEFINICOES = {
    "web": [
        _funcao("pesquisar_web", "Pesquisa na internet e devolve os principais resultados (título, link e resumo).",
                {"consulta": {**_TEXTO, "description": "O que pesquisar."}}, ["consulta"]),
        _funcao("ler_pagina", "Baixa uma página da internet e devolve o texto dela.",
                {"url": {**_TEXTO, "description": "Endereço completo, com https://"}}, ["url"]),
    ],
    "arquivos": [
        _funcao("criar_arquivo", "Cria ou substitui um arquivo de texto (ex.: relatorio.md, dados.csv) na pasta do projeto.",
                {"nome": {**_TEXTO, "description": "Nome do arquivo, pode ter subpasta: docs/plano.md"},
                 "conteudo": {**_TEXTO, "description": "Conteúdo completo do arquivo."}}, ["nome", "conteudo"]),
        _funcao("ler_arquivo", "Lê um arquivo da pasta do projeto (inclusive os criados por outros bots).",
                {"nome": _TEXTO}, ["nome"]),
        _funcao("listar_arquivos", "Lista os arquivos que existem na pasta do projeto."),
    ],
    "calculo": [
        _funcao("calcular", "Calcula uma expressão matemática com exatidão. Aceita + - * / // % **, parênteses, "
                            "sqrt, log, sin, cos, round, abs, min, max, pi, e.",
                {"expressao": _TEXTO}, ["expressao"]),
        _funcao("data_hora", "Devolve a data, a hora e o dia da semana atuais."),
    ],
    "jarvis": [
        _funcao("lembrar", "Guarda um fato importante na memória de longo prazo do Jarvis.",
                {"conteudo": _TEXTO, "categoria": _TEXTO}, ["conteudo"]),
        _funcao("adicionar_tarefa", "Cria uma tarefa na lista de tarefas do Jarvis (o dono vê na hora).",
                {"texto": _TEXTO, "prazo": _TEXTO}, ["texto"]),
    ],
}


def grupos_do_agente(agente: dict) -> list[str]:
    grupos = agente.get("functions")
    if not isinstance(grupos, list):
        return list(PADRAO)
    return [g for g in grupos if g in GRUPOS]


def ferramentas_para(grupos: list[str]) -> list[dict]:
    return [d for g in grupos for d in DEFINICOES.get(g, [])]


def descrever(grupos: list[str]) -> str:
    return ", ".join(grupos) if grupos else "nenhuma (só texto)"


# --- Execução das funções ------------------------------------------------------------

class ErroBot(Exception):
    pass


def pasta_de(raiz: Path, escopo: str) -> Path:
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,80}", escopo):
        raise ErroBot("Escopo de pasta inválido.")
    pasta = raiz / escopo
    pasta.mkdir(parents=True, exist_ok=True)
    proteger_pasta(raiz)
    proteger_pasta(pasta)
    return pasta


def _caminho_seguro(pasta: Path, nome: str) -> Path:
    nome = str(nome).strip().lstrip("/\\")
    if not nome or len(nome) > 160:
        raise ErroBot("Nome de arquivo inválido.")
    alvo = (pasta / nome).resolve()
    if pasta.resolve() not in alvo.parents:
        raise ErroBot("O arquivo precisa ficar dentro da pasta do projeto.")
    return alvo


def _checar_host(url: str) -> None:
    partes = urllib.parse.urlparse(url)
    if partes.scheme not in ("http", "https") or not partes.hostname:
        raise ErroBot("Só endereços http(s) completos são aceitos.")
    try:
        enderecos = {info[4][0] for info in socket.getaddrinfo(partes.hostname, None)}
    except socket.gaierror:
        raise ErroBot("Não encontrei esse site (endereço inválido ou sem internet).")
    for endereco in enderecos:
        ip = ipaddress.ip_address(endereco.split("%")[0])
        if not ip.is_global:
            raise ErroBot("Endereços da rede local não podem ser acessados pelos bots.")


class _SemRedirecionarLocal(urllib.request.HTTPRedirectHandler):
    """Confere também o destino de cada redirecionamento (evita pular para a rede local)."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        _checar_host(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


_abridor = urllib.request.build_opener(_SemRedirecionarLocal)


def _baixar(url: str, dados: bytes | None = None) -> tuple[str, str]:
    _checar_host(url)
    pedido = urllib.request.Request(url, data=dados, headers={"User-Agent": USER_AGENT, "Accept-Language": "pt-BR,pt;q=0.9"})
    with _abridor.open(pedido, timeout=15) as resposta:
        tipo = resposta.headers.get("Content-Type", "")
        bruto = resposta.read(LIMITE_DOWNLOAD)
        charset = resposta.headers.get_content_charset() or "utf-8"
    return bruto.decode(charset, errors="replace"), tipo


def _html_para_texto(pagina: str) -> str:
    pagina = re.sub(r"(?is)<(script|style|noscript|svg|head)[^>]*>.*?</\1>", " ", pagina)
    pagina = re.sub(r"(?i)<br\s*/?>|</(p|div|li|h[1-6]|tr)>", "\n", pagina)
    texto = html.unescape(re.sub(r"<[^>]+>", " ", pagina))
    texto = re.sub(r"[ \t\r\f\v]+", " ", texto)
    return re.sub(r"\n\s*\n+", "\n\n", texto).strip()


def _link_bing(href: str) -> str:
    """O Bing embrulha os links (bing.com/ck/a?...&u=a1<base64>); devolve o endereço real."""
    import base64

    href = html.unescape(href)
    u = urllib.parse.parse_qs(urllib.parse.urlparse(href).query).get("u", [""])[0]
    if u.startswith("a1"):
        try:
            codigo = u[2:]
            return base64.urlsafe_b64decode(codigo + "=" * (-len(codigo) % 4)).decode("utf-8", "replace")
        except ValueError:
            pass
    return href


def _buscar_bing(consulta: str) -> list[dict]:
    q = urllib.parse.quote(consulta)
    pagina, _ = _baixar(f"https://www.bing.com/search?q={q}&setlang=pt-BR&cc=BR")
    resultados = []
    for bloco in re.split(r'<li class="b_algo"', pagina)[1:9]:
        link = re.search(r'(?is)<h2[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>(.*?)</a>', bloco)
        if not link:
            continue
        resumo = re.search(r'(?is)<p[^>]*>(.*?)</p>', bloco)
        resultados.append({"titulo": _html_para_texto(link.group(2)), "link": _link_bing(link.group(1)),
                           "resumo": _html_para_texto(resumo.group(1))[:400] if resumo else ""})
    return resultados


def _buscar_duckduckgo(consulta: str) -> list[dict]:
    dados = urllib.parse.urlencode({"q": consulta, "kl": "br-pt"}).encode()
    pagina, _ = _baixar("https://html.duckduckgo.com/html/", dados)
    resultados = []
    blocos = re.findall(r'(?is)<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>(.*?)</a>(.*?)(?=<a[^>]+class="result__a"|$)', pagina)
    for href, titulo, resto in blocos[:8]:
        alvo = urllib.parse.parse_qs(urllib.parse.urlparse(html.unescape(href)).query).get("uddg", [html.unescape(href)])[0]
        resumo = re.search(r'(?is)class="result__snippet"[^>]*>(.*?)</a>', resto)
        resultados.append({"titulo": _html_para_texto(titulo), "link": alvo,
                           "resumo": _html_para_texto(resumo.group(1)) if resumo else ""})
    return resultados


def pesquisar_web(consulta: str) -> str:
    """Busca sem chave de API: tenta o Bing e, se falhar, o DuckDuckGo."""
    resultados: list[dict] = []
    for buscador in (_buscar_bing, _buscar_duckduckgo):
        try:
            resultados = buscador(consulta)
        except Exception:  # noqa: BLE001 - tenta o próximo buscador
            resultados = []
        if resultados:
            break
    if not resultados:
        return "Nenhum resultado encontrado (buscadores indisponíveis ou consulta sem resultados). Tente outras palavras."
    return json.dumps(resultados, ensure_ascii=False, indent=1)


def ler_pagina(url: str) -> str:
    conteudo, tipo = _baixar(url)
    texto = _html_para_texto(conteudo) if "html" in tipo or "<html" in conteudo[:500].lower() else conteudo
    if len(texto) > LIMITE_PAGINA:
        texto = texto[:LIMITE_PAGINA] + "\n[... página cortada ...]"
    return texto or "(página sem texto legível)"


_OPERADORES = {
    ast.Add: operator.add, ast.Sub: operator.sub, ast.Mult: operator.mul, ast.Div: operator.truediv,
    ast.FloorDiv: operator.floordiv, ast.Mod: operator.mod, ast.Pow: operator.pow,
    ast.USub: operator.neg, ast.UAdd: operator.pos,
}
_FUNCOES_MAT = {
    "sqrt": math.sqrt, "log": math.log, "log10": math.log10, "exp": math.exp, "sin": math.sin, "cos": math.cos,
    "tan": math.tan, "round": round, "abs": abs, "min": min, "max": max, "floor": math.floor, "ceil": math.ceil,
}
_CONSTANTES = {"pi": math.pi, "e": math.e}


def calcular(expressao: str) -> str:
    def avaliar(no):
        if isinstance(no, ast.Expression):
            return avaliar(no.body)
        if isinstance(no, ast.Constant) and isinstance(no.value, (int, float)) and not isinstance(no.value, bool):
            return no.value
        if isinstance(no, ast.Name) and no.id in _CONSTANTES:
            return _CONSTANTES[no.id]
        if isinstance(no, ast.BinOp) and type(no.op) in _OPERADORES:
            esquerda, direita = avaliar(no.left), avaliar(no.right)
            if isinstance(no.op, ast.Pow) and abs(direita) > 1000:
                raise ErroBot("Expoente grande demais.")
            return _OPERADORES[type(no.op)](esquerda, direita)
        if isinstance(no, ast.UnaryOp) and type(no.op) in _OPERADORES:
            return _OPERADORES[type(no.op)](avaliar(no.operand))
        if isinstance(no, ast.Call) and isinstance(no.func, ast.Name) and no.func.id in _FUNCOES_MAT and not no.keywords:
            return _FUNCOES_MAT[no.func.id](*[avaliar(a) for a in no.args])
        raise ErroBot("Expressão não permitida. Use só números, operadores e funções matemáticas.")

    expressao = str(expressao).replace("^", "**")
    if "(" not in expressao:  # "1.234,56 * 2" sem funções: vírgula é decimal
        expressao = expressao.replace(".", "").replace(",", ".") if re.search(r"\d,\d", expressao) else expressao
    if len(expressao) > 300:
        raise ErroBot("Expressão longa demais.")
    try:
        resultado = avaliar(ast.parse(expressao, mode="eval"))
    except (SyntaxError, ZeroDivisionError, ValueError, OverflowError, TypeError) as erro:
        raise ErroBot(f"Não consegui calcular: {erro}")
    return str(round(resultado, 10) if isinstance(resultado, float) else resultado)


DIAS = ["segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado", "domingo"]


class ExecutorBot:
    """Executa as funções de UM agente, dentro da pasta do projeto/setor dele."""

    def __init__(self, grupos: list[str], pasta: Path, memoria=None):
        self.grupos = grupos
        self.pasta = pasta
        self.memoria = memoria
        self.permitidas = {d["name"] for d in ferramentas_para(grupos)}
        self.arquivos_criados: list[str] = []

    def executar(self, nome: str, entrada: dict) -> str:
        if nome not in self.permitidas:
            raise ErroBot(f"Este bot não tem a função '{nome}'.")
        entrada = entrada if isinstance(entrada, dict) else {}
        texto = lambda campo: str(entrada.get(campo, "")).strip()  # noqa: E731
        if nome == "pesquisar_web":
            return pesquisar_web(texto("consulta")[:300])
        if nome == "ler_pagina":
            return ler_pagina(texto("url"))
        if nome == "calcular":
            return calcular(texto("expressao"))
        if nome == "data_hora":
            agora = datetime.now()
            return f"{DIAS[agora.weekday()]}, {agora.strftime('%d/%m/%Y %H:%M')}"
        if nome == "criar_arquivo":
            alvo = _caminho_seguro(self.pasta, texto("nome"))
            conteudo = str(entrada.get("conteudo", ""))[:LIMITE_ARQUIVO]
            alvo.parent.mkdir(parents=True, exist_ok=True)
            alvo.write_text(conteudo, encoding="utf-8")
            alvo.chmod(0o600)
            relativo = str(alvo.relative_to(self.pasta.resolve()))
            self.arquivos_criados.append(relativo)
            return f"Arquivo salvo: {relativo} ({len(conteudo)} caracteres)."
        if nome == "ler_arquivo":
            alvo = _caminho_seguro(self.pasta, texto("nome"))
            if not alvo.is_file():
                raise ErroBot("Arquivo não encontrado. Use listar_arquivos.")
            return alvo.read_text(encoding="utf-8", errors="replace")[:LIMITE_PAGINA]
        if nome == "listar_arquivos":
            base = self.pasta.resolve()
            itens = [f"{p.relative_to(base)} ({p.stat().st_size} bytes)" for p in sorted(base.rglob("*")) if p.is_file()]
            return "\n".join(itens[:200]) or "(pasta vazia)"
        if nome == "lembrar":
            if self.memoria is None:
                raise ErroBot("Memória do Jarvis indisponível.")
            memoria_id = self.memoria.lembrar(texto("conteudo")[:1000], texto("categoria") or "work")
            return f"Memória salva (id {memoria_id})."
        if nome == "adicionar_tarefa":
            if self.memoria is None:
                raise ErroBot("Tarefas do Jarvis indisponíveis.")
            tarefa_id = self.memoria.adicionar_tarefa(texto("texto")[:500], texto("prazo")[:60])
            return f"Tarefa criada (id {tarefa_id})."
        raise ErroBot(f"Função desconhecida: {nome}")


def resumir_entrada(nome: str, entrada: dict) -> str:
    """Uma linha curta do que o bot está fazendo, para mostrar na tela."""
    entrada = entrada if isinstance(entrada, dict) else {}
    chave = {"pesquisar_web": "consulta", "ler_pagina": "url", "criar_arquivo": "nome", "ler_arquivo": "nome",
             "calcular": "expressao", "lembrar": "conteudo", "adicionar_tarefa": "texto"}.get(nome)
    valor = str(entrada.get(chave, "")) if chave else ""
    return valor[:120]


# --- Laço do bot (IA chama funções até terminar) -----------------------------------------

AoTexto = Callable[[str], None]
AoFuncao = Callable[[str, str, str], None]  # (nome, resumo da entrada, "inicio" | "ok" | "erro")


def rodar_bot(cliente, config, sistema: str, mensagens: list[dict], executor: ExecutorBot, esforco: str,
              ao_texto: AoTexto | None = None, ao_funcao: AoFuncao | None = None,
              cancelar: threading.Event | None = None, ao_pensar: Callable[[], None] | None = None) -> str | None:
    """Roda a IA com as funções do bot. Devolve o texto final (None se cancelado).

    `mensagens` não é alterada: o histórico guardado fica só com pedido e resposta final.
    """
    from .cerebro import _limpar_fallback, _para_dict
    from .provedores import limpar_para_anthropic

    conversa = list(mensagens)
    ferramentas = ferramentas_para(executor.grupos)
    textos: list[str] = []

    for _ in range(MAX_PASSOS + 1):
        if cancelar is not None and cancelar.is_set():
            return None
        if config.provedor != "anthropic":
            resposta = cliente.chamar(sistema, conversa, ferramentas, esforco, ao_texto=ao_texto, cancelar=cancelar)
            if resposta is None:
                return None
            conteudo = resposta.content
        else:
            parametros = dict(
                model=config.modelo, max_tokens=16000, system=sistema,
                messages=limpar_para_anthropic(conversa),
                thinking={"type": "adaptive", "display": "summarized"},
                output_config={"effort": esforco},
                betas=["server-side-fallback-2026-07-01"], fallbacks="default",
            )
            if ferramentas:
                parametros["tools"] = ferramentas
            with cliente.beta.messages.stream(**parametros) as stream:
                for ev in stream:
                    if cancelar is not None and cancelar.is_set():
                        return None
                    if ev.type == "content_block_start" and ev.content_block.type == "thinking" and ao_pensar:
                        ao_pensar()
                    elif ev.type == "text" and ao_texto:
                        ao_texto(ev.text)
                resposta = stream.get_final_message()
            conteudo = _limpar_fallback(resposta.content)

        if resposta.stop_reason == "refusal":
            raise RuntimeError("O bot recusou a tarefa.")
        texto = "".join(getattr(b, "text", "") for b in conteudo if getattr(b, "type", "") == "text")
        if texto.strip():
            textos.append(texto)
        chamadas = [b for b in conteudo if getattr(b, "type", "") == "tool_use"]
        if resposta.stop_reason == "pause_turn":
            conversa.append({"role": "assistant", "content": [_para_dict(b) for b in conteudo]})
            continue
        if not chamadas:
            break
        conversa.append({"role": "assistant", "content": [_para_dict(b) for b in conteudo]})
        resultados = []
        for chamada in chamadas:
            resumo = resumir_entrada(chamada.name, chamada.input)
            if ao_funcao:
                ao_funcao(chamada.name, resumo, "inicio")
            base = {"type": "tool_result", "tool_use_id": chamada.id}
            try:
                saida = executor.executar(chamada.name, chamada.input)
                resultados.append({**base, "content": saida})
                if ao_funcao:
                    ao_funcao(chamada.name, resumo, "ok")
            except Exception as erro:  # noqa: BLE001 - o bot recebe o erro e tenta outro caminho
                resultados.append({**base, "is_error": True, "content": str(erro) or erro.__class__.__name__})
                if ao_funcao:
                    ao_funcao(chamada.name, f"{resumo} · {erro}"[:160], "erro")
        conversa.append({"role": "user", "content": resultados})
    else:
        textos.append("\n\n(Parei: atingi o limite de passos para esta tarefa.)")

    return "\n\n".join(t.strip() for t in textos if t.strip())
