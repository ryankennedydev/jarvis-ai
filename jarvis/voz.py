"""Ouvido do Jarvis: capta o microfone, detecta a fala e transcreve localmente (Whisper).

Nada de áudio é salvo nem enviado para a internet: só o texto transcrito vai para o chat.
Na primeira vez, o modelo Whisper é baixado (~460 MB para o "small") para dados/modelos.
"""

import collections
import os
import queue
import re
import threading
import time
from pathlib import Path
from typing import Callable

import numpy as np

TAXA = 16_000          # Whisper trabalha em 16 kHz mono
BLOCO = 480            # 30 ms por bloco
SILENCIO_FIM = 0.6     # segundos de silêncio que encerram uma fala
FALA_MINIMA = 0.35     # falas mais curtas são ignoradas (estalos, tosse)
FALA_MAXIMA = 30.0
ESPERA_COMANDO = 8.0   # depois de "Jarvis?" ou do botão, quanto tempo espera a fala

# Variações comuns de como o Whisper escreve "Jarvis" em português.
ATIVACAO = re.compile(
    r"^\W*(?:(?:ok|ei|hey|oi|olá|ô)\W+)?(?:jarvis|jarvi|jarbas|jarves|djarvis|járvis|jarvas|jarvys)\b\W*(.*)$",
    re.IGNORECASE | re.DOTALL,
)
# Frases que o Whisper "inventa" quando ouve só ruído.
ALUCINACOES = {
    "obrigado.", "obrigada.", "obrigado", "tchau.", "legendas pela comunidade amara.org",
    "e aí", "...", "♪", "obrigado por assistir.", "inscreva-se no canal",
}

Emissor = Callable[[str, object], None]


