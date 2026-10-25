# J.A.R.V.I.S.

Assistente pessoal de IA para desktop, em Python. O cérebro pode ser o **Claude (Opus 5.5)**,
o **GPT** (OpenAI) ou o **Gemini** (Google): você escolhe no `configurar.py`.

## Começando

```bash
cd ~/Documentos/jarvis
python3 configurar.py      # cola a chave, define seu nome e um PIN
./instalar_atalho.sh       # cria o ícone no menu e na Área de Trabalho
./jarvis.sh                # ou abra pelo ícone
```

Na primeira execução o `jarvis.sh` cria o ambiente virtual (`.venv`) e instala as dependências.
Chaves: Claude em <https://console.anthropic.com>, GPT em <https://platform.openai.com/api-keys>
e Gemini em <https://aistudio.google.com/apikey>.

Com GPT ou Gemini, memória, tarefas, ferramentas e o módulo Work funcionam igual.
A pesquisa na web e o fallback automático de modelo são exclusivos do Claude.

## O que ele faz

- **Conversa em streaming**, com raciocínio adaptativo (o reator pulsa enquanto ele pensa).
- **Memória de longo prazo**: quando você conta algo duradouro, ele salva sozinho e lembra
  nas próximas conversas. Veja e apague tudo no botão **Memórias**.
- **Pesquisa na web** para informações atuais (pode desligar no `.env`).
- **Responde por voz** quando você fala com ele pelo microfone, com voz neural local (Piper).
  O reator pulsa no ritmo da fala; clique no microfone ou aperte Esc para interromper.
- **Data/hora** do seu computador e **abrir sites** no navegador.
- Se o modelo principal recusar um pedido, a API tenta automaticamente um modelo alternativo.

## Segurança

| Proteção | Como funciona |
|---|---|
| Chave fora do código | Fica só no `.env`, que está no `.gitignore` |
| Permissões | `.env` e banco de memórias com `chmod 600`; corrigido automaticamente se estiver aberto |
| Chave mascarada | A interface só mostra `sk-ant-…abcd`; o `configurar.py` não ecoa a chave |
| PIN de acesso | Guardado só como hash PBKDF2-SHA256 (600 mil iterações, salt aleatório) |
| Força bruta | Atraso crescente entre tentativas; fecha após `JARVIS_PIN_TENTATIVAS` erros |
| Bloqueio automático | Trava após `JARVIS_BLOQUEIO_MINUTOS` sem uso |
| Ferramentas | Entradas validadas; só abre `https://`, opcionalmente restrito a `JARVIS_SITES_PERMITIDOS` |
| Dados sensíveis | O Jarvis é instruído a nunca memorizar senhas, chaves ou cartões |

> O PIN protege o acesso pela interface. Os arquivos `.env` e `dados/cerebro.db` ficam
> legíveis pelo seu usuário do sistema; para proteção em repouso, use disco criptografado (LUKS).

## Configuração (`.env`)

| Variável | Padrão | Descrição |
|---|---|---|
| `JARVIS_PROVEDOR` | `anthropic` | `anthropic`, `openai` ou `gemini` |
| `ANTHROPIC_API_KEY` | — | Chave da Anthropic (se usar Claude) |
| `OPENAI_API_KEY` | vazio | Chave da OpenAI (se usar GPT) |
| `GEMINI_API_KEY` | vazio | Chave do Google AI Studio (se usar Gemini) |
| `JARVIS_PIN_HASH` | vazio | Gerado pelo `configurar.py` (vazio = sem PIN) |
| `JARVIS_PIN_TENTATIVAS` | 5 | Tentativas antes de fechar |
| `JARVIS_BLOQUEIO_MINUTOS` | 15 | Bloqueio por inatividade (0 desliga) |
| `JARVIS_SITES_PERMITIDOS` | vazio | Ex.: `google.com,youtube.com` |
| `JARVIS_MODELO` | `claude-opus-5-5` | Modelo do Claude |
| `JARVIS_MODELO_OPENAI` | `gpt-5` | Modelo do GPT |
| `JARVIS_MODELO_GEMINI` | `gemini-3.5-flash` | Modelo do Gemini |
| `JARVIS_ESFORCO` | `medium` | `low` (mais rápido/barato) … `max` (mais profundo) |
| `JARVIS_BUSCA_WEB` | `true` | Liga a pesquisa na web |
| `JARVIS_NOME_USUARIO` | `Senhor` | Como ele te chama |
| `JARVIS_FALA` | `true` | Liga a resposta falada |
| `JARVIS_FALA_SEMPRE` | `false` | `true` fala também as respostas digitadas |
| `JARVIS_VOZ_FALA` | `pt_BR-faber-medium` | Voz do Piper |
| `JARVIS_FALA_VELOCIDADE` | `1.0` | Velocidade da fala |

Para trocar a chave ou o PIN, rode `python3 configurar.py` de novo.

## Estrutura

```
jarvis/
├── configurar.py        # assistente que grava o .env com segurança
├── jarvis.sh            # inicializador (cria .venv na 1ª vez)
├── instalar_atalho.sh   # atalho de desktop (Linux)
├── assets/jarvis.svg    # ícone
├── dados/               # memórias e histórico (criado ao rodar, não versionar)
└── jarvis/
    ├── config.py        # lê e valida o .env
    ├── seguranca.py     # PIN, permissões, mascaramento
    ├── memoria.py       # SQLite: memórias + histórico
    ├── ferramentas.py   # ferramentas que o Jarvis pode usar
    ├── cerebro.py       # integração com o Claude (streaming, ferramentas, fallback)
    └── interface.py     # janela desktop (CustomTkinter)
```

## Adicionando novas habilidades

1. Em `jarvis/ferramentas.py`, acrescente a definição em `DEFINICOES` (nome, descrição, `input_schema`).
2. Crie o método `_<nome>` na classe `Ferramentas`, retornando um `dict`.
3. Pronto: o Claude passa a usá-la sozinho quando fizer sentido.
