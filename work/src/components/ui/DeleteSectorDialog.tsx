import { useState } from "react";
import { useStore } from "../../store/useStore";
import { Select } from "./Field";
import { Button, Modal } from "./Modal";

export function DeleteSectorDialog({ sectorId }: { sectorId: string }) {
  const sectors = useStore((s) => s.sectors);
  const equipe = useStore((s) => s.agents.filter((a) => a.sectorId === sectorId).length);
  const { deleteSector, closeModal } = useStore.getState();
  const setor = sectors.find((s) => s.id === sectorId);
  const outros = sectors.filter((s) => s.id !== sectorId).sort((a, b) => b.order - a.order);
  const [acao, setAcao] = useState<"mover" | "excluir">(outros.length ? "mover" : "excluir");
  const [destino, setDestino] = useState(outros[0]?.id ?? "");

  if (!setor) return null;
  const confirmar = () => {
    deleteSector(setor.id, equipe && acao === "mover" ? destino : null);
    closeModal();
  };

  return (
    <Modal
      title="Excluir andar"
      onClose={closeModal}
      footer={<>
        <Button onClick={closeModal}>Cancelar</Button>
        <Button variant="danger" onClick={confirmar}>Excluir {setor.name}</Button>
      </>}
    >
      <p className="text-sm text-zinc-300">
        Excluir o setor <b className="text-white">{setor.name}</b> ({setor.order + 1}º andar)?
      </p>
      {equipe > 0 && (
        <div className="mt-4 space-y-3 rounded-xl border border-white/10 bg-white/[0.02] p-4 text-sm">
          <p className="text-zinc-400">Ele tem <b className="text-white">{equipe}</b> {equipe === 1 ? "agente de IA" : "agentes de IA"}. O que fazer com eles?</p>
          {outros.length > 0 && (
            <label className="flex items-center gap-3">
              <input type="radio" checked={acao === "mover"} onChange={() => setAcao("mover")} className="accent-[#c4ff3d]" />
              <span className="shrink-0 text-zinc-300">Mover para</span>
              <Select value={destino} onChange={(e) => { setDestino(e.target.value); setAcao("mover"); }}>
                {outros.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </label>
          )}
          <label className="flex items-center gap-3">
            <input type="radio" checked={acao === "excluir"} onChange={() => setAcao("excluir")} className="accent-red-400" />
            <span className="text-red-300">Excluir junto com o setor</span>
          </label>
        </div>
      )}
    </Modal>
  );
}
