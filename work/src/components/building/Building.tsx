import { OrbitControls } from "@react-three/drei";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import { Canvas, useThree } from "@react-three/fiber";
import { Component, useEffect, useMemo, useState, type ReactNode } from "react";
import { Vector3, type PerspectiveCamera } from "three";
import { useStore } from "../../store/useStore";
import { groupBySector } from "../../store/selectors";
import { Ground, Lobby, Pillars, Roof } from "./BuildingParts";
import { ALTURA_ANDAR, ALTURA_BASE, LARGURA, PROFUNDIDADE } from "./dimensions";
import { Floor } from "./Floor";

function BuildingModel() {
  const sectors = useStore((s) => s.sectors);
  const agents = useStore((s) => s.agents);
  const working = useStore((s) => s.workingAgents);
  const chats = useStore((s) => s.chats);
  const hovered = useStore((s) => s.hoveredSectorId);
  const selected = useStore((s) => s.selectedSectorId);
  const hoverSector = useStore((s) => s.hoverSector);
  const selectSector = useStore((s) => s.selectSector);

  const ordenados = useMemo(() => [...sectors].sort((a, b) => a.order - b.order), [sectors]);
  // Figuras de cada andar: só mudam quando agentes ou quem está trabalhando muda.
  const figuras = useMemo(() => {
    const porSetor = groupBySector(agents);
    return new Map(ordenados.map((s) => [s.id, (porSetor.get(s.id) ?? []).map((a) => ({
      id: a.id, ativo: a.status === "ativo", trabalhando: !!working[a.id],
    }))]));
  }, [agents, ordenados, working]);
  const alturaAndares = ordenados.length * ALTURA_ANDAR;

  return (
    <group onPointerMissed={() => selectSector(null)}>
      <Ground />
      <Lobby />
      {ordenados.length > 0 && <Pillars altura={alturaAndares} />}
      {ordenados.map((s, i) => (
        <Floor
          key={s.id}
          sector={s}
          y={ALTURA_BASE + i * ALTURA_ANDAR}
          agentes={figuras.get(s.id) ?? []}
          gerenteOcupado={!!chats[s.id]?.busy}
          hovered={hovered === s.id}
          selected={selected === s.id}
          dimmed={selected !== null && selected !== s.id}
          onHover={hoverSector}
          onSelect={selectSector}
        />
      ))}
      <Roof y={ALTURA_BASE + alturaAndares} />
    </group>
  );
}

const DIRECAO = new Vector3(0.62, 0.3, 0.78).normalize();

/** Enquadra o prédio inteiro conforme o tamanho do painel e o número de andares. */
function CameraRig({ altura }: { altura: number }) {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const { width, height } = useThree((s) => s.size);
  const selecionado = useStore((s) => s.selectedSectorId);

  const meiaTangente = Math.tan((camera.fov * Math.PI) / 360);
  const aspecto = Math.max(0.2, width / Math.max(1, height));
  const raioPlanta = Math.max(Math.hypot(LARGURA + 0.7, PROFUNDIDADE + 0.7) / 2, 3.1);
  const distancia = Math.max((altura / 2 + 0.5) / meiaTangente, (raioPlanta + 0.4) / (meiaTangente * aspecto)) * 1.1;
  const alvo = altura / 2;

  useEffect(() => {
    camera.position.copy(DIRECAO).multiplyScalar(distancia).add(new Vector3(0, alvo, 0));
    camera.lookAt(0, alvo, 0);
  }, [camera, distancia, alvo]);

  return (
    <OrbitControls
      makeDefault
      target={[0, alvo, 0]}
      enablePan={false}
      minPolarAngle={0.35}
      maxPolarAngle={Math.PI / 2 - 0.06}
      minDistance={distancia * 0.45}
      maxDistance={distancia * 1.3}
      autoRotate={!selecionado}
      autoRotateSpeed={0.35}
      enableDamping
    />
  );
}

function Scene() {
  const andares = useStore((s) => s.sectors.length);
  const altura = ALTURA_BASE + andares * ALTURA_ANDAR + 1.5;

  return (
    <Canvas camera={{ fov: 32, position: [8, 6, 10] }} dpr={[1, 2]} gl={{ antialias: true, alpha: true }}>
      <ambientLight intensity={0.15} />
      <hemisphereLight args={["#cfe9c0", "#020302", 0.3]} />
      <directionalLight position={[6, 12, 8]} intensity={0.9} />
      <directionalLight position={[-6, 4, -5]} intensity={0.25} color="#c4ff3d" />
      <BuildingModel />
      <CameraRig altura={altura} />
      {/* Bloom: só o que é bem claro (neon, luzes) brilha */}
      <EffectComposer multisampling={4}>
        <Bloom mipmapBlur luminanceThreshold={0.62} luminanceSmoothing={0.2} intensity={0.85} radius={0.7} />
      </EffectComposer>
    </Canvas>
  );
}

const temWebGL = () => {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
};

class FalhaWebGL extends Component<{ children: ReactNode }, { erro: boolean }> {
  state = { erro: false };
  static getDerivedStateFromError() { return { erro: true }; }
  render() {
    return this.state.erro ? <SemWebGL /> : this.props.children;
  }
}

function SemWebGL() {
  return (
    <div className="grid h-full place-items-center p-6 text-center text-sm text-zinc-500">
      O prédio 3D precisa de WebGL, que não está disponível neste ambiente.
    </div>
  );
}

/** Tooltip do andar sob o cursor (HTML comum, fora do canvas). */
function FloorTooltip({ x, y }: { x: number; y: number }) {
  const setor = useStore((s) => s.sectors.find((x) => x.id === s.hoveredSectorId));
  const agentes = useStore((s) => s.agents.filter((a) => a.sectorId === s.hoveredSectorId).length);
  if (!setor) return null;
  return (
    <div className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-[calc(100%+16px)] whitespace-nowrap rounded-lg border border-neon/40 bg-black/85 px-3 py-1.5 text-center shadow-[0_0_20px_rgba(196,255,61,0.2)]"
         style={{ left: x, top: y }}>
      <div className="text-xs font-semibold text-white">{setor.name}</div>
      <div className="text-[10px] text-neon/80">
        Gerente {setor.manager.name} · {agentes} {agentes === 1 ? "agente" : "agentes"} · {setor.order + 1}º andar
      </div>
      <div className="mt-0.5 text-[10px] text-zinc-500">clique para conversar</div>
    </div>
  );
}

export function Building() {
  const suportado = useMemo(temWebGL, []);
  const [cursor, setCursor] = useState({ x: 0, y: 0 });
  if (!suportado) return <SemWebGL />;
  return (
    <div className="relative h-full w-full"
         onPointerMove={(e) => {
           const r = e.currentTarget.getBoundingClientRect();
           setCursor({ x: e.clientX - r.left, y: e.clientY - r.top });
         }}>
      <FalhaWebGL>
        <Scene />
      </FalhaWebGL>
      <FloorTooltip x={cursor.x} y={cursor.y} />
    </div>
  );
}
