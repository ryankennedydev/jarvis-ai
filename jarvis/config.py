"""Carrega e valida a configuração do arquivo .env."""

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

from .seguranca import proteger_arquivo

RAIZ = Path(__file__).resolve().parent.parent
ARQUIVO_ENV = RAIZ / ".env"
PASTA_DADOS = RAIZ / "dados"

ESFORCOS_VALIDOS = {"low", "medium", "high", "xhigh", "max"}

# Provedor -> (variável da chave, variável do modelo, modelo padrão, prefixo esperado da chave)
PROVEDORES = {
    "anthropic": ("ANTHROPIC_API_KEY", "JARVIS_MODELO", "claude-opus-5-5", "sk-ant-"),
    "openai": ("OPENAI_API_KEY", "JARVIS_MODELO_OPENAI", "gpt-5", "sk-"),
    "gemini": ("GEMINI_API_KEY", "JARVIS_MODELO_GEMINI", "gemini-3.5-flash", ""),
}
APELIDOS = {"claude": "anthropic", "gpt": "openai", "chatgpt": "openai", "google": "gemini"}


class ErroConfiguracao(Exception):
    """Configuração ausente ou inválida."""


@dataclass(frozen=True)
class Config:
    api_key: str
    modelo: str
    esforco: str
    busca_web: bool
    nome_usuario: str
    pin_hash: str
    pin_tentativas: int
    bloqueio_minutos: int
    sites_permitidos: tuple[str, ...]
    aviso_permissoes: bool
    zoom: str = "auto"
    voz: bool = True
    escuta_continua: bool = True
    palavra_ativacao: bool = True
    modelo_voz: str = "small"
    esforco_agentes: str = "medium"
    esforco_voz: str = "low"
    provedor: str = "anthropic"
    fala: bool = True
    fala_sempre: bool = True
    voz_fala: str = "pt_BR-faber-medium"
    fala_velocidade: float = 1.0


    @property
    def tratamento(self) -> str:
        """Como o Jarvis se dirige ao usuário: "senhor Kennedy" (ou só "senhor")."""
        nome = self.nome_usuario.strip()
        if nome.lower() in {"", "senhor", "sr", "sr."}:
            return "senhor"
        if nome.lower().startswith(("senhor ", "sr. ", "sr ")):
            nome = nome.split(" ", 1)[1]
        return f"senhor {nome[:1].upper()}{nome[1:]}"


def _bool(valor: str) -> bool:
    return valor.strip().lower() in {"1", "true", "sim", "yes", "on"}


def _int(nome: str, padrao: int) -> int:
    try:
        return max(0, int(os.getenv(nome, str(padrao))))
    except ValueError:
        raise ErroConfiguracao(f"{nome} precisa ser um número inteiro.")


def _float(nome: str, padrao: float) -> float:
    try:
        return float(os.getenv(nome, str(padrao)).replace(",", "."))
    except ValueError:
        raise ErroConfiguracao(f"{nome} precisa ser um número, ex.: 1.0")


def _esforco(nome: str, padrao: str) -> str:
    valor = os.getenv(nome, padrao).strip().lower()
    if valor not in ESFORCOS_VALIDOS:
        raise ErroConfiguracao(f"{nome} deve ser um de: {', '.join(sorted(ESFORCOS_VALIDOS))}.")
    return valor


def carregar() -> Config:
    if not ARQUIVO_ENV.exists():
        raise ErroConfiguracao(
            "Arquivo .env não encontrado. Rode 'python configurar.py' para criá-lo."
        )

    # Se alguém deixou o .env legível por outros usuários, corrige na hora.
    aviso_permissoes = proteger_arquivo(ARQUIVO_ENV)
    load_dotenv(ARQUIVO_ENV, override=True)

    provedor = os.getenv("JARVIS_PROVEDOR", "anthropic").strip().lower() or "anthropic"
    provedor = APELIDOS.get(provedor, provedor)
    if provedor not in PROVEDORES:
        raise ErroConfiguracao("JARVIS_PROVEDOR deve ser anthropic, openai ou gemini.")
    var_chave, var_modelo, modelo_padrao, prefixo = PROVEDORES[provedor]

    api_key = os.getenv(var_chave, "").strip()
    if not api_key or "coloque-sua-chave" in api_key:
        raise ErroConfiguracao(
            f"{var_chave} não definida no .env. Rode 'python configurar.py'."
        )
    if not api_key.startswith(prefixo) or len(api_key) < 20:
        raise ErroConfiguracao(f"{var_chave} não parece uma chave válida.")

    esforco = os.getenv("JARVIS_ESFORCO", "medium").strip().lower()
    if esforco not in ESFORCOS_VALIDOS:
        raise ErroConfiguracao(f"JARVIS_ESFORCO deve ser um de: {', '.join(sorted(ESFORCOS_VALIDOS))}.")

    sites = tuple(
        s.strip().lower() for s in os.getenv("JARVIS_SITES_PERMITIDOS", "").split(",") if s.strip()
    )

    return Config(
        api_key=api_key,
        modelo=os.getenv(var_modelo, modelo_padrao).strip() or modelo_padrao,
        esforco=esforco,
        # A pesquisa na web usa uma ferramenta própria do Claude.
        busca_web=provedor == "anthropic" and _bool(os.getenv("JARVIS_BUSCA_WEB", "true")),
        nome_usuario=os.getenv("JARVIS_NOME_USUARIO", "Senhor").strip() or "Senhor",
        pin_hash=os.getenv("JARVIS_PIN_HASH", "").strip(),
        pin_tentativas=_int("JARVIS_PIN_TENTATIVAS", 5) or 5,
        bloqueio_minutos=_int("JARVIS_BLOQUEIO_MINUTOS", 15),
        sites_permitidos=sites,
        aviso_permissoes=aviso_permissoes,
        zoom=os.getenv("JARVIS_ZOOM", "auto").strip().lower() or "auto",
        voz=_bool(os.getenv("JARVIS_VOZ", "true")),
        escuta_continua=_bool(os.getenv("JARVIS_ESCUTA_CONTINUA", "true")),
        palavra_ativacao=_bool(os.getenv("JARVIS_PALAVRA_ATIVACAO", "true")),
        modelo_voz=os.getenv("JARVIS_MODELO_VOZ", "small").strip() or "small",
        esforco_agentes=_esforco("JARVIS_ESFORCO_AGENTES", "medium"),
        esforco_voz=_esforco("JARVIS_ESFORCO_VOZ", "low"),
        provedor=provedor,
        fala=_bool(os.getenv("JARVIS_FALA", "true")),
        fala_sempre=_bool(os.getenv("JARVIS_FALA_SEMPRE", "true")),
        voz_fala=os.getenv("JARVIS_VOZ_FALA", "pt_BR-faber-medium").strip() or "pt_BR-faber-medium",
        fala_velocidade=_float("JARVIS_FALA_VELOCIDADE", 1.0),
    )
