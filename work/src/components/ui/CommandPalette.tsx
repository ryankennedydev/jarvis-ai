import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { normalize, sectorColor } from "../../lib/util";
import { useStore } from "../../store/useStore";
import { Avatar } from "./Avatar";
import { FloorIcon, SearchIcon } from "./icons";

interface Resultado {
  id: string;
  tipo: "setor" | "agente";
  titulo: string;
  sub: string;
  cor: string;
}

const LIMITE = 30;

export function CommandPalette() {
  const aberto = useStore((s) => s.paletteOpen);
  const sectors = useStore((s) => s.sectors);
  const agents = useStore((s) => s.agents);
  const [busca, setBusca] = useState("");
  const [indice, setIndice] = useState(0);
  const campo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (aberto) { setBusca(""); setIndice(0); setTimeout(() => campo.current?.focus(), 10); }
  }, [aberto]);

  const resultados = useMemo<Resultado[]>(() => {
    const q = normalize(busca.trim());
    const nomeSetor = new Map(sectors.map((s) => [s.id, s]));
    const lista: Resultado[] = [];
    for (const s of [...sectors].sort((a, b) => b.order - a.order)) {
      if (!q || normalize(`${s.name} ${s.description} ${s.manager.name}`).includes(q)) {
        lista.push({ id: s.id, tipo: "setor", titulo: s.name, sub: `${s.order + 1}º andar · gerente ${s.manager.name}`, cor: sectorColor(s.color) });
      }
    }
    for (const a of agents) {
      if (lista.length >= LIMITE) break;
      if (!q || normalize(`${a.name} ${a.role}`).includes(q)) {
        const setor = nomeSetor.get(a.sectorId);
        lista.push({ id: a.id, tipo: "agente", titulo: a.name, sub: `${a.role} · ${setor?.name ?? ""}`, cor: sectorColor(setor?.color) });
      }
    }
    return lista.slice(0, LIMITE);
  }, [busca, sectors, agents]);

  if (!aberto) return null;
  const { setPaletteOpen, setTab, selectSector, openAgent, focusNode } = useStore.getState();

  const escolher = (r: Resultado | undefined) => {
    if (!r) return;
    setPaletteOpen(false);
    setTab("mapa");
    if (r.tipo === "setor") {
      if (useStore.getState().selectedSectorId !== r.id) selectSector(r.id);
    } else {
      const agente = agents.find((a) => a.id === r.id);
      if (agente && useStore.getState().selectedSectorId !== agente.sectorId) selectSector(agente.sectorId);
      openAgent(r.id);
    }
    // Espera o mapa montar (se estava em outra aba) e centraliza o nó.
    setTimeout(() => focusNode(r.id), 60);
  };

  const teclas = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setIndice((i) => Math.min(i + 1, resultados.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setIndice((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); escolher(resultados[indice]); }
    else if (e.key === "Escape") setPaletteOpen(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 px-4 pt-[12vh] backdrop-blur-sm"
         onMouseDown={(e) => e.target === e.currentTarget && setPaletteOpen(false)}>
      <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-neon/25 bg-[#090c08]/95 shadow-[0_0_80px_rgba(196,255,61,0.12)]">
        <div className="flex items-center gap-3 border-b border-white/5 px-4">
          <SearchIcon className="h-4 w-4 text-neon/70" />
          <input ref={campo} value={busca} onKeyDown={teclas}
                 onChange={(e) => { setBusca(e.target.value); setIndice(0); }}
                 placeholder="Buscar setores, gerentes e agentes…"
                 className="h-14 flex-1 bg-transparent text-white outline-none placeholder:text-zinc-600" />
          <kbd className="rounded border border-white/10 px-1.5 py-0.5 text-[10px] text-zinc-500">ESC</kbd>
        </div>
        <ul className="max-h-[50vh] overflow-y-auto p-2" role="listbox">
          {resultados.length === 0 && <li className="px-3 py-6 text-center text-sm text-zinc-500">Nada encontrado.</li>}
          {resultados.map((r, i) => (
            <li key={r.id} role="option" aria-selected={i === indice}
                onMouseEnter={() => setIndice(i)} onClick={() => escolher(r)}
                className={`flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 ${i === indice ? "bg-neon/10" : ""}`}>
              {r.tipo === "setor" ? (
                <div className="grid h-9 w-9 place-items-center rounded-lg border" style={{ borderColor: `${r.cor}55`, color: r.cor }}>
                  <FloorIcon className="h-4 w-4" />
                </div>
              ) : (
                <Avatar name={r.titulo} />
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm text-white">{r.titulo}</div>
                <div className="truncate text-xs text-zinc-500">{r.sub}</div>
              </div>
              <span className="text-[10px] uppercase tracking-wider text-zinc-600">{r.tipo === "setor" ? "setor" : "agente"}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
