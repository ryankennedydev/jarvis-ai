import { useEffect } from "react";
import { Dashboard } from "./components/dashboard/Dashboard";
import { Header } from "./components/layout/Header";
import { MapView } from "./components/layout/MapView";
import { Starfield } from "./components/layout/Starfield";
import { ListView } from "./components/list/ListView";
import { ProjectsView } from "./components/projects/ProjectsView";
import { CommandPalette } from "./components/ui/CommandPalette";
import { AgentDrawer } from "./components/ui/AgentDrawer";
import { ModalHost } from "./components/ui/ModalHost";
import { useStore } from "./store/useStore";

function useAtalhos() {
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      const { paletteOpen, setPaletteOpen, modal, selectedAgentId, openAgent, selectSector } = useStore.getState();
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(!paletteOpen);
      } else if (e.key === "Escape" && !paletteOpen && modal.kind === "none") {
        if (selectedAgentId) openAgent(null);
        else selectSector(null);
      }
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, []);
}

export default function App() {
  const loaded = useStore((s) => s.loaded);
  const tab = useStore((s) => s.tab);
  useAtalhos();
  useEffect(() => { useStore.getState().load(); }, []);

  return (
    <div className="relative flex h-full flex-col">
      <Starfield />
      <Header />
      <main className="relative z-10 min-h-0 flex-1">
        {!loaded ? (
          <div className="grid h-full place-items-center text-sm text-zinc-500">Carregando empresa…</div>
        ) : tab === "mapa" ? <MapView /> : tab === "projetos" ? <ProjectsView /> : tab === "dashboard" ? <Dashboard /> : <ListView />}
      </main>
      <AgentDrawer />
      <ModalHost />
      <CommandPalette />
    </div>
  );
}
