// Markdown mínimo e seguro: TODO o texto é escapado antes de virar HTML,
// e só links https são aceitos (abertos no navegador do sistema, nunca aqui).
"use strict";

const Markdown = (() => {
  const escapar = (s) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
     .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

  function emLinha(texto) {
    const codigos = [];
    let s = escapar(texto).replace(/`([^`]+)`/g, (_, c) => {
      codigos.push(c);
      return `\u0000${codigos.length - 1}\u0000`;
    });
    s = s
      .replace(/\[([^\]]+)\]\((https:\/\/[^\s)]+)\)/g, '<a data-href="$2">$1</a>')
      .replace(/(^|[\s(])(https:\/\/[^\s<)]+)/g, '$1<a data-href="$2">$2</a>')
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>")
      .replace(/(^|\W)_([^_\s][^_]*)_(?=\W|$)/g, "$1<em>$2</em>");
    return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codigos[+i]}</code>`);
  }

  function paraHtml(fonte) {
    const linhas = fonte.replace(/\r\n/g, "\n").split("\n");
    const saida = [];
    let lista = null;     // "ul" | "ol"
    let paragrafo = [];
    let bloco = null;     // linhas de ``` em andamento

    const fecharParagrafo = () => {
      if (paragrafo.length) saida.push(`<p>${paragrafo.map(emLinha).join("<br>")}</p>`);
      paragrafo = [];
    };
    const fecharLista = () => { if (lista) saida.push(`</${lista}>`); lista = null; };

    for (const linha of linhas) {
      if (bloco !== null) {
        if (/^\s*```/.test(linha)) {
          saida.push(`<pre><code>${escapar(bloco.join("\n"))}</code></pre>`);
          bloco = null;
        } else bloco.push(linha);
        continue;
      }
      if (/^\s*```/.test(linha)) { fecharParagrafo(); fecharLista(); bloco = []; continue; }

      const titulo = linha.match(/^\s*#{1,6}\s+(.*)$/);
      const item = linha.match(/^\s*[-*•]\s+(.*)$/);
      const numerado = linha.match(/^\s*\d+[.)]\s+(.*)$/);
      const citacao = linha.match(/^\s*>\s?(.*)$/);

      if (titulo) { fecharParagrafo(); fecharLista(); saida.push(`<h4>${emLinha(titulo[1])}</h4>`); }
      else if (item || numerado) {
        fecharParagrafo();
        const tipo = item ? "ul" : "ol";
        if (lista !== tipo) { fecharLista(); saida.push(`<${tipo}>`); lista = tipo; }
        saida.push(`<li>${emLinha((item || numerado)[1])}</li>`);
      }
      else if (citacao) { fecharParagrafo(); fecharLista(); saida.push(`<blockquote>${emLinha(citacao[1])}</blockquote>`); }
      else if (!linha.trim()) { fecharParagrafo(); fecharLista(); }
      else { fecharLista(); paragrafo.push(linha); }
    }
    if (bloco !== null) saida.push(`<pre><code>${escapar(bloco.join("\n"))}</code></pre>`);
    fecharParagrafo();
    fecharLista();
    return saida.join("");
  }

  return { paraHtml };
})();
