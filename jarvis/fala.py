"""Boca do Jarvis: transforma as respostas em voz, localmente (Piper).

O texto não sai do computador. A resposta é falada frase por frase enquanto ainda
está chegando, então ele começa a falar antes de terminar de escrever.
Na primeira vez, a voz (~60 MB) é baixada para dados/modelos/piper.
"""

import queue
import re
import threading
import urllib.request
from pathlib import Path
from typing import Callable

import numpy as np

URL_VOZES = "https://huggingface.co/rhasspy/piper-voices/resolve/main"
BLOCO_SAIDA = 1024  # amostras por escrita no alto-falante (~46 ms): permite parar rápido

Emissor = Callable[[str, object], None]

_FIM_FRASE = re.compile(r"(?<=[.!?…:;])\s+|\n+")
_SUBSTITUICOES = [
    (re.compile(r"`([^`]*)`"), r"\1"),                     # `código` -> código
    (re.compile(r"!?\[([^\]]*)\]\([^)]*\)"), r"\1"),        # [texto](link) -> texto
    (re.compile(r"https?://\S+"), "o link na tela"),
    (re.compile(r"^\s{0,3}(#{1,6}|>|[-*+]|\d+[.)])\s+", re.M), ""),  # títulos, citações, listas
    (re.compile(r"(\*\*|__|\*|_|~~)(?=\S)(.+?)(?<=\S)\1"), r"\2"),    # negrito, itálico
    (re.compile(r"[*#|>~]"), " "),
    (re.compile(r"\s+"), " "),
]


def limpar_para_fala(texto: str) -> str:
    for padrao, troca in _SUBSTITUICOES:
        texto = padrao.sub(troca, texto)
    return texto.strip()


def caminho_voz(pasta: Path, voz: str) -> Path:
    """Baixa a voz do Piper na primeira vez (ex.: pt_BR-faber-medium)."""
    arquivo = pasta / f"{voz}.onnx"
    if arquivo.exists() and arquivo.with_suffix(".onnx.json").exists():
        return arquivo
    partes = voz.split("-")  # idioma_PAÍS-nome-qualidade
    if len(partes) != 3 or "_" not in partes[0]:
        raise ValueError(f"Nome de voz inválido: {voz} (ex.: pt_BR-faber-medium)")
    idioma, nome, qualidade = partes
    base = f"{URL_VOZES}/{idioma.split('_')[0]}/{idioma}/{nome}/{qualidade}/{voz}"
    pasta.mkdir(parents=True, exist_ok=True)
    for sufixo in (".onnx.json", ".onnx"):
        temporario = pasta / f"{voz}{sufixo}.baixando"
        urllib.request.urlretrieve(base + sufixo, temporario)
        temporario.replace(pasta / f"{voz}{sufixo}")
    return arquivo


