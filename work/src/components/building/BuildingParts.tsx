import { Edges } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import { DoubleSide, type Group, type MeshBasicMaterial } from "three";
import { NEON } from "../../lib/util";
import { brainSignTexture } from "./brainTexture";
import { ALTURA_BASE, LARGURA, PROFUNDIDADE } from "./dimensions";

const PILAR = 0.12;

/** Plataforma no chão: disco escuro, grade fina e anéis de neon. */
export function Ground() {
  return (
    <group raycast={() => null}>
      <mesh position={[0, -0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[3.4, 72]} />
        <meshStandardMaterial color="#060807" roughness={0.35} metalness={0.7} />
      </mesh>
      <gridHelper args={[6.4, 32, NEON, NEON]} position={[0, -0.005, 0]}>
        <meshBasicMaterial attach="material" color={NEON} transparent opacity={0.07} />
      </gridHelper>
      {[[3.0, 3.06, 0.9], [3.3, 3.32, 0.35]].map(([dentro, fora, opacidade]) => (
        <mesh key={dentro} position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[dentro!, fora!, 96]} />
          <meshBasicMaterial color={NEON} transparent opacity={opacidade} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

/** Lobby de entrada: base escura, faixa de neon e portal iluminado. */
export function Lobby() {
  const w = LARGURA + 0.5, d = PROFUNDIDADE + 0.5;
  return (
    <group raycast={() => null}>
      <mesh position={[0, ALTURA_BASE / 2, 0]}>
        <boxGeometry args={[w, ALTURA_BASE, d]} />
        <meshStandardMaterial color="#0a0c0b" roughness={0.6} metalness={0.5} />
      </mesh>
      {/* faixa de neon no topo da base */}
      <mesh position={[0, ALTURA_BASE - 0.02, d / 2 + 0.002]}>
        <boxGeometry args={[w, 0.018, 0.01]} />
        <meshBasicMaterial color={NEON} toneMapped={false} />
      </mesh>
      {/* portal de entrada */}
      <mesh position={[0, 0.2, d / 2 + 0.003]}>
        <planeGeometry args={[0.9, 0.36]} />
        <meshBasicMaterial color="#ffd38a" toneMapped={false} />
      </mesh>
      <mesh position={[0, 0.42, d / 2 + 0.12]}>
        <boxGeometry args={[1.3, 0.03, 0.26]} />
        <meshStandardMaterial color="#121514" metalness={0.8} roughness={0.3} />
      </mesh>
      <mesh position={[0, 0.405, d / 2 + 0.25]}>
        <boxGeometry args={[1.3, 0.008, 0.008]} />
        <meshBasicMaterial color={NEON} toneMapped={false} />
      </mesh>
      {/* degraus */}
      {[0, 1].map((i) => (
        <mesh key={i} position={[0, 0.02 + i * 0.03, d / 2 + 0.2 - i * 0.07]}>
          <boxGeometry args={[1.1, 0.04, 0.14]} />
          <meshStandardMaterial color="#111413" />
        </mesh>
      ))}
    </group>
  );
}

/** Pilares nos quatro cantos, com filete de neon vertical. */
export function Pillars({ altura }: { altura: number }) {
  const x = LARGURA / 2 + 0.06, z = PROFUNDIDADE / 2 + 0.06;
  const cantos: Array<[number, number]> = [[x, z], [-x, z], [x, -z], [-x, -z]];
  return (
    <group raycast={() => null}>
      {cantos.map(([px, pz], i) => (
        <group key={i} position={[px, ALTURA_BASE + altura / 2, pz]}>
          <mesh>
            <boxGeometry args={[PILAR, altura, PILAR]} />
            <meshStandardMaterial color="#121516" metalness={0.85} roughness={0.3} />
          </mesh>
          <mesh position={[Math.sign(px) * (PILAR / 2 + 0.002), 0, Math.sign(pz) * (PILAR / 2 + 0.002)]}>
            <boxGeometry args={[0.012, altura, 0.012]} />
            <meshBasicMaterial color={NEON} transparent opacity={0.85} toneMapped={false} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** Cobertura: mureta, máquinas, antena com luz piscando e o letreiro do cérebro. */
export function Roof({ y }: { y: number }) {
  const letreiro = useRef<Group>(null);
  const luz = useRef<MeshBasicMaterial>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (letreiro.current) letreiro.current.position.y = 0.85 + Math.sin(t * 1.5) * 0.03;
    if (luz.current) luz.current.opacity = Math.sin(t * 3) > 0.6 ? 1 : 0.15;
  });
  const w = LARGURA + 0.24, d = PROFUNDIDADE + 0.24;

  return (
    <group position={[0, y, 0]} raycast={() => null}>
      <mesh position={[0, 0.06, 0]}>
        <boxGeometry args={[w, 0.12, d]} />
        <meshStandardMaterial color="#0d100f" roughness={0.8} metalness={0.4} />
      </mesh>
      {/* mureta */}
      {([[0, d / 2, w, 0.04], [0, -d / 2, w, 0.04], [w / 2, 0, 0.04, d], [-w / 2, 0, 0.04, d]] as const).map(([px, pz, sw, sd], i) => (
        <mesh key={i} position={[px, 0.2, pz]}>
          <boxGeometry args={[sw, 0.16, sd]} />
          <meshStandardMaterial color="#141817" metalness={0.6} roughness={0.4} />
        </mesh>
      ))}
      <mesh position={[0, 0.285, d / 2]}>
        <boxGeometry args={[w, 0.012, 0.045]} />
        <meshBasicMaterial color={NEON} toneMapped={false} />
      </mesh>
      {/* máquinas */}
      {([[-1.05, -0.55], [-0.55, -0.6], [1.0, 0.5]] as const).map(([px, pz], i) => (
        <mesh key={i} position={[px, 0.2, pz]}>
          <boxGeometry args={[0.38, 0.16, 0.32]} />
          <meshStandardMaterial color="#1b1f1e" metalness={0.7} roughness={0.4} />
        </mesh>
      ))}
      {/* antena */}
      <mesh position={[1.1, 0.75, -0.65]}>
        <cylinderGeometry args={[0.012, 0.02, 1.2, 6]} />
        <meshStandardMaterial color="#2a2f2e" metalness={0.9} roughness={0.3} />
      </mesh>
      <mesh position={[1.1, 1.37, -0.65]}>
        <sphereGeometry args={[0.035, 10, 8]} />
        <meshBasicMaterial ref={luz} color="#ff3b3b" transparent toneMapped={false} />
      </mesh>
      {/* letreiro do cérebro */}
      <mesh position={[0, 0.45, 0]}>
        <boxGeometry args={[0.07, 0.5, 0.07]} />
        <meshStandardMaterial color="#1a2017" metalness={0.8} />
      </mesh>
      <group ref={letreiro}>
        <mesh>
          <boxGeometry args={[1.0, 0.66, 0.1]} />
          <meshStandardMaterial color="#030503" metalness={0.6} roughness={0.3} />
          <Edges color={NEON} />
        </mesh>
        {[0.056, -0.056].map((z) => (
          <mesh key={z} position={[0, 0, z]} rotation={[0, z < 0 ? Math.PI : 0, 0]}>
            <planeGeometry args={[0.58, 0.58]} />
            <meshBasicMaterial map={brainSignTexture()} transparent toneMapped={false} side={DoubleSide} />
          </mesh>
        ))}
      </group>
    </group>
  );
}
