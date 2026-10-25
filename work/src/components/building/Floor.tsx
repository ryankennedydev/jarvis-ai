import { Billboard } from "@react-three/drei";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { useRef, type RefObject } from "react";
import { Color, Vector3, type Group, type MeshBasicMaterial, type MeshPhysicalMaterial } from "three";
import { sectorColor } from "../../lib/util";
import type { Sector } from "../../types";
import { ALTURA_ANDAR, LAJE, LARGURA, PROFUNDIDADE } from "./dimensions";
import { FloorInterior, type AgentFigure } from "./FloorInterior";
import { labelTexture } from "./labelTexture";

interface Props {
  sector: Sector;
  y: number;
  agentes: AgentFigure[];
  gerenteOcupado: boolean;
  hovered: boolean;
  selected: boolean;
  dimmed: boolean;
  onHover(id: string | null): void;
  onSelect(id: string): void;
}

const ALTURA_VIDRO = ALTURA_ANDAR - LAJE;
const BRANCO = new Color("#ffffff");

export function Floor({ sector, y, agentes, gerenteOcupado, hovered, selected, dimmed, onHover, onSelect }: Props) {
  const cor = sectorColor(sector.color);
  const vidro = useRef<MeshPhysicalMaterial>(null);
  const brilho = useRef<MeshBasicMaterial>(null);
  const faixa = useRef<MeshBasicMaterial>(null);
  const corBase = useRef(new Color(cor));
  corBase.current.set(cor);

  // Transições suaves de hover/seleção/escurecimento.
  useFrame((_, dt) => {
    const k = Math.min(1, dt * 8);
    const destaque = selected || hovered;
    if (vidro.current) vidro.current.opacity += ((dimmed ? 0.85 : 0.28) - vidro.current.opacity) * k;
    if (brilho.current) brilho.current.opacity += ((destaque ? 0.22 : 0) - brilho.current.opacity) * k;
    if (faixa.current) {
      faixa.current.color.lerp(destaque ? BRANCO : corBase.current, k);
      faixa.current.opacity += ((dimmed ? 0.2 : 1) - faixa.current.opacity) * k;
    }
  });

  const parar = (e: ThreeEvent<PointerEvent | MouseEvent>) => e.stopPropagation();

  return (
    <group position={[0, y, 0]}>
      {/* laje */}
      <mesh position={[0, LAJE / 2, 0]}>
        <boxGeometry args={[LARGURA + 0.1, LAJE, PROFUNDIDADE + 0.1]} />
        <meshStandardMaterial color="#0e1010" roughness={0.85} metalness={0.3} />
      </mesh>
      <FaixaNeon refMaterial={faixa} cor={cor} />

      <FloorInterior agentes={agentes} gerenteOcupado={gerenteOcupado} cor={cor} />

      {/* fachada de vidro: recebe hover e clique */}
      <mesh
        position={[0, LAJE + ALTURA_VIDRO / 2, 0]}
        onPointerOver={(e) => { parar(e); onHover(sector.id); }}
        onPointerOut={(e) => { parar(e); onHover(null); }}
        onClick={(e) => { parar(e); onSelect(sector.id); }}
      >
        <boxGeometry args={[LARGURA, ALTURA_VIDRO, PROFUNDIDADE]} />
        <meshPhysicalMaterial ref={vidro} color="#050807" transparent opacity={0.28} roughness={0.08}
                              metalness={0.5} clearcoat={1} depthWrite={false} />
      </mesh>
      {/* véu colorido no hover/seleção */}
      <mesh position={[0, LAJE + ALTURA_VIDRO / 2, 0]} raycast={() => null}>
        <boxGeometry args={[LARGURA + 0.015, ALTURA_VIDRO, PROFUNDIDADE + 0.015]} />
        <meshBasicMaterial ref={brilho} color={cor} transparent opacity={0} depthWrite={false} toneMapped={false} />
      </mesh>

      <Montantes />
      <FloorLabel texto={sector.name} cor={cor} dimmed={dimmed} />
    </group>
  );
}