class Locutor:
    def __init__(self, emitir: Emissor, voz: str, velocidade: float, pasta_modelos: Path):
        self._emitir = emitir
        self._voz_nome = voz
        self._velocidade = max(0.5, min(2.0, velocidade))
        self._pasta = pasta_modelos / "piper"
        self._voz = None
        self._trava_voz = threading.Lock()
        self._frases: queue.Queue = queue.Queue()
        self._audios: queue.Queue = queue.Queue(maxsize=3)
        self._geracao = 0          # muda a cada parar(): descarta o que estava na fila
        self._buffer = ""
        self._em_codigo = False
        self._avisou_codigo = False
        self._primeira = True
        self._pendentes = 0        # frases ainda não terminadas de tocar
        self._ocioso = threading.Condition()
        threading.Thread(target=self._sintetizar, daemon=True, name="fala-sintese").start()
        threading.Thread(target=self._tocar, daemon=True, name="fala-saida").start()

    # --- Entrada de texto (chamado durante a resposta) ---------------

    def comecar(self) -> None:
        """Nova resposta: zera o buffer de texto."""
        self._buffer, self._em_codigo, self._avisou_codigo = "", False, False
        self._primeira = True

    def adicionar(self, pedaco: str) -> None:
        self._buffer += pedaco
        *completas, self._buffer = _FIM_FRASE.split(self._buffer)
        if completas:
            self._primeira = False
        elif self._primeira and len(self._buffer) > 50 and "```" not in self._buffer:
            # Primeira frase longa: fala até a vírgula para a voz começar mais cedo.
            corte = self._buffer.rfind(", ")
            if corte > 15:
                completas, self._buffer = [self._buffer[:corte + 1]], self._buffer[corte + 2:]
                self._primeira = False
        for frase in completas:
            self._enfileirar(frase)

    def finalizar(self) -> None:
        if self._buffer.strip():
            self._enfileirar(self._buffer)
        self._buffer = ""

    def falar(self, texto: str) -> None:
        """Fala um texto pronto (ex.: mensagem de erro)."""
        self.comecar()
        self.adicionar(texto)
        self.finalizar()

    def _enfileirar(self, frase: str) -> None:
        # Blocos de código não são lidos em voz alta.
        partes = frase.split("```")
        legivel = []
        for i, parte in enumerate(partes):
            if i > 0:
                self._em_codigo = not self._em_codigo
            if not self._em_codigo:
                legivel.append(parte)
            elif not self._avisou_codigo:
                legivel.append(" O código está na tela. ")
                self._avisou_codigo = True
        texto = limpar_para_fala(" ".join(legivel))
        if not re.search(r"\w", texto):
            return
        with self._ocioso:
            self._pendentes += 1
        self._frases.put((self._geracao, texto))

    # --- Controle ----------------------------------------------------

    @property
    def falando(self) -> bool:
        return self._pendentes > 0

    def parar(self) -> None:
        """Interrompe a fala na hora e descarta o que faltava."""
        self._geracao += 1
        self._buffer = ""
        for fila in (self._frases, self._audios):
            while True:
                try:
                    fila.get_nowait()
                except queue.Empty:
                    break
        with self._ocioso:
            self._pendentes = 0
            self._ocioso.notify_all()
        self._emitir("fala_estado", "fim")

    def esperar(self, limite: float = 600) -> None:
        """Bloqueia até terminar de falar tudo (ou até parar())."""
        with self._ocioso:
            self._ocioso.wait_for(lambda: self._pendentes == 0, timeout=limite)

    def preparar(self) -> None:
        """Carrega a voz em segundo plano para a primeira fala não demorar."""
        threading.Thread(target=self._carregar, daemon=True).start()

    # --- Trabalho em segundo plano ----------------------------------------

    def _carregar(self):
        with self._trava_voz:
            if self._voz is None:
                from piper import PiperVoice

                self._voz = PiperVoice.load(str(caminho_voz(self._pasta, self._voz_nome)))
        return self._voz

    def _concluir_uma(self) -> None:
        with self._ocioso:
            self._pendentes = max(0, self._pendentes - 1)
            if self._pendentes == 0:
                self._ocioso.notify_all()
                self._emitir("fala_estado", "fim")

    def _sintetizar(self) -> None:
        from piper import SynthesisConfig

        while True:
            geracao, texto = self._frases.get()
            if geracao != self._geracao:
                continue
            try:
                voz = self._carregar()
                ajuste = SynthesisConfig(length_scale=1.0 / self._velocidade)
                audio = np.concatenate([c.audio_float_array for c in voz.synthesize(texto, syn_config=ajuste)])
                self._audios.put((geracao, audio, voz.config.sample_rate))
            except Exception as erro:  # noqa: BLE001 - sem internet na 1ª vez, voz inválida etc.
                self._emitir("fala_estado", f"erro:{erro}")
                self._concluir_uma()

    def _tocar(self) -> None:
        import sounddevice as sd

        while True:
            geracao, audio, taxa = self._audios.get()
            if geracao != self._geracao:
                continue
            self._emitir("fala_estado", "inicio")
            try:
                with sd.OutputStream(samplerate=taxa, channels=1, dtype="float32") as saida:
                    for inicio in range(0, len(audio), BLOCO_SAIDA):
                        if geracao != self._geracao:
                            break
                        bloco = audio[inicio:inicio + BLOCO_SAIDA]
                        saida.write(bloco.reshape(-1, 1))
                        nivel = float(np.sqrt(np.mean(bloco ** 2)))
                        self._emitir("fala_nivel", round(min(1.0, nivel * 6), 3))
            except Exception as erro:  # noqa: BLE001 - sem alto-falante etc.
                self._emitir("fala_estado", f"erro:{erro}")
            if geracao == self._geracao:
                self._concluir_uma()
