#!/usr/bin/env bash
# Cria o atalho do Jarvis no menu de aplicativos e na Área de Trabalho.
set -euo pipefail
PASTA="$(cd "$(dirname "$(readlink -f "$0")")" && pwd)"
chmod +x "$PASTA/jarvis.sh"

CONTEUDO="[Desktop Entry]
Type=Application
Name=J.A.R.V.I.S.
Comment=Seu assistente pessoal de IA
Exec=\"$PASTA/jarvis.sh\"
Icon=$PASTA/assets/jarvis.svg
Terminal=false
Categories=Utility;
StartupWMClass=Tk"

MENU="$HOME/.local/share/applications"
mkdir -p "$MENU"
printf '%s\n' "$CONTEUDO" > "$MENU/jarvis.desktop"
chmod +x "$MENU/jarvis.desktop"
echo "✔ Atalho criado no menu de aplicativos."

DESKTOP="$(xdg-user-dir DESKTOP 2>/dev/null || echo "$HOME/Desktop")"
if [ -d "$DESKTOP" ]; then
    cp "$MENU/jarvis.desktop" "$DESKTOP/jarvis.desktop"
    chmod +x "$DESKTOP/jarvis.desktop"
    gio set "$DESKTOP/jarvis.desktop" metadata::trusted true 2>/dev/null || true
    echo "✔ Atalho criado em $DESKTOP"
fi