/** Faixa de neon contornando a borda da laje (a frontal reage ao hover/seleção). */
function FaixaNeon({ refMaterial, cor }: { refMaterial: RefObject<MeshBasicMaterial | null>; cor: string }) {
  const e = 0.014, x = LARGURA / 2 + 0.05, z = PROFUNDIDADE / 2 + 0.05;
  const lados: Array<[number, number, number, number]> = [
    [0, z, LARGURA + 0.1, e], [0, -z, LARGURA + 0.1, e], [x, 0, e, PROFUNDIDADE + 0.1], [-x, 0, e, PROFUNDIDADE + 0.1],
  ];
  return (
    <group position={[0, LAJE, 0]} raycast={() => null}>
      {lados.map(([px, pz, w, d], i) => (
        <mesh key={i} position={[px, 0, pz]}>
          <boxGeometry args={[w, e, d]} />
          {i === 0 ? (
            <meshBasicMaterial ref={refMaterial} color={cor} transparent toneMapped={false} />
          ) : (
            <meshBasicMaterial color={cor} transparent opacity={0.55} toneMapped={false} />
          )}
        </mesh>
      ))}
    </group>
  );
}

/** Montantes verticais da fachada nas quatro faces. */
function Montantes() {
  const itens: Array<[number, number, boolean]> = [];
  for (let i = 1; i < 6; i++) {
    const x = (i / 6 - 0.5) * LARGURA;
    itens.push([x, PROFUNDIDADE / 2 + 0.006, true], [x, -PROFUNDIDADE / 2 - 0.006, true]);
  }
  for (let i = 1; i < 4; i++) {
    const z = (i / 4 - 0.5) * PROFUNDIDADE;
    itens.push([LARGURA / 2 + 0.006, z, false], [-LARGURA / 2 - 0.006, z, false]);
  }
  return (
    <group raycast={() => null}>
      {itens.map(([x, z, frontal], i) => (
        <mesh key={i} position={[x, LAJE + ALTURA_VIDRO / 2, z]}>
          <boxGeometry args={frontal ? [0.02, ALTURA_VIDRO, 0.015] : [0.015, ALTURA_VIDRO, 0.02]} />
          <meshStandardMaterial color="#1a1d1f" metalness={0.8} roughness={0.35} />
        </mesh>
      ))}
    </group>
  );
}

const ALTURA_ROTULO = 0.2;
const direita = new Vector3();
const paraCamera = new Vector3();

/** Nome do setor na fachada voltada para a câmera, sempre legível enquanto o prédio gira. */
function FloorLabel({ texto, cor, dimmed }: { texto: string; cor: string; dimmed: boolean }) {
  const grupo = useRef<Group>(null);
  const material = useRef<MeshBasicMaterial>(null);
  const { texture, aspect } = labelTexture(texto, cor);
  const largura = ALTURA_ROTULO * aspect;

  useFrame(({ camera }, dt) => {
    if (!grupo.current) return;
    direita.setFromMatrixColumn(camera.matrixWorld, 0).setY(0).normalize();
    paraCamera.set(camera.position.x, 0, camera.position.z).normalize();
    const meio = Math.max(LARGURA, PROFUNDIDADE) / 2;
    grupo.current.position
      .copy(paraCamera).multiplyScalar(Math.min(LARGURA, PROFUNDIDADE) / 2 + 0.06)
      .addScaledVector(direita, meio - largura / 2 - 0.15)
      .setY(ALTURA_ANDAR * 0.78);
    if (material.current) {
      material.current.opacity += ((dimmed ? 0.25 : 0.95) - material.current.opacity) * Math.min(1, dt * 8);
    }
  });

  return (
    <group ref={grupo}>
      <Billboard>
        <mesh raycast={() => null} renderOrder={10}>
          <planeGeometry args={[largura, ALTURA_ROTULO]} />
          <meshBasicMaterial ref={material} map={texture} transparent opacity={0.95}
                             depthTest={false} depthWrite={false} toneMapped={false} />
        </mesh>
      </Billboard>
    </group>
  );
}
