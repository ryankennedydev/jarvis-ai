import type { ReactNode } from "react";
import { useStore } from "../../store/useStore";
import type { Tab } from "../../types";
import { BrainIcon, ExpandIcon, GearIcon, SearchIcon } from "../ui/icons";

const ABAS: Array<{ id: Tab; nome: string }> = [
  { id: "mapa", nome: "Mapa" },
  { id: "projetos", nome: "Projetos" },
  { id: "dashboard", nome: "Dashboard" },
  { id: "lista", nome: "Lista" },
];

function telaCheia() {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen?.().catch(() => {});
}

export function Header() {
  const tab = useStore((s) => s.tab);
  const companyName = useStore((s) => s.companyName);
  const { setTab, setPaletteOpen, openModal } = useStore.getState();

  return (
    <header className="relative z-20 flex h-16 shrink-0 items-center gap-3 border-b border-white/5 bg-black/40 px-4 backdrop-blur-xl">
      <div className="flex min-w-0 items-center gap-2.5">
        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-neon/15 text-neon shadow-[0_0_16px_rgba(196,255,61,0.35)]">
          <BrainIcon className="h-5 w-5" />
        </div>
        <div className="hidden min-w-0 leading-tight sm:block">
          <div className="truncate text-sm font-bold tracking-[0.18em] text-white">SKILLTREE</div>
          <div className="truncate text-[10px] uppercase tracking-[0.25em] text-neon/60">{companyName}</div>
        </div>
      </div>

      <nav className="mx-auto flex rounded-xl border border-white/10 bg-white/[0.03] p-1" aria-label="Abas">
        {ABAS.map((a) => (
          <button key={a.id} onClick={() => setTab(a.id)} aria-current={tab === a.id}
                  className={`rounded-lg px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] transition sm:px-5
                    ${tab === a.id ? "bg-neon text-black shadow-[0_0_18px_rgba(196,255,61,0.4)]" : "text-zinc-400 hover:text-white"}`}>
            {a.nome}
          </button>
        ))}
      </nav>

      <div className="flex items-center gap-2">
        <button onClick={() => setPaletteOpen(true)}
                className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-zinc-400 transition hover:border-neon/40 hover:text-white">
          <SearchIcon className="h-4 w-4" />
          <span className="hidden md:inline">Buscar nós</span>
          <kbd className="hidden rounded border border-white/10 px-1.5 text-[10px] text-zinc-500 md:inline">Ctrl K</kbd>
        </button>
        <BotaoIcone titulo="Configurações" onClick={() => openModal({ kind: "settings" })}><GearIcon className="h-4 w-4" /></BotaoIcone>
        <BotaoIcone titulo="Tela cheia" onClick={telaCheia}><ExpandIcon className="h-4 w-4" /></BotaoIcone>
      </div>
    </header>
  );
}

function BotaoIcone({ titulo, onClick, children }: { titulo: string; onClick(): void; children: ReactNode }) {
  return (
    <button onClick={onClick} title={titulo} aria-label={titulo}
            className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-white/[0.03] text-zinc-400 transition hover:border-neon/40 hover:text-neon">
      {children}
    </button>
  );
}
