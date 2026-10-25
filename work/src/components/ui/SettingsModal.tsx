import { useState } from "react";
import { useStore } from "../../store/useStore";
import { Field, TextInput } from "./Field";
import { Button, Modal } from "./Modal";

export function SettingsModal() {
  const companyName = useStore((s) => s.companyName);
  const { renameCompany, resetToEmpty, resetToSample, closeModal } = useStore.getState();
  const [nome, setNome] = useState(companyName);
  const [confirmando, setConfirmando] = useState<"vazio" | "exemplo" | null>(null);

  const executar = () => {
    if (confirmando === "vazio") resetToEmpty();
    if (confirmando === "exemplo") resetToSample();
    closeModal();
  };

  return (
    <Modal title="Configurações" onClose={closeModal}
           footer={<><Button onClick={closeModal}>Fechar</Button>
             <Button variant="primary" onClick={() => { renameCompany(nome); closeModal(); }}>Salvar</Button></>}>
      <Field label="Nome da empresa">
        <TextInput value={nome} onChange={(e) => setNome(e.target.value)} maxLength={60} />
      </Field>

      <div className="mt-5 rounded-xl border border-red-500/20 bg-red-500/[0.03] p-4">
        <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-red-300">Zona de perigo</h3>
        {confirmando ? (
          <div className="mt-3 text-sm">
            <p className="text-zinc-300">
              {confirmando === "vazio"
                ? "Isso apaga todos os setores e funcionários. Não dá para desfazer."
                : "Isso substitui seus dados pela empresa de exemplo. Não dá para desfazer."}
            </p>
            <div className="mt-3 flex gap-2">
              <Button onClick={() => setConfirmando(null)}>Voltar</Button>
              <Button variant="danger" onClick={executar}>Sim, continuar</Button>
            </div>
          </div>
        ) : (
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="danger" onClick={() => setConfirmando("vazio")}>Limpar e começar do zero</Button>
            <Button onClick={() => setConfirmando("exemplo")}>Restaurar empresa de exemplo</Button>
          </div>
        )}
      </div>
    </Modal>
  );
}
