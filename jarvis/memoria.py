"""Memória de longo prazo do Jarvis (SQLite local, só o dono do arquivo tem acesso)."""

import json
import sqlite3
import threading
from datetime import datetime
from pathlib import Path

from .seguranca import proteger_arquivo, proteger_pasta

ESQUEMA = """
CREATE TABLE IF NOT EXISTS memorias (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    conteudo   TEXT NOT NULL,
    categoria  TEXT NOT NULL DEFAULT 'geral',
    criada_em  TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS pastas (
    id    INTEGER PRIMARY KEY AUTOINCREMENT,
    nome  TEXT NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS chats (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    pasta_id       INTEGER NOT NULL REFERENCES pastas(id) ON DELETE CASCADE,
    titulo         TEXT NOT NULL,
    mensagens      TEXT NOT NULL DEFAULT '[]',
    atualizado_em  TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tarefas (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    texto      TEXT NOT NULL,
    prazo      TEXT NOT NULL DEFAULT '',
    feita      INTEGER NOT NULL DEFAULT 0,
    criada_em  TEXT NOT NULL
);
"""

PASTAS_PADRAO = ("geral", "pessoal", "trabalho", "estudos")


def _agora() -> str:
    return datetime.now().isoformat(timespec="seconds")


class Memoria:
    def __init__(self, pasta: Path):
        proteger_pasta(pasta)
        self.caminho = pasta / "cerebro.db"
        # A interface e o cérebro rodam em threads diferentes: uma conexão + trava.
        self._conexao = sqlite3.connect(self.caminho, check_same_thread=False)
        self._conexao.row_factory = sqlite3.Row
        self._trava = threading.Lock()
        with self._trava, self._conexao:
            self._conexao.execute("PRAGMA foreign_keys = ON")
            self._conexao.executescript(ESQUEMA)
            self._conexao.executemany(
                "INSERT OR IGNORE INTO pastas (nome) VALUES (?)", [(p,) for p in PASTAS_PADRAO]
            )
        proteger_arquivo(self.caminho)

    def _ler(self, sql: str, parametros: tuple = ()) -> list[dict]:
        with self._trava:
            return [dict(l) for l in self._conexao.execute(sql, parametros).fetchall()]

    def _escrever(self, sql: str, parametros: tuple = ()) -> sqlite3.Cursor:
        with self._trava, self._conexao:
            return self._conexao.execute(sql, parametros)

    # --- Memórias (fatos sobre o usuário) ---------------------------

    def lembrar(self, conteudo: str, categoria: str = "geral") -> int:
        return self._escrever(
            "INSERT INTO memorias (conteudo, categoria, criada_em) VALUES (?, ?, ?)",
            (conteudo.strip(), categoria.strip().lower() or "geral", _agora()),
        ).lastrowid

    def buscar(self, termo: str = "", limite: int = 30) -> list[dict]:
        return self._ler(
            "SELECT * FROM memorias WHERE conteudo LIKE ? OR categoria LIKE ? ORDER BY id DESC LIMIT ?",
            (f"%{termo}%", f"%{termo}%", limite),
        )

    def esquecer(self, memoria_id: int) -> bool:
        return self._escrever("DELETE FROM memorias WHERE id = ?", (memoria_id,)).rowcount > 0

    def todas(self) -> list[dict]:
        return self._ler("SELECT * FROM memorias ORDER BY categoria, id")

    # --- Pastas e conversas ---------------------------------------

    def pastas(self) -> list[dict]:
        return self._ler(
            "SELECT p.id, p.nome, COUNT(c.id) AS total FROM pastas p "
            "LEFT JOIN chats c ON c.pasta_id = p.id GROUP BY p.id ORDER BY p.id"
        )

    def criar_pasta(self, nome: str) -> int:
        nome = nome.strip().lower()[:40]
        if not nome:
            raise ValueError("Nome de pasta vazio.")
        self._escrever("INSERT OR IGNORE INTO pastas (nome) VALUES (?)", (nome,))
        return self._ler("SELECT id FROM pastas WHERE nome = ?", (nome,))[0]["id"]

    def chats(self, pasta_id: int) -> list[dict]:
        return self._ler(
            "SELECT id, titulo, atualizado_em FROM chats WHERE pasta_id = ? ORDER BY atualizado_em DESC",
            (pasta_id,),
        )

    def criar_chat(self, pasta_id: int, titulo: str) -> int:
        return self._escrever(
            "INSERT INTO chats (pasta_id, titulo, atualizado_em) VALUES (?, ?, ?)",
            (pasta_id, titulo.strip()[:80] or "Nova conversa", _agora()),
        ).lastrowid

    def salvar_chat(self, chat_id: int, mensagens: list) -> None:
        self._escrever(
            "UPDATE chats SET mensagens = ?, atualizado_em = ? WHERE id = ?",
            (json.dumps(mensagens, ensure_ascii=False), _agora(), chat_id),
        )

    def carregar_chat(self, chat_id: int) -> dict | None:
        linhas = self._ler("SELECT * FROM chats WHERE id = ?", (chat_id,))
        if not linhas:
            return None
        chat = linhas[0]
        chat["mensagens"] = json.loads(chat["mensagens"])
        return chat

    def apagar_chat(self, chat_id: int) -> None:
        self._escrever("DELETE FROM chats WHERE id = ?", (chat_id,))

    # --- Tarefas ---------------------------------------------------

    def adicionar_tarefa(self, texto: str, prazo: str = "") -> int:
        return self._escrever(
            "INSERT INTO tarefas (texto, prazo, criada_em) VALUES (?, ?, ?)",
            (texto.strip(), prazo.strip(), _agora()),
        ).lastrowid

    def tarefas(self, incluir_feitas: bool = False) -> list[dict]:
        filtro = "" if incluir_feitas else "WHERE feita = 0"
        return self._ler(f"SELECT * FROM tarefas {filtro} ORDER BY feita, id")

    def concluir_tarefa(self, tarefa_id: int, feita: bool = True) -> bool:
        return self._escrever(
            "UPDATE tarefas SET feita = ? WHERE id = ?", (int(feita), tarefa_id)
        ).rowcount > 0

    def apagar_tarefa(self, tarefa_id: int) -> bool:
        return self._escrever("DELETE FROM tarefas WHERE id = ?", (tarefa_id,)).rowcount > 0

    # --- Painel ----------------------------------------------------

    def contagens(self) -> dict:
        with self._trava:
            um = lambda sql: self._conexao.execute(sql).fetchone()[0]  # noqa: E731
            return {
                "tarefas": um("SELECT COUNT(*) FROM tarefas WHERE feita = 0"),
                "memorias": um("SELECT COUNT(*) FROM memorias"),
                "conversas": um("SELECT COUNT(*) FROM chats"),
            }

    def fechar(self) -> None:
        with self._trava:
            self._conexao.close()
