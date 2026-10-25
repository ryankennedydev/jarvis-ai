"""Inicia o Jarvis: python -m jarvis"""

import sys

from .config import PASTA_DADOS, ErroConfiguracao, carregar


def _mostrar_erro(mensagem: str) -> None:
    print(f"[JARVIS] {mensagem}", file=sys.stderr)
    try:  # Aberto pelo atalho não há terminal: mostra uma janela.
        import tkinter as tk
        from tkinter import messagebox

        raiz = tk.Tk()
        raiz.withdraw()
        messagebox.showerror("J.A.R.V.I.S.", mensagem)
        raiz.destroy()
    except Exception:  # noqa: BLE001
        pass


def main() -> int:
    try:
        config = carregar()
    except ErroConfiguracao as erro:
        _mostrar_erro(str(erro))
        return 1

    from .app import iniciar
    from .cerebro import Cerebro
    from .memoria import Memoria

    memoria = Memoria(PASTA_DADOS)
    iniciar(config, memoria, Cerebro(config, memoria))
    return 0


if __name__ == "__main__":
    sys.exit(main())
