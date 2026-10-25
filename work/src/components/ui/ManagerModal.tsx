import { useMemo, useState, type FormEvent } from "react";
import { useStore } from "../../store/useStore";
import { Avatar } from "./Avatar";
import { Field, TextArea, TextInput } from "./Field";
import { Button, Modal } from "./Modal";

/** Configura o gerente de IA de um setor: nome e o que ele faz. */
export function ManagerModal({ sectorId }: { sectorId: string }) {
  const setor = useStore((s) => s.sectors.find((x) => x.id === sectorId));
  const agents = useStore((s) => s.agents);
  const equipe = useMemo(() => agents.filter((a) => a.sectorId === sectorId), [agents, sectorId]);
  const { updateManager, closeModal, openModal } = useStore.getState();
  const [name, setName] = useState(setor?.manager.name ?? "");
  const [instructions, setInstructions] = useState(setor?.manager.instructions ?? "");

  if (!setor) return null;
  const salvar = (e: FormEvent) => {
    e.preventDefault();
    updateManager(setor.id, { name, instructions });
    closeModal();
  };

  return (
    <Modal title={`Gerente de ${setor.name}`} onClose={closeModal} width="max-w-xl"
           footer={<>
             <Button onClick={closeModal}>Cancelar</Button>
             <Button variant="primary" type="submit" form="form-gerente" disabled={!name.trim()}>Salvar</Button>
           </>}>
      <form id="form-gerente" onSubmit={salvar}>
        <div className="mb-4 flex items-center gap-3">
          <Avatar name={name} variant="manager" size="h-12 w-12 text-sm" />
          <p className="text-xs leading-relaxed text-zinc-500">
            O gerente conversa com você e decide o que cada agente do setor vai fazer.
          </p>
        </div>
        <Field label="Nome do gerente">
          <TextInput autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
        </Field>
        <Field label="O que o gerente faz"
               hint="Objetivos do setor, regras, prioridades e como ele deve dividir o trabalho entre os agentes.">
          <TextArea rows={7} value={instructions} onChange={(e) => setInstructions(e.target.value)} maxLength={6000} />
        </Field>
      </form>

      <div className="mt-2">
        <div className="mb-2 flex items-center">
          <span className="flex-1 text-[11px] font-medium uppercase tracking-[0.15em] text-zinc-500">Equipe ({equipe.length})</span>
          <button className="text-xs text-neon/80 hover:text-neon" onClick={() => openModal({ kind: "agent", presetSectorId: setor.id })}>
            + Agente
          </button>
        </div>
        <ul className="space-y-1.5">
          {equipe.map((a) => (
            <li key={a.id} className="flex items-center gap-3 rounded-lg border border-white/5 px-3 py-2">
              <Avatar name={a.name} size="h-7 w-7 text-[9px]" inactive={a.status === "inativo"} />
              <span className="text-sm text-white">{a.name}</span>
              <span className="flex-1 truncate text-xs text-zinc-500">{a.role}</span>
              {a.status === "inativo" && <span className="text-[10px] uppercase text-zinc-600">inativo</span>}
            </li>
          ))}
          {!equipe.length && <li className="text-sm text-zinc-500">Nenhum agente ainda. Sem equipe, o gerente responde sozinho.</li>}
        </ul>
      </div>
    </Modal>
  );
}