class Ouvinte:
    def __init__(self, emitir: Emissor, ao_transcrever: Callable[[str], None],
                 modelo: str, palavra_ativacao: bool, pasta_modelos: Path):
        self._emitir = emitir
        self._ao_transcrever = ao_transcrever
        self._nome_modelo = modelo
        self._exigir_ativacao = palavra_ativacao
        self._pasta_modelos = pasta_modelos
        self._whisper = None
        self._blocos: queue.Queue = queue.Queue()
        self._ativo = True
        self.continua = False
        self._comando_ate = 0.0   # momento até quando aceita fala sem "Jarvis"
        self._pausado = False
        self._estado = ""
        self._trava_modelo = threading.Lock()
        threading.Thread(target=self._laco, daemon=True, name="ouvinte").start()
        # Carrega o Whisper já na abertura, para o primeiro pedido não esperar ~5 s.
        threading.Thread(target=self._carregar_modelo, daemon=True, name="ouvinte-modelo").start()

    # --- Controle (chamado pela interface) ------------------------

    def definir_continua(self, ligada: bool) -> None:
        self.continua = ligada
        if not ligada and not self._esperando_comando():
            self._mudar_estado("parado")

    def ouvir_agora(self) -> None:
        """Botão do microfone: a próxima fala vai direto, sem precisar dizer "Jarvis"."""
        self._comando_ate = time.monotonic() + ESPERA_COMANDO

    def cancelar(self) -> None:
        self._comando_ate = 0.0

    def pausar(self, pausado: bool) -> None:
        """Enquanto o Jarvis responde ou está bloqueado, nada é gravado."""
        self._pausado = pausado

    def encerrar(self) -> None:
        self._ativo = False

    # --- Laço principal -------------------------------------------

    def _esperando_comando(self) -> bool:
        return time.monotonic() < self._comando_ate

    def _mudar_estado(self, estado: str) -> None:
        if estado != self._estado:
            self._estado = estado
            self._emitir("voz_estado", estado)

    def _laco(self) -> None:
        import sounddevice as sd

        fluxo = None
        try:
            while self._ativo:
                quer_ouvir = (self.continua or self._esperando_comando()) and not self._pausado
                if not quer_ouvir:
                    if fluxo is not None:
                        fluxo.close()
                        fluxo = None
                    if self._comando_ate and not self._esperando_comando():
                        self._comando_ate = 0.0
                        if not self.continua:
                            self._mudar_estado("parado")
                    time.sleep(0.1)
                    continue

                if self._whisper is None:
                    self._carregar_modelo()
                if fluxo is None:
                    fluxo = sd.InputStream(
                        samplerate=TAXA, channels=1, dtype="float32", blocksize=BLOCO,
                        callback=lambda dados, *_: self._blocos.put(dados[:, 0].copy()),
                    )
                    fluxo.start()
                audio = self._captar_fala()
                if audio is not None:
                    self._processar(audio)
        except Exception as erro:  # noqa: BLE001 - microfone ausente, modelo falhou etc.
            self._emitir("voz_estado", f"erro:{erro}")
        finally:
            if fluxo is not None:
                fluxo.close()

    def _carregar_modelo(self) -> None:
        with self._trava_modelo:
            if self._whisper is None:
                self._criar_modelo()

    def _criar_modelo(self) -> None:
        from faster_whisper import WhisperModel

        self._mudar_estado("carregando")
        self._pasta_modelos.mkdir(parents=True, exist_ok=True)
        # Metade dos núcleos lógicos = núcleos físicos: é o que o Whisper aproveita melhor.
        self._whisper = WhisperModel(
            self._nome_modelo, device="cpu", compute_type="int8",
            cpu_threads=max(1, (os.cpu_count() or 2) // 2),
            download_root=str(self._pasta_modelos),
        )

    def _captar_fala(self) -> np.ndarray | None:
        """Espera alguém falar e devolve o áudio daquela fala (ou None)."""
        while not self._blocos.empty():  # descarta o que ficou acumulado
            self._blocos.get_nowait()
        antes = collections.deque(maxlen=10)  # 300 ms antes da fala, para não cortar o início
        ruido = 0.004
        falando, fala, silencio, ultimo_nivel = False, [], 0.0, 0.0
        self._mudar_estado("aguardando" if self._esperando_comando() else "ouvindo")

        while self._ativo and not self._pausado:
            if not falando and not (self.continua or self._esperando_comando()):
                return None
            try:
                bloco = self._blocos.get(timeout=0.2)
            except queue.Empty:
                continue
            nivel = float(np.sqrt(np.mean(bloco ** 2)))
            limiar = max(0.012, ruido * 3)

            agora = time.monotonic()
            if agora - ultimo_nivel > 0.06:
                self._emitir("voz_nivel", round(min(1.0, nivel * 14), 3))
                ultimo_nivel = agora

            if not falando:
                ruido = 0.97 * ruido + 0.03 * nivel
                antes.append(bloco)
                if nivel > limiar:
                    falando, fala, silencio = True, list(antes), 0.0
                    self._mudar_estado("falando")
                continue

            fala.append(bloco)
            silencio = silencio + BLOCO / TAXA if nivel < limiar else 0.0
            duracao = len(fala) * BLOCO / TAXA
            if silencio >= SILENCIO_FIM or duracao >= FALA_MAXIMA:
                if duracao - silencio >= FALA_MINIMA:
                    return np.concatenate(fala)
                falando = False
                self._mudar_estado("aguardando" if self._esperando_comando() else "ouvindo")
        return None

    def _processar(self, audio: np.ndarray) -> None:
        self._mudar_estado("transcrevendo")
        segmentos, _ = self._whisper.transcribe(
            # Busca gulosa e sem VAD (o áudio já vem recortado): mesmo texto, menos tempo.
            audio, language="pt", beam_size=1, vad_filter=False, without_timestamps=True,
            initial_prompt="Conversa em português com o assistente Jarvis.",
            condition_on_previous_text=False,
        )
        texto = " ".join(s.text.strip() for s in segmentos).strip()
        if not texto or texto.lower() in ALUCINACOES:
            return

        ativacao = ATIVACAO.match(texto)
        if self._esperando_comando() or not self._exigir_ativacao:
            self._comando_ate = 0.0
            pedido = ativacao.group(1).strip() if ativacao else texto
        elif ativacao:
            pedido = ativacao.group(1).strip()
            if not pedido:  # só disse "Jarvis": espera o pedido na próxima fala
                self.ouvir_agora()
                self._emitir("voz_estado", "chamado")
                return
        else:
            return  # conversa ao redor, sem "Jarvis": ignora

        if len(pedido) > 1:
            self._ao_transcrever(pedido)
