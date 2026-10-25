import { useState, type FormEvent } from "react";
import { NEON } from "../../lib/util";
import { useStore } from "../../store/useStore";
import { Field, Select, TextArea, TextInput } from "./Field";
import { Button, Modal } from "./Modal";

export function SectorModal({ editingId }: { editingId?: string }) {
  const sectors = useStore((s) => s.sectors);
  const { addSector, updateSector, closeModal, openModal } = useStore.getState();
  const atual = sectors.find((s) => s.id === editingId);

  const [name, setName] = useState(atual?.name ?? "");
  const [description, setDescription] = useState(atual?.description ?? "");
  const [usarCor, setUsarCor] = useState(!!atual?.color);
  const [color, setColor] = useState(atual?.color || NEON);
  const [order, setOrder] = useState(atual?.order ?? sectors.length);

  const posicoes = atual ? sectors.length : sectors.length + 1;
  const salvar = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const draft = { name, description, color: usarCor ? color : "", order };
    if (atual) updateSector(atual.id, draft);
    else addSector(draft);
    closeModal();
  };

  return (
    <Modal
      title={atual ? "Editar andar" : "Novo andar"}
      onClose={closeModal}
      footer={
        <>
          {atual && (
            <Button variant="danger" className="mr-auto" onClick={() => openModal({ kind: "deleteSector", sectorId: atual.id })}>
              Excluir
            </Button>
          )}
          <Button onClick={closeModal}>Cancelar</Button>
          <Button variant="primary" type="submit" form="form-setor" disabled={!name.trim()}>Salvar</Button>
        </>
      }
    >
      <form id="form-setor" onSubmit={salvar}>
        <Field label="Nome do setor">
          <TextInput autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="Ex.: Finanças" />
        </Field>
        <Field label="Descrição curta" hint="Aparece no cérebro. Dica: as 3 principais funções separadas por ·">
          <TextArea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={80}
                    placeholder="Orçamento · Contas · Auditoria" />
        </Field>
        <Field label="Posição no prédio">
          <Select value={order} onChange={(e) => setOrder(Number(e.target.value))}>
            {Array.from({ length: posicoes }, (_, i) => (
              <option key={i} value={i}>{i + 1}º andar{i === 0 ? " (térreo)" : i === posicoes - 1 ? " (topo)" : ""}</option>
            ))}
          </Select>
        </Field>
        <Field label="Cor de destaque (opcional)">
          <div className="flex items-center gap-3">
            <input type="checkbox" checked={usarCor} onChange={(e) => setUsarCor(e.target.checked)} className="h-4 w-4 accent-[#c4ff3d]" />
            <input type="color" value={color} disabled={!usarCor} onChange={(e) => setColor(e.target.value)}
                   className="h-9 w-14 cursor-pointer rounded border border-white/10 bg-transparent disabled:opacity-30" />
            <span className="text-xs text-zinc-500">{usarCor ? color : "Verde neon padrão"}</span>
          </div>
        </Field>
      </form>
    </Modal>
  );
}
