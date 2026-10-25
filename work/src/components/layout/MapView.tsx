import { useStore } from "../../store/useStore";
import { BrainCanvas } from "../brain/BrainCanvas";
import { Building } from "../building/Building";
import { ChatPanel } from "../chat/ChatPanel";
import { ChatIcon, PlusIcon } from "../ui/icons";

/** Aba principal: prédio 3D (~30%) + cérebro (~70%). Em tela pequena, um em cima do outro. */
export function MapView() {
  const selected = useStore((s) => s.sectors.find((x) => x.id === s.selectedSectorId));
  const total = useStore((s) => s.sectors.length);
  const chatAberto = useStore((s) => s.chatSectorId !== null);
  const { openModal, selectSector, openChat } = useStore.getState();

  return (
    <div className="flex h-full flex-col lg:flex-row">
      <section className={`relative h-[42vh] shrink-0 border-b border-white/5 transition-[width] duration-300 lg:h-full ${chatAberto ? "lg:w-[24%]" : "lg:w-[30%]"} lg:border-b-0 lg:border-r`}>
        <Building />
        <div className="absolute left-3 top-3 flex gap-2">
          <button onClick={() => openModal({ kind: "sector" })}
                  className="flex items-center gap-1.5 rounded-lg border border-neon/30 bg-black/60 px-3 py-1.5 text-xs font-medium text-neon backdrop-blur transition hover:border-neon hover:shadow-[0_0_16px_rgba(196,255,61,0.3)]">
            <PlusIcon className="h-3.5 w-3.5" /> Novo andar
          </button>
          <button onClick={() => openModal({ kind: "agent" })}
                  className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-black/60 px-3 py-1.5 text-xs text-zinc-300 backdrop-blur transition hover:border-neon/40 hover:text-neon">
            <PlusIcon className="h-3.5 w-3.5" /> Agente
          </button>
        </div>
        {total === 0 && (
          <p className="pointer-events-none absolute inset-x-0 bottom-6 text-center text-sm text-zinc-500">
            Sem andares ainda. Clique em “Novo andar”.
          </p>
        )}
      </section>

      <section className="relative min-h-0 flex-1">
        <BrainCanvas />
        {selected && (
          <div className="absolute left-4 top-4 flex items-center gap-3 rounded-xl border border-neon/25 bg-black/60 px-4 py-2.5 backdrop-blur animate-[aparecer_.2s_ease]">
            <div>
              <div className="text-[10px] uppercase tracking-[0.25em] text-neon/70">{selected.order + 1}º andar</div>
              <div className="text-sm font-semibold text-white">{selected.name}</div>
              <div className="text-[11px] text-zinc-500">gerente {selected.manager.name}</div>
            </div>
            {!chatAberto && (
              <button onClick={() => openChat(selected.id)}
                      className="flex items-center gap-1 rounded-lg bg-neon px-2.5 py-1 text-xs font-semibold text-black">
                <ChatIcon className="h-3.5 w-3.5" /> Conversar
              </button>
            )}
            <button onClick={() => openModal({ kind: "agent", presetSectorId: selected.id })}
                    className="rounded-lg border border-white/10 px-2.5 py-1 text-xs text-zinc-300 hover:border-neon/40 hover:text-neon">+ Agente</button>
            <button onClick={() => openModal({ kind: "manager", sectorId: selected.id })}
                    className="rounded-lg border border-white/10 px-2.5 py-1 text-xs text-zinc-300 hover:border-neon/40 hover:text-neon">Gerente</button>
            <button onClick={() => openModal({ kind: "sector", editingId: selected.id })}
                    className="rounded-lg border border-white/10 px-2.5 py-1 text-xs text-zinc-300 hover:border-neon/40 hover:text-neon">Editar</button>
            <button onClick={() => selectSector(null)} className="text-xs text-zinc-500 hover:text-white">Limpar</button>
          </div>
        )}
      </section>

      {chatAberto && (
        <div className="fixed inset-0 z-30 lg:static lg:inset-auto lg:z-auto lg:h-full">
          <ChatPanel />
        </div>
      )}
    </div>
  );
}
