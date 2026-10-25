import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../../store/useStore";
import { groupBySector } from "../../store/selectors";
import { computeLayout } from "./brainLayout";
import { BrainScene } from "./brainScene";
import { BrainTooltip, type TooltipInfo } from "./BrainTooltip";

export function BrainCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<BrainScene | null>(null);
  const [tooltip, setTooltip] = useState<TooltipInfo | null>(null);

  const sectors = useStore((s) => s.sectors);
  const agents = useStore((s) => s.agents);
  const companyName = useStore((s) => s.companyName);
  const selectedSectorId = useStore((s) => s.selectedSectorId);
  const hoveredSectorId = useStore((s) => s.hoveredSectorId);
  const selectedAgentId = useStore((s) => s.selectedAgentId);
  const working = useStore((s) => s.workingAgents);
  const focus = useStore((s) => s.focus);

  const layout = useMemo(() => computeLayout(sectors, groupBySector(agents)), [sectors, agents]);

  // Cria a cena, acompanha o tamanho e roda o laço de animação.
  useEffect(() => {
    const canvas = canvasRef.current!;
    const scene = new BrainScene(canvas);
    sceneRef.current = scene;
    const observador = new ResizeObserver(([entrada]) => {
      const { width, height } = entrada!.contentRect;
      scene.resize(width, height);
    });
    observador.observe(canvas);
    let quadro = 0;
    const laco = (t: number) => { scene.render(t / 1000); quadro = requestAnimationFrame(laco); };
    quadro = requestAnimationFrame(laco);
    return () => { cancelAnimationFrame(quadro); observador.disconnect(); };
  }, []);

  useEffect(() => { sceneRef.current?.setLayout(layout); }, [layout]);
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    scene.companyName = companyName;
    scene.selectedSectorId = selectedSectorId;
    scene.hoveredSectorId = hoveredSectorId;
    scene.selectedAgentId = selectedAgentId;
    scene.working = working;
  }, [companyName, selectedSectorId, hoveredSectorId, selectedAgentId, working]);
  useEffect(() => { if (focus) sceneRef.current?.focus(focus.nodeId); }, [focus]);

  // --- Ponteiro: arrastar = mover, roda/pinça = zoom, clique = selecionar ---
  useEffect(() => {
    const canvas = canvasRef.current!;
    const scene = sceneRef.current!;
    let arrastando = false, moveu = false, ultimo = { x: 0, y: 0 };

    const ponto = (e: PointerEvent | WheelEvent) => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    const aoDescer = (e: PointerEvent) => {
      arrastando = true; moveu = false; ultimo = { x: e.clientX, y: e.clientY };
      canvas.setPointerCapture(e.pointerId);
    };
    const aoMover = (e: PointerEvent) => {
      if (arrastando) {
        const dx = e.clientX - ultimo.x, dy = e.clientY - ultimo.y;
        if (Math.abs(dx) + Math.abs(dy) > 2) moveu = true;
        if (moveu) { scene.pan(dx, dy); setTooltip(null); }
        ultimo = { x: e.clientX, y: e.clientY };
        return;
      }
      const p = ponto(e);
      const no = scene.hitTest(p.x, p.y);
      scene.hoveredNodeId = no?.kind === "agent" ? no.id : null;
      useStore.getState().hoverSector(no?.kind === "sector" ? no.id : null);
      canvas.style.cursor = no ? "pointer" : "grab";
      setTooltip(no?.kind === "agent"
        ? { x: p.x, y: p.y, title: no.agent.name, subtitle: no.agent.role, inactive: no.agent.status === "inativo" }
        : no?.kind === "sector"
          ? { x: p.x, y: p.y, title: no.sector.manager.name, subtitle: `Gerente de ${no.sector.name} · clique para conversar` }
          : null);
    };
    const aoSubir = (e: PointerEvent) => {
      arrastando = false;
      canvas.releasePointerCapture(e.pointerId);
      if (moveu) return;
      const p = ponto(e);
      const no = scene.hitTest(p.x, p.y);
      const loja = useStore.getState();
      if (no?.kind === "agent") loja.openAgent(no.id);
      else if (no?.kind === "sector") loja.selectSector(no.id);
      else loja.selectSector(null);
    };
    const aoSair = () => {
      scene.hoveredNodeId = null;
      useStore.getState().hoverSector(null);
      setTooltip(null);
    };
    const aoRolar = (e: WheelEvent) => {
      e.preventDefault();
      const p = ponto(e);
      // Pinça no trackpad chega como wheel + ctrlKey; dá mais sensibilidade a ela.
      const intensidade = e.ctrlKey ? 0.01 : 0.0015;
      scene.zoomAt(p.x, p.y, Math.exp(-e.deltaY * intensidade));
    };
    const aoDuploClique = () => scene.fit();

    canvas.addEventListener("pointerdown", aoDescer);
    canvas.addEventListener("pointermove", aoMover);
    canvas.addEventListener("pointerup", aoSubir);
    canvas.addEventListener("pointerleave", aoSair);
    canvas.addEventListener("wheel", aoRolar, { passive: false });
    canvas.addEventListener("dblclick", aoDuploClique);
    return () => {
      canvas.removeEventListener("pointerdown", aoDescer);
      canvas.removeEventListener("pointermove", aoMover);
      canvas.removeEventListener("pointerup", aoSubir);
      canvas.removeEventListener("pointerleave", aoSair);
      canvas.removeEventListener("wheel", aoRolar);
      canvas.removeEventListener("dblclick", aoDuploClique);
    };
  }, []);

  return (
    <div className="relative h-full w-full">
      <canvas ref={canvasRef} className="block h-full w-full cursor-grab touch-none" />
      {tooltip && <BrainTooltip info={tooltip} />}
      <button
        onClick={() => sceneRef.current?.fit()}
        className="absolute bottom-4 right-4 rounded-lg border border-neon/20 bg-black/50 px-3 py-1.5 text-xs text-neon/80 backdrop-blur hover:border-neon/60 hover:text-neon"
        title="Enquadrar tudo (duplo clique no fundo também)"
      >
        Enquadrar
      </button>
    </div>
  );
}
