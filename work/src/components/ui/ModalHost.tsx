import { useStore } from "../../store/useStore";
import { DeleteSectorDialog } from "./DeleteSectorDialog";
import { AgentModal } from "./AgentModal";
import { ManagerModal } from "./ManagerModal";
import { SectorModal } from "./SectorModal";
import { SettingsModal } from "./SettingsModal";

/** Mostra o modal aberto no store (só um por vez). */
export function ModalHost() {
  const modal = useStore((s) => s.modal);
  switch (modal.kind) {
    case "sector": return <SectorModal key={modal.editingId ?? "novo"} editingId={modal.editingId} />;
    case "agent": return <AgentModal key={modal.editingId ?? "novo"} editingId={modal.editingId} presetSectorId={modal.presetSectorId} />;
    case "manager": return <ManagerModal key={modal.sectorId} sectorId={modal.sectorId} />;
    case "deleteSector": return <DeleteSectorDialog sectorId={modal.sectorId} />;
    case "settings": return <SettingsModal />;
    default: return null;
  }
}
