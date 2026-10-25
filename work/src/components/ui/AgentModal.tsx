import { useState, type FormEvent } from "react";
import { BOT_FUNCTIONS, functionsOf } from "../../lib/botFunctions";
import { useStore } from "../../store/useStore";
import type { AgentDraft } from "../../types";
import { Avatar } from "./Avatar";
import { Field, Select, TextArea, TextInput } from "./Field";
import { Button, Modal } from "./Modal";

const hoje = () => new Date().toISOString().slice(0, 10);

export function AgentModal({ editingId, presetSectorId }: { editingId?: string; presetSectorId?: string }) {
  const sectors = useStore((s) => s.sectors);
  const atual = useStore((s) => s.agents.find((a) => a.id === editingId));
  const selecionado = useStore((s) => s.selectedSectorId);
  const { addAgent, updateAgent, closeModal } = useStore.getState();

  const [form, setForm] = useState<AgentDraft>(() => atual ?? {
    name: "", role: "", instructions: "", status: "ativo", createdAt: hoje(), functions: functionsOf({}),
    sectorId: presetSectorId ?? selecionado ?? [...sectors].sort((a, b) => a.order - b.order)[0]?.id ?? "",
  });
  const muda = <K extends keyof AgentDraft>(k: K, v: AgentDraft[K]) => setForm((f) => ({ ...f, [k]: v }));
  const gerente = sectors.find((s) => s.id === form.sectorId)?.manager.name;

  const valido = form.name.trim() && form.role.trim() && form.sectorId;
  const salvar = (e: FormEvent) => {
    e.preventDefault();
    if (!valido) return;
    const draft = { ...form, name: form.name.trim(), role: form.role.trim(), instructions: form.instructions.trim() };
    if (atual) updateAgent(atual.id, draft);
    else addAgent(draft);
    closeModal();
  };

  if (!sectors.length) {
    return (
      <Modal title="Novo agente" onClose={closeModal} footer={<Button onClick={closeModal}>Ok</Button>}>
        <p className="text-sm text-zinc-400">Crie pelo menos um andar (setor) antes de adicionar agentes.</p>
      </Modal>
    );
  }

  return (
    <Modal
      title={atual ? "Editar agente de IA" : "Novo agente de IA"}
      onClose={closeModal}
      width="max-w-xl"
      footer={<>
        <Button onClick={closeModal}>Cancelar</Button>
        <Button variant="primary" type="submit" form="form-agente" disabled={!valido}>Salvar</Button>
      </>}
    >
      <form id="form-agente" onSubmit={salvar} className="grid gap-x-4 sm:grid-cols-2">
        <div className="mb-4 flex items-center gap-3 sm:col-span-2">
          <Avatar name={form.name} size="h-12 w-12 text-sm" inactive={form.status === "inativo"} />
          <p className="text-xs leading-relaxed text-zinc-500">
            Este bot recebe tarefas de <b className="text-neon/80">{gerente ?? "o gerente do setor"}</b> e
            executa de verdade, usando as funções que você ligar abaixo.
          </p>
        </div>
        <Field label="Nome">
          <TextInput autoFocus value={form.name} onChange={(e) => muda("name", e.target.value)} maxLength={40} placeholder="Ex.: Ledger" />
        </Field>
        <Field label="Função">
          <TextInput value={form.role} onChange={(e) => muda("role", e.target.value)} maxLength={60} placeholder="Ex.: Conciliação contábil" />
        </Field>
        <Field label="Setor">
          <Select value={form.sectorId} onChange={(e) => muda("sectorId", e.target.value)}>
            {[...sectors].sort((a, b) => b.order - a.order).map((s) => (
              <option key={s.id} value={s.id}>{s.order + 1}º · {s.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Status">
          <Select value={form.status} onChange={(e) => muda("status", e.target.value as AgentDraft["status"])}>
            <option value="ativo">Ativo (recebe tarefas)</option>
            <option value="inativo">Inativo (pausado)</option>
          </Select>
        </Field>
        <div className="mb-3 sm:col-span-2">
          <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.15em] text-zinc-500">Funções que o bot executa</span>
          <div className="grid gap-2 sm:grid-cols-2">
            {BOT_FUNCTIONS.map((f) => {
              const ligada = functionsOf(form).includes(f.id);
              return (
                <button key={f.id} type="button" aria-pressed={ligada}
                        onClick={() => muda("functions", ligada ? functionsOf(form).filter((x) => x !== f.id) : [...functionsOf(form), f.id])}
                        className={`rounded-xl border px-3 py-2 text-left transition
                          ${ligada ? "border-neon/60 bg-neon/10" : "border-white/10 hover:border-white/25"}`}>
                  <span className={`text-sm font-medium ${ligada ? "text-neon" : "text-zinc-300"}`}>{ligada ? "✓ " : ""}{f.nome}</span>
                  <span className="block text-[11px] text-zinc-500">{f.descricao}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="sm:col-span-2">
          <Field label="O que este agente faz" hint="Vira as instruções da IA. Diga o objetivo, como trabalhar e o formato da entrega.">
            <TextArea rows={5} value={form.instructions} onChange={(e) => muda("instructions", e.target.value)} maxLength={4000}
                      placeholder="Ex.: Concilia lançamentos, aponta divergências e sugere ajustes. Responda com uma tabela curta." />
          </Field>
        </div>
      </form>
    </Modal>
  );
}
