import { useFrame } from "@react-three/fiber";
import { memo, useRef } from "react";
import { BackSide, type MeshStandardMaterial } from "three";
import { NEON } from "../../lib/util";
import { ALTURA_ANDAR, LAJE, LARGURA, MAX_AGENTES, PROFUNDIDADE } from "./dimensions";

export interface AgentFigure {
  id: string;
  ativo: boolean;
  trabalhando: boolean;
}

interface Props {
  agentes: AgentFigure[];
  gerenteOcupado: boolean;
  cor: string;
}

/** Interior do andar: gerente na mesa central e agentes holográficos nas estações. */
export const FloorInterior = memo(function FloorInterior({ agentes, gerenteOcupado, cor }: Props) {
  const visiveis = agentes.slice(0, MAX_AGENTES);
  const colunas = 3;
  const posicoes = visiveis.map((_, i) => ({
    x: ((i % colunas) - (colunas - 1) / 2) * (LARGURA / 3.3),
    z: Math.floor(i / colunas) === 0 ? 0.15 : 0.72,
  }));

  return (
    <group raycast={() => null} position={[0, LAJE, 0]}>
      {/* piso e paredes internas com luz quente (vistas pelo vidro = janelas acesas) */}
      <mesh position={[0, 0.003, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[LARGURA * 0.96, PROFUNDIDADE * 0.94]} />
        <meshBasicMaterial color="#3a2c16" toneMapped={false} />
      </mesh>
      <mesh position={[0, (ALTURA_ANDAR - LAJE) / 2, 0]}>
        <boxGeometry args={[LARGURA - 0.04, ALTURA_ANDAR - LAJE - 0.02, PROFUNDIDADE - 0.04]} />
        <meshBasicMaterial color="#e9a95c" side={BackSide} transparent opacity={0.42} toneMapped={false} />
      </mesh>

      <Estacao x={0} z={-0.62} cor={cor} gerente ativo trabalhando={gerenteOcupado} />
      {visiveis.map((a, i) => (
        <Estacao key={a.id} x={posicoes[i]!.x} z={posicoes[i]!.z} cor={cor} ativo={a.ativo} trabalhando={a.trabalhando} />
      ))}
    </group>
  );
});

interface EstacaoProps {
  x: number;
  z: number;
  cor: string;
  ativo: boolean;
  trabalhando: boolean;
  gerente?: boolean;
}

/** Mesa com tela holográfica e uma figura de IA (o gerente é maior e tem anel no chão). */
function Estacao({ x, z, cor, ativo, trabalhando, gerente }: EstacaoProps) {
  const corpo = useRef<MeshStandardMaterial>(null);
  const escala = gerente ? 1.25 : 1;
  const corFigura = !ativo ? "#3a3f3a" : trabalhando ? "#ffffff" : cor;

  // Figuras "respiram"; quem está trabalhando pulsa forte.
  useFrame(({ clock }) => {
    if (!corpo.current) return;
    const base = !ativo ? 0 : trabalhando ? 2.2 : 0.55;
    const onda = trabalhando ? Math.sin(clock.elapsedTime * 6 + x * 3) * 0.8 : Math.sin(clock.elapsedTime * 1.5 + x) * 0.12;
    corpo.current.emissiveIntensity = Math.max(0, base + onda);
  });

  return (
    <group position={[x, 0, z]} scale={escala}>
      {/* mesa */}
      <mesh position={[0, 0.27, -0.17]}>
        <boxGeometry args={[gerente ? 0.9 : 0.58, 0.03, 0.3]} />
        <meshStandardMaterial color="#14171a" roughness={0.4} metalness={0.6} />
      </mesh>
      <mesh position={[0, 0.13, -0.17]}>
        <boxGeometry args={[0.05, 0.26, 0.05]} />
        <meshStandardMaterial color="#0d0f10" />
      </mesh>
      {/* tela holográfica */}
      <mesh position={[0, 0.42, -0.3]}>
        <planeGeometry args={[gerente ? 0.6 : 0.3, 0.18]} />
        <meshBasicMaterial color={trabalhando ? "#ffffff" : NEON} transparent opacity={ativo ? (trabalhando ? 0.9 : 0.45) : 0.08}
                           toneMapped={false} />
      </mesh>
      {/* figura de IA: corpo + cabeça luminosa */}
      <mesh position={[0, 0.2, 0.06]}>
        <capsuleGeometry args={[0.065, 0.16, 4, 10]} />
        <meshStandardMaterial ref={corpo} color="#0b0f0b" emissive={corFigura} emissiveIntensity={0.55}
                              roughness={0.3} metalness={0.2} transparent opacity={0.92} />
      </mesh>
      <mesh position={[0, 0.4, 0.06]}>
        <sphereGeometry args={[0.06, 14, 10]} />
        <meshBasicMaterial color={corFigura} toneMapped={false} />
      </mesh>
      {gerente && (
        <mesh position={[0, 0.006, 0.06]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.16, 0.19, 32]} />
          <meshBasicMaterial color={trabalhando ? "#ffffff" : NEON} toneMapped={false} />
        </mesh>
      )}
    </group>
  );
}
