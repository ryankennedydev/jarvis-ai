"""Funções de segurança: PIN com hash, permissões de arquivo e mascaramento de segredos."""

import hashlib
import hmac
import os
import secrets
import stat
from pathlib import Path

ITERACOES_PBKDF2 = 600_000


def gerar_hash_pin(pin: str) -> str:
    """Gera um hash PBKDF2-SHA256 com salt aleatório. O PIN em si nunca é salvo."""
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", pin.encode(), salt, ITERACOES_PBKDF2)
    return f"pbkdf2_sha256${ITERACOES_PBKDF2}${salt.hex()}${digest.hex()}"


def verificar_pin(pin: str, hash_salvo: str) -> bool:
    """Compara o PIN digitado com o hash salvo em tempo constante."""
    try:
        algoritmo, iteracoes, salt_hex, digest_hex = hash_salvo.split("$")
        if algoritmo != "pbkdf2_sha256":
            return False
        digest = hashlib.pbkdf2_hmac(
            "sha256", pin.encode(), bytes.fromhex(salt_hex), int(iteracoes)
        )
        return hmac.compare_digest(digest.hex(), digest_hex)
    except (ValueError, TypeError):
        return False


def proteger_arquivo(caminho: Path) -> bool:
    """Garante que só o dono possa ler/escrever o arquivo (chmod 600).

    Retorna True se as permissões precisaram ser corrigidas.
    """
    if os.name != "posix" or not caminho.exists():
        return False
    modo = stat.S_IMODE(caminho.stat().st_mode)
    if modo & (stat.S_IRWXG | stat.S_IRWXO):
        caminho.chmod(0o600)
        return True
    return False


def proteger_pasta(caminho: Path) -> None:
    """Cria a pasta (se preciso) acessível apenas pelo dono (chmod 700)."""
    caminho.mkdir(parents=True, exist_ok=True)
    if os.name == "posix":
        caminho.chmod(0o700)


def mascarar(segredo: str) -> str:
    """Mostra só o começo e o fim de um segredo, ex.: sk-ant-…a1b2."""
    if not segredo or len(segredo) < 12:
        return "••••"
    return f"{segredo[:7]}…{segredo[-4:]}"
