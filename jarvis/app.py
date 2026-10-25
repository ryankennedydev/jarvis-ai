"""Janela desktop do Jarvis: interface HTML (pasta ui/) servida pelo pywebview."""

import json
import threading
import time
import webbrowser
from pathlib import Path
from urllib.parse import urlparse

import webview

from . import __version__
from .cerebro import Cerebro
from .config import PASTA_DADOS, RAIZ, Config
from .memoria import Memoria
from .seguranca import mascarar, proteger_arquivo, verificar_pin
from .work_agentes import EquipesWork, TerminaisWork

PASTA_UI = Path(__file__).resolve().parent / "ui"
ARQUIVO_PREFERENCIAS = PASTA_DADOS / "preferencias.json"
ARQUIVO_WORK = PASTA_DADOS / "work.json"
LIMITE_WORK = 20 * 1024 * 1024


class Api:
    """Métodos chamados pelo JavaScript (window.pywebview.api.*).

    Atributos com "_" não são expostos à página. Tudo, exceto o desbloqueio,
    exige o PIN já validado aqui no Python.
    """

    def __init__(self, config: Config, memoria: Memoria, cerebro: Cerebro):
        self._config = config
        self._memoria = memoria
        self._cerebro = cerebro
        self._janela = None
        self._liberado = not config.pin_hash
        self._tentativas = 0
        self._ocupado = False
        self._trava_pin = threading.Lock()
        self._ouvinte = None  # criado em iniciar() se JARVIS_VOZ=true
        self._equipes = None  # equipes de IA do Work, criadas em iniciar()
        self._terminais = None  # terminais dos projetos do Work (um por agente)
        self._locutor = None  # voz do Jarvis, criada em iniciar() se JARVIS_FALA=true
        self._ultimo_ditado = ""  # última fala transcrita do microfone
        self._rodada = 0  # conta as mensagens, para saber qual resposta ainda está falando

    def _exigir_liberado(self) -> None:
        if not self._liberado:
            raise PermissionError("Jarvis bloqueado.")

    def _emitir(self, tipo: str, dado: object) -> None:
        if self._janela is not None:
            self._janela.evaluate_js(f"window.jarvis && jarvis.evento({json.dumps(tipo)}, {json.dumps(dado)})")

    # --- Sessão e segurança ---------------------------------------

    def inicial(self) -> dict:
        cfg = self._config
        return {
            "versao": __version__,
            "nome": cfg.nome_usuario,
            "tratamento": cfg.tratamento,
            "modelo": cfg.modelo,
            "provedor": cfg.provedor,
            "esforco": cfg.esforco,
            "chave": mascarar(cfg.api_key),
            "busca_web": cfg.busca_web,
            "tem_pin": bool(cfg.pin_hash),
            "bloqueado": not self._liberado,
            "bloqueio_minutos": cfg.bloqueio_minutos,
            "aviso_permissoes": cfg.aviso_permissoes,
            "zoom": cfg.zoom,
            "zoom_salvo": _ler_preferencias().get("zoom"),
            "voz": self._ouvinte is not None,
            "escuta_continua": bool(self._ouvinte and self._ouvinte.continua),
            "palavra_ativacao": cfg.palavra_ativacao,
            "fala": self._locutor is not None,
        }

    def desbloquear(self, pin: str) -> dict:
        with self._trava_pin:  # uma tentativa por vez
            if verificar_pin(str(pin), self._config.pin_hash):
                self._tentativas = 0
                self._liberado = True
                if self._ouvinte:
                    self._ouvinte.pausar(False)
                return {"ok": True}
            self._tentativas += 1
            time.sleep(min(self._tentativas, 5))  # atraso crescente contra força bruta
            restantes = self._config.pin_tentativas - self._tentativas
            if restantes <= 0:
                threading.Timer(0.3, self._janela.destroy).start()
            return {"ok": False, "restantes": max(restantes, 0)}

    def bloquear(self) -> None:
        if self._config.pin_hash:
            self._liberado = False
            if self._locutor:
                self._locutor.parar()
            if self._ouvinte:
                self._ouvinte.pausar(True)

    def salvar_zoom(self, zoom: float) -> None:
        preferencias = _ler_preferencias()
        if float(zoom) <= 0:  # 0 = voltar ao ajuste automático
            preferencias.pop("zoom", None)
        else:
            preferencias["zoom"] = max(0.5, min(3.0, float(zoom)))
        ARQUIVO_PREFERENCIAS.write_text(json.dumps(preferencias), encoding="utf-8")
        proteger_arquivo(ARQUIVO_PREFERENCIAS)

    def tela_cheia(self) -> None:
        self._janela.toggle_fullscreen()

    # --- Painel, pastas e conversas -------------------------------

    def estado(self) -> dict:
        self._exigir_liberado()
        return {
            "contagens": self._memoria.contagens(),
            "pastas": self._memoria.pastas(),
            "pasta_id": self._cerebro.pasta_id,
            "chat_id": self._cerebro.chat_id,
        }

    def chats(self, pasta_id: int) -> list[dict]:
        self._exigir_liberado()
        return self._memoria.chats(int(pasta_id))

    def criar_pasta(self, nome: str) -> int:
        self._exigir_liberado()
        return self._memoria.criar_pasta(str(nome))

    def nova_conversa(self, pasta_id: int, pasta_nome: str) -> None:
        self._exigir_liberado()
        if not self._ocupado:
            self._cerebro.nova_conversa(int(pasta_id), str(pasta_nome))

    def abrir_conversa(self, chat_id: int, pasta_nome: str) -> list[dict]:
        self._exigir_liberado()
        if self._ocupado:
            raise RuntimeError("Aguarde a resposta terminar.")
        return self._cerebro.abrir_conversa(int(chat_id), str(pasta_nome))

    def apagar_conversa(self, chat_id: int) -> None:
        self._exigir_liberado()
        self._memoria.apagar_chat(int(chat_id))
        if self._cerebro.chat_id == int(chat_id):
            self._cerebro.nova_conversa()

    # --- Conversa -------------------------------------------------

    def enviar(self, texto: str) -> bool:
        self._exigir_liberado()
        texto = str(texto).strip()
        if self._ocupado or not texto:
            return False
        self._ocupado = True
        self._rodada += 1
        rodada = self._rodada
        if self._ouvinte:
            self._ouvinte.pausar(True)

        # Responde em voz quando o pedido veio do microfone (ou sempre, se configurado).
        por_voz = bool(self._ultimo_ditado) and texto == self._ultimo_ditado
        self._ultimo_ditado = ""
        locutor = self._locutor if self._locutor and (por_voz or self._config.fala_sempre) else None
        emitir = self._emitir
        if locutor:
            locutor.parar()
            locutor.comecar()

            def emitir(tipo: str, dado: object) -> None:
                if tipo == "texto":
                    locutor.adicionar(dado)
                elif tipo == "fim":
                    locutor.finalizar()
                elif tipo == "erro":
                    locutor.falar(str(dado))
                self._emitir(tipo, dado)

        def trabalhar():
            try:
                self._cerebro.responder(texto, emitir, por_voz=locutor is not None and por_voz,
                                        rapido=por_voz)
            finally:
                self._ocupado = False
                self._emitir("estado", self.estado() if self._liberado else None)
                if locutor:
                    locutor.esperar()  # o microfone só volta depois que ele terminar de falar
                if self._ouvinte and self._liberado and rodada == self._rodada:
                    self._ouvinte.pausar(False)

        threading.Thread(target=trabalhar, daemon=True).start()
        return True

    def parar(self) -> None:
        self._cerebro.cancelar()
        if self._locutor:
            self._locutor.parar()

    def fala_parar(self) -> None:
        """Interrompe a voz do Jarvis (botão do microfone ou de parar)."""
        if self._locutor:
            self._locutor.parar()

    # --- Módulo Work (painel da empresa) ---------------------------

    def work_carregar(self) -> str | None:
        self._exigir_liberado()
        try:
            return ARQUIVO_WORK.read_text(encoding="utf-8")
        except FileNotFoundError:
            return None

    def work_salvar(self, dados: str) -> None:
        self._exigir_liberado()
        dados = str(dados)
        if len(dados) > LIMITE_WORK:
            raise ValueError("Dados do Work grandes demais (fotos muito pesadas?).")
        conteudo = json.loads(dados)  # só aceita JSON válido
        if not isinstance(conteudo, dict) or conteudo.get("version") not in (1, 2):
            raise ValueError("Formato de dados do Work inválido.")
        temporario = ARQUIVO_WORK.with_suffix(".tmp")
        temporario.write_text(dados, encoding="utf-8")
        proteger_arquivo(temporario)
        temporario.replace(ARQUIVO_WORK)  # troca atômica: nunca fica um arquivo pela metade

    def _emitir_work(self, tipo: str, dado: object) -> None:
        """Eventos do chat dos gerentes vão para dentro do iframe do Work."""
        if self._janela is not None:
            self._janela.evaluate_js(
                "(() => { const f = document.getElementById('work-frame');"
                f" f && f.contentWindow && f.contentWindow.workEvento && f.contentWindow.workEvento({json.dumps(tipo)}, {json.dumps(dado)}); }})()"
            )

    def work_chat_enviar(self, contexto_json: str, texto: str) -> bool:
        self._exigir_liberado()
        contexto = json.loads(str(contexto_json))
        setor_id = contexto["setor"]["id"]
        if self._equipes.ocupado(setor_id) or not str(texto).strip():
            return False
        threading.Thread(
            target=self._equipes.conversar, args=(contexto, str(texto), self._emitir_work), daemon=True
        ).start()
        return True

    def work_chat_historico(self, setor_id: str) -> dict:
        self._exigir_liberado()
        return {"falas": self._equipes.historico(str(setor_id)), "ocupado": self._equipes.ocupado(str(setor_id))}

    def work_chat_limpar(self, setor_id: str) -> None:
        self._exigir_liberado()
        self._equipes.limpar(str(setor_id))

    def work_chat_parar(self, setor_id: str) -> None:
        self._equipes.parar(str(setor_id))

    # --- Projetos do Work (terminais em paralelo, estilo Maestri) ----

    def work_terminal_enviar(self, contexto_json: str, texto: str) -> bool:
        """Manda um pedido para o terminal de um agente. Vários terminais rodam juntos."""
        self._exigir_liberado()
        contexto = json.loads(str(contexto_json))
        projeto_id, agente_id = str(contexto["projeto"]["id"]), str(contexto["agente"]["id"])
        if not str(texto).strip() or not self._terminais.reservar(projeto_id, agente_id):
            return False
        threading.Thread(
            target=self._terminais.enviar, args=(contexto, str(texto), self._emitir_work), daemon=True
        ).start()
        return True

    def work_terminal_historico(self, projeto_id: str) -> dict:
        self._exigir_liberado()
        return {"terminais": self._terminais.historico(str(projeto_id)),
                "ocupados": self._terminais.ocupados(str(projeto_id))}

    def work_terminal_limpar(self, projeto_id: str, agente_id: str = "") -> None:
        self._exigir_liberado()
        if agente_id:
            self._terminais.limpar(str(projeto_id), str(agente_id))
        else:
            self._terminais.limpar_projeto(str(projeto_id))

    def work_terminal_parar(self, projeto_id: str, agente_id: str = "") -> None:
        self._terminais.parar(str(projeto_id), str(agente_id) or None)

    def work_projeto_planejar(self, contexto_json: str) -> dict:
        """O gerente divide o objetivo em tarefas. Devolve {tarefas} ou {erro}."""
        self._exigir_liberado()
        try:
            return {"tarefas": self._terminais.planejar(json.loads(str(contexto_json)))}
        except Exception as erro:  # noqa: BLE001 - vira aviso na tela
            from .cerebro import _mensagem_erro

            texto = str(erro) if isinstance(erro, RuntimeError) else _mensagem_erro(erro, self._config.provedor)
            return {"erro": texto}

    def work_abrir_pasta(self, escopo: str) -> None:
        """Abre no gerenciador de arquivos a pasta onde os bots salvam o trabalho."""
        self._exigir_liberado()
        import subprocess

        from .bots import pasta_de

        pasta = pasta_de(self._equipes.pasta_arquivos, str(escopo))
        subprocess.Popen(["xdg-open", str(pasta)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    def work_listar_arquivos(self, escopo: str) -> list[str]:
        self._exigir_liberado()
        from .bots import pasta_de

        base = pasta_de(self._equipes.pasta_arquivos, str(escopo)).resolve()
        return [str(p.relative_to(base)) for p in sorted(base.rglob("*")) if p.is_file()][:200]

    # --- Módulo Brain (mapa do cérebro do Jarvis) -----------------------

    def brain_dados(self) -> dict:
        """Tudo o que o Jarvis sabe, para desenhar os neurônios do Brain."""
        self._exigir_liberado()
        pastas = self._memoria.pastas()
        conversas = []
        for pasta in pastas:
            for chat in self._memoria.chats(pasta["id"])[:60]:
                conversas.append({"id": chat["id"], "titulo": chat["titulo"], "pasta": pasta["nome"],
                                  "quando": chat["atualizado_em"]})
        try:
            work = json.loads(ARQUIVO_WORK.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            work = {}
        setores = {s.get("id"): s.get("name", "") for s in work.get("sectors", []) if isinstance(s, dict)}
        agentes = [{"id": a.get("id"), "nome": a.get("name", ""), "funcao": a.get("role", ""),
                    "setor": setores.get(a.get("sectorId"), "")}
                   for a in work.get("agents", []) if isinstance(a, dict)]
        return {
            "nome": self._config.tratamento,
            "memorias": [{"id": m["id"], "texto": m["conteudo"], "categoria": m["categoria"],
                          "quando": m["criada_em"]} for m in self._memoria.todas()],
            "tarefas": [{"id": t["id"], "texto": t["texto"], "prazo": t["prazo"], "feita": bool(t["feita"])}
                        for t in self._memoria.tarefas(incluir_feitas=True)],
            "conversas": conversas,
            "agentes": agentes,
        }

    def brain_conta(self) -> dict:
        """A conta de IA conectada: provedor, modelo, se a chave responde e as habilidades.

        A checagem lista os modelos da conta, o que não gasta cota de geração.
        """
        self._exigir_liberado()
        from .ferramentas import DEFINICOES
        from .provedores import NOMES, criar_cliente

        cfg = self._config
        conta = {
            "provedor": cfg.provedor, "empresa": NOMES.get(cfg.provedor, cfg.provedor),
            "modelo": cfg.modelo, "chave": mascarar(cfg.api_key),
            "esforco": cfg.esforco, "esforco_voz": cfg.esforco_voz, "esforco_agentes": cfg.esforco_agentes,
            "status": "ok", "detalhe": "", "modelos": [],
        }
        habilidades = [{"nome": d["name"], "descricao": d.get("description", ""), "tipo": "ferramenta"}
                       for d in DEFINICOES]
        if cfg.busca_web:
            habilidades.append({"nome": "pesquisa_web", "tipo": "ferramenta",
                                "descricao": "Pesquisa na internet notícias, preços, clima e fatos recentes."})
        if cfg.voz:
            habilidades.append({"nome": "ouvir", "tipo": "sentido",
                                "descricao": f"Entende sua voz localmente (Whisper {cfg.modelo_voz})."})
        if cfg.fala:
            habilidades.append({"nome": "falar", "tipo": "sentido",
                                "descricao": f"Responde em voz alta localmente (Piper {cfg.voz_fala})."})
        habilidades.append({"nome": "equipes_work", "tipo": "sentido",
                            "descricao": "Coordena gerentes e agentes de IA do módulo Work, em paralelo."})
        try:
            if cfg.provedor == "anthropic":
                import anthropic

                cliente = anthropic.Anthropic(api_key=cfg.api_key, max_retries=0, timeout=10)
                conta["modelos"] = [m.id for m in cliente.models.list(limit=50)]
                try:  # Skills da conta Anthropic (se a conta tiver alguma)
                    for skill in cliente.beta.skills.list(betas=["skills-2025-10-02"]):
                        habilidades.append({"nome": getattr(skill, "display_title", None) or skill.id,
                                            "descricao": "Skill da sua conta Anthropic.", "tipo": "skill"})
                except Exception:  # noqa: BLE001 - recurso opcional
                    pass
            else:
                cliente = criar_cliente(cfg.provedor, cfg.api_key).with_options(max_retries=0, timeout=10)
                conta["modelos"] = sorted(m.id.removeprefix("models/") for m in cliente.models.list())
            if conta["modelos"] and cfg.modelo not in conta["modelos"]:
                conta["status"], conta["detalhe"] = "aviso", "O modelo configurado não aparece na lista da conta."
        except Exception as erro:  # noqa: BLE001 - sem internet, chave inválida etc.
            from .cerebro import _mensagem_erro

            conta["status"], conta["detalhe"] = "erro", _mensagem_erro(erro, cfg.provedor)
        conta["modelos"] = conta["modelos"][:60]
        return {"conta": conta, "habilidades": habilidades}

    def brain_esquecer(self, memoria_id: int) -> bool:
        self._exigir_liberado()
        return self._memoria.esquecer(int(memoria_id))

    # --- Voz -------------------------------------------------------

    def voz_continua(self, ligada: bool) -> None:
        self._exigir_liberado()
        if self._ouvinte:
            self._ouvinte.definir_continua(bool(ligada))

    def voz_ouvir(self) -> None:
        self._exigir_liberado()
        if self._ouvinte and not self._ocupado:
            self._ouvinte.ouvir_agora()

    def voz_cancelar(self) -> None:
        if self._ouvinte:
            self._ouvinte.cancelar()

    def _ao_transcrever(self, texto: str) -> None:
        if self._liberado and not self._ocupado:
            self._ultimo_ditado = texto.strip()
            self._emitir("voz_texto", texto)

    # --- Memórias e tarefas ---------------------------------------

    def memorias(self) -> list[dict]:
        self._exigir_liberado()
        return self._memoria.todas()

    def esquecer(self, memoria_id: int) -> None:
        self._exigir_liberado()
        self._memoria.esquecer(int(memoria_id))

    def tarefas(self) -> list[dict]:
        self._exigir_liberado()
        return self._memoria.tarefas(incluir_feitas=True)

    def adicionar_tarefa(self, texto: str) -> None:
        self._exigir_liberado()
        if str(texto).strip():
            self._memoria.adicionar_tarefa(str(texto)[:500])

    def marcar_tarefa(self, tarefa_id: int, feita: bool) -> None:
        self._exigir_liberado()
        self._memoria.concluir_tarefa(int(tarefa_id), bool(feita))

    def apagar_tarefa(self, tarefa_id: int) -> None:
        self._exigir_liberado()
        self._memoria.apagar_tarefa(int(tarefa_id))

    def abrir_link(self, url: str) -> None:
        """Links das respostas abrem no navegador do sistema, nunca dentro do Jarvis."""
        self._exigir_liberado()
        if urlparse(str(url)).scheme == "https":
            webbrowser.open(str(url), new=2)


def _ler_preferencias() -> dict:
    try:
        return json.loads(ARQUIVO_PREFERENCIAS.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def iniciar(config: Config, memoria: Memoria, cerebro: Cerebro) -> None:
    api = Api(config, memoria, cerebro)
    api._equipes = EquipesWork(config, PASTA_DADOS / "work_chats.json", PASTA_DADOS / "work_arquivos", memoria)
    api._terminais = TerminaisWork(api._equipes, PASTA_DADOS / "work_terminais.json")
    if config.fala:
        from .fala import Locutor

        api._locutor = Locutor(api._emitir, config.voz_fala, config.fala_velocidade, PASTA_DADOS / "modelos")
        api._locutor.preparar()
    if config.voz:
        from .voz import Ouvinte

        api._ouvinte = Ouvinte(
            api._emitir, api._ao_transcrever, config.modelo_voz,
            config.palavra_ativacao, PASTA_DADOS / "modelos",
        )
        api._ouvinte.pausar(not api._liberado)
        api._ouvinte.definir_continua(config.escuta_continua)
    janela = webview.create_window(
        "J.A.R.V.I.S.",
        url=str(PASTA_UI / "index.html"),
        js_api=api,
        width=1280,
        height=820,
        min_size=(420, 560),
        maximized=True,
        background_color="#04070d",
        text_select=True,
    )
    api._janela = janela
    janela.events.closed += cerebro.cancelar
    if api._ouvinte:
        janela.events.closed += api._ouvinte.encerrar
    webview.start(icon=str(RAIZ / "assets" / "jarvis.svg"))
    memoria.fechar()
