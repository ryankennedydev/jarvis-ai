"""Assistente de configuração: grava sua chave e seu PIN no .env com segurança.

Uso:  python configurar.py
"""

import getpass
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent
sys.path.insert(0, str(RAIZ))

from jarvis.config import PROVEDORES  # noqa: E402
from jarvis.seguranca import gerar_hash_pin, mascarar, proteger_arquivo  # noqa: E402

ROTULOS = {
    "anthropic": "Claude (Anthropic)",
    "openai": "GPT (OpenAI)",
    "gemini": "Gemini (Google)",
}

ARQUIVO_ENV = RAIZ / ".env"
MODELO = RAIZ / ".env.example"


def ler_env(caminho: Path) -> dict[str, str]:
    valores = {}
    if caminho.exists():
        for linha in caminho.read_text(encoding="utf-8").splitlines():
            if "=" in linha and not linha.lstrip().startswith("#"):
                chave, valor = linha.split("=", 1)
                valores[chave.strip()] = valor.strip()
    return valores


def gravar_env(novos: dict[str, str]) -> None:
    """Reescreve o .env a partir do modelo, preservando os comentários."""
    linhas = []
    usados = set()
    for linha in MODELO.read_text(encoding="utf-8").splitlines():
        if "=" in linha and not linha.lstrip().startswith("#"):
            chave = linha.split("=", 1)[0].strip()
            if chave in novos:
                linha = f"{chave}={novos[chave]}"
                usados.add(chave)
        linhas.append(linha)
    linhas += [f"{k}={v}" for k, v in novos.items() if k not in usados]

    # Cria o arquivo já com permissão 600 antes de escrever o segredo.
    ARQUIVO_ENV.touch(mode=0o600, exist_ok=True)
    proteger_arquivo(ARQUIVO_ENV)
    ARQUIVO_ENV.write_text("\n".join(linhas) + "\n", encoding="utf-8")


# Palavras que indicam modelos que não servem para conversa (imagem, voz, embeddings...).
FORA_DO_CHAT = ("image", "tts", "audio", "embedding", "live", "robotics", "transcribe",
                "realtime", "search", "moderation", "whisper", "dall-e", "computer-use",
                "translate", "nano-banana", "omni", "instruct", "codex")


def listar_modelos(provedor: str, chave: str) -> list[str]:
    """Pergunta à API quais modelos de conversa a chave pode usar (vazio se falhar)."""
    try:
        if provedor == "anthropic":
            import anthropic
            ids = [m.id for m in anthropic.Anthropic(api_key=chave, timeout=15).models.list(limit=100)]
        else:
            from jarvis.provedores import criar_cliente
            ids = [m.id.removeprefix("models/") for m in criar_cliente(provedor, chave)
                   .with_options(timeout=15, max_retries=1).models.list()]
    except Exception as erro:  # noqa: BLE001 - sem internet, chave inválida etc.
        print(f"  (Não consegui listar os modelos: {type(erro).__name__}.)")
        return []
    prefixos = {"anthropic": ("claude",), "openai": ("gpt", "o1", "o3", "o4", "o5"), "gemini": ("gemini",)}
    bons = [i for i in ids if i.startswith(prefixos[provedor]) and not any(p in i for p in FORA_DO_CHAT)]
    return sorted(set(bons), reverse=True)


def escolher_modelo(provedor: str, chave: str, atuais: dict[str, str]) -> None:
    _, var_modelo, padrao, _ = PROVEDORES[provedor]
    atual = atuais.get(var_modelo, "").strip() or padrao
    print("\nBuscando os modelos disponíveis para a sua chave...")
    modelos = listar_modelos(provedor, chave)
    if modelos:
        if atual not in modelos:
            print(f"  Atenção: o modelo atual ({atual}) não está disponível para esta chave.")
        for i, nome in enumerate(modelos, 1):
            print(f"  {i:2}) {nome}" + ("  (atual)" if nome == atual else ""))
    while True:
        resposta = input(f"Número ou nome do modelo [Enter mantém {atual}]: ").strip()
        if not resposta:
            escolhido = atual
        elif resposta.isdigit() and modelos and 1 <= int(resposta) <= len(modelos):
            escolhido = modelos[int(resposta) - 1]
        elif resposta.isdigit():
            print("  Número fora da lista.")
            continue
        else:
            escolhido = resposta
        break
    atuais[var_modelo] = escolhido
    print(f"  Modelo: {escolhido}\n")


def main() -> None:
    print("=== Configuração do J.A.R.V.I.S. ===\n")
    atuais = {**ler_env(MODELO), **ler_env(ARQUIVO_ENV)}

    opcoes = list(PROVEDORES)
    atual = atuais.get("JARVIS_PROVEDOR", "anthropic").strip().lower() or "anthropic"
    if atual not in opcoes:
        atual = "anthropic"
    print("Qual IA vai ser o cérebro do Jarvis?")
    for i, nome in enumerate(opcoes, 1):
        print(f"  {i}) {ROTULOS[nome]}" + ("  (atual)" if nome == atual else ""))
    while True:
        escolha = input(f"Escolha [Enter mantém {ROTULOS[atual].split(' ')[0]}]: ").strip()
        if not escolha:
            provedor = atual
            break
        if escolha.isdigit() and 1 <= int(escolha) <= len(opcoes):
            provedor = opcoes[int(escolha) - 1]
            break
        print("  Digite o número de uma das opções.")
    atuais["JARVIS_PROVEDOR"] = provedor

    var_chave, _, _, prefixo = PROVEDORES[provedor]
    chave_atual = atuais.get(var_chave, "")
    tem_chave = (len(chave_atual) > 20 and chave_atual.startswith(prefixo)
                 and "coloque-sua-chave" not in chave_atual)
    if tem_chave:
        print(f"Chave atual: {mascarar(chave_atual)}")
    while True:
        chave = getpass.getpass(
            f"Cole sua chave da API {ROTULOS[provedor]} (não aparece na tela)"
            + (" [Enter mantém a atual]: " if tem_chave else ": ")
        ).strip()
        if not chave and tem_chave:
            chave = chave_atual
            break
        if chave.startswith(prefixo) and len(chave) > 20:
            break
        print("  Isso não parece uma chave válida. Tente de novo.")
    atuais[var_chave] = chave
    escolher_modelo(provedor, chave, atuais)

    nome = input(f"Como o Jarvis deve te chamar? [{atuais.get('JARVIS_NOME_USUARIO', 'Senhor')}]: ").strip()
    if nome:
        atuais["JARVIS_NOME_USUARIO"] = nome

    resposta = input("Proteger o Jarvis com PIN de acesso? (S/n): ").strip().lower()
    if resposta in ("", "s", "sim", "y"):
        while True:
            pin = getpass.getpass("Novo PIN (mín. 4 dígitos/caracteres): ")
            if len(pin) < 4:
                print("  PIN curto demais.")
                continue
            if getpass.getpass("Repita o PIN: ") != pin:
                print("  Os PINs não conferem.")
                continue
            break
        atuais["JARVIS_PIN_HASH"] = gerar_hash_pin(pin)
    else:
        atuais["JARVIS_PIN_HASH"] = ""

    gravar_env(atuais)
    print(f"\n✔ Configuração salva em {ARQUIVO_ENV} (permissão 600, só você lê).")
    print("  Inicie com ./jarvis.sh ou instale o atalho com ./instalar_atalho.sh")


if __name__ == "__main__":
    try:
        main()
    except (KeyboardInterrupt, EOFError):
        print("\nCancelado. Nada foi alterado.")
