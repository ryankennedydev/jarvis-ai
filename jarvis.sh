#!/usr/bin/env bash
# Inicia o Jarvis. Na primeira vez, cria o ambiente virtual e instala as dependências.
set -euo pipefail
cd "$(dirname "$(readlink -f "$0")")"

# A janela usa o GTK/WebKit do sistema, então o ambiente enxerga os pacotes do sistema.
if ! /usr/bin/python3 -c "import gi; gi.require_version('WebKit2', '4.1')" 2>/dev/null; then
    echo "Faltam pacotes do sistema. Rode:  sudo dnf install python3-gobject webkit2gtk4.1"
    exit 1
fi

if [ ! -x .venv/bin/python ] || ! .venv/bin/python -c "import gi, webview" 2>/dev/null; then
    echo "Preparando ambiente..."
    rm -rf .venv
    /usr/bin/python3 -m venv --system-site-packages .venv
    .venv/bin/pip install -q --upgrade pip
    .venv/bin/pip install -q -r requirements.txt
fi

# Dependências novas (ex.: openai) em um ambiente que já existia.
if ! .venv/bin/python -c "import openai, piper, faster_whisper, sounddevice" 2>/dev/null; then
    .venv/bin/pip install -q -r requirements.txt
fi

if [ ! -f .env ]; then
    .venv/bin/python configurar.py
fi

exec .venv/bin/python -m jarvis
