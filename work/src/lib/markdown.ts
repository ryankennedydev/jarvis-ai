// Markdown mínimo e seguro (mesmo do Jarvis): TODO o texto é escapado antes de virar HTML,
// e só links https são aceitos (abertos no navegador do sistema, nunca dentro do app).

const escapar = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

function emLinha(texto: string): string {
  const codigos: string[] = [];
  let s = escapar(texto).replace(/`([^`]+)`/g, (_, c: string) => {
    codigos.push(c);
    return `\u0000${codigos.length - 1}\u0000`;
  });
  s = s
    .replace(/\[([^\]]+)\]\((https:\/\/[^\s)]+)\)/g, '<a data-href="$2">$1</a>')
    .replace(/(^|[\s(])(https:\/\/[^\s<)]+)/g, '$1<a data-href="$2">$2</a>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>");
  return s.replace(/\u0000(\d+)\u0000/g, (_, i: string) => `<code>${codigos[Number(i)]}</code>`);
}

export function markdownToHtml(fonte: string): string {
  const saida: string[] = [];
  let lista: "ul" | "ol" | null = null;
  let paragrafo: string[] = [];
  let bloco: string[] | null = null;

  const fecharParagrafo = () => {
    if (paragrafo.length) saida.push(`<p>${paragrafo.map(emLinha).join("<br>")}</p>`);
    paragrafo = [];
  };
  const fecharLista = () => { if (lista) saida.push(`</${lista}>`); lista = null; };

  for (const linha of fonte.replace(/\r\n/g, "\n").split("\n")) {
    if (bloco) {
      if (/^\s*```/.test(linha)) { saida.push(`<pre><code>${escapar(bloco.join("\n"))}</code></pre>`); bloco = null; }
      else bloco.push(linha);
      continue;
    }
    if (/^\s*```/.test(linha)) { fecharParagrafo(); fecharLista(); bloco = []; continue; }
    const titulo = linha.match(/^\s*#{1,6}\s+(.*)$/);
    const item = linha.match(/^\s*[-*•]\s+(.*)$/);
    const numerado = linha.match(/^\s*\d+[.)]\s+(.*)$/);
    if (titulo) { fecharParagrafo(); fecharLista(); saida.push(`<h4>${emLinha(titulo[1]!)}</h4>`); }
    else if (item || numerado) {
      fecharParagrafo();
      const tipo = item ? "ul" : "ol";
      if (lista !== tipo) { fecharLista(); saida.push(`<${tipo}>`); lista = tipo; }
      saida.push(`<li>${emLinha((item ?? numerado)![1]!)}</li>`);
    }
    else if (!linha.trim()) { fecharParagrafo(); fecharLista(); }
    else { fecharLista(); paragrafo.push(linha); }
  }
  if (bloco) saida.push(`<pre><code>${escapar(bloco.join("\n"))}</code></pre>`);
  fecharParagrafo();
  fecharLista();
  return saida.join("");
}

/** Abre links das respostas no navegador do sistema (via Jarvis) ou numa nova aba. */
export function abrirLink(url: string) {
  if (!/^https:\/\//.test(url)) return;
  const api = (window.parent as unknown as { pywebview?: { api?: { abrir_link?(u: string): void } } })?.pywebview?.api;
  if (api?.abrir_link) api.abrir_link(url);
  else window.open(url, "_blank", "noopener");
}
