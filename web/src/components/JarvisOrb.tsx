import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

type OrbState =
  | "idle"
  | "listening"
  | "thinking"
  | "speaking"
  | "executing"
  | "error"
  | "offline";

interface JarvisOrbProps {
  state: OrbState;
}

const STATE_COLOR: Record<OrbState, string> = {
  idle: "#00d4ff",
  listening: "#00ff88",
  thinking: "#8bd8ff",
  speaking: "#ff6600",
  executing: "#ffffff",
  error: "#ff3333",
  offline: "#6b7280",
};

function OrbMesh({ state }: JarvisOrbProps) {
  const groupRef = useRef<THREE.Group>(null);
  const coreRef = useRef<THREE.Mesh>(null);
  const particlesRef = useRef<THREE.Points>(null);
  const color = STATE_COLOR[state];

  const particleGeometry = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(260 * 3);

    for (let index = 0; index < 260; index += 1) {
      const radius = 1.45 + Math.random() * 0.75;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[index * 3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[index * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      positions[index * 3 + 2] = radius * Math.cos(phi);
    }

    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return geometry;
  }, []);

  useFrame(({ clock }) => {
    const elapsed = clock.getElapsedTime();
    const speed = state === "thinking" || state === "executing" ? 0.9 : 0.25;
    const pulse = 1 + Math.sin(elapsed * (state === "speaking" ? 8 : 2.2)) * 0.035;

    if (groupRef.current) {
      groupRef.current.rotation.y += 0.005 + speed * 0.003;
      groupRef.current.rotation.x = Math.sin(elapsed * 0.35) * 0.06;
    }

    if (coreRef.current) {
      coreRef.current.scale.setScalar(state === "offline" ? 0.92 : pulse);
    }

    if (particlesRef.current) {
      particlesRef.current.rotation.y -= 0.003 + speed * 0.004;
      particlesRef.current.rotation.z = elapsed * 0.025;
    }
  });

  return (
    <group ref={groupRef}>
      <mesh ref={coreRef}>
        <sphereGeometry args={[1, 96, 96]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={state === "offline" ? 0.18 : 0.85}
          metalness={0.62}
          roughness={0.22}
          transparent
          opacity={state === "offline" ? 0.42 : 0.76}
        />
      </mesh>
      <mesh scale={1.09}>
        <sphereGeometry args={[1, 48, 48]} />
        <meshBasicMaterial color={color} transparent opacity={0.1} wireframe />
      </mesh>
      <points ref={particlesRef} geometry={particleGeometry}>
        <pointsMaterial color={color} size={0.018} transparent opacity={0.82} />
      </points>
    </group>
  );
}

export function JarvisOrb({ state }: JarvisOrbProps) {
  const color = STATE_COLOR[state];

  return (
    <div
      className="relative aspect-square min-w-0 w-full max-w-full overflow-hidden rounded-md sm:max-w-[420px]"
      style={{
        background:
          "radial-gradient(circle at 50% 48%, rgba(0,212,255,0.18), rgba(10,10,15,0) 62%)",
        boxShadow: `0 0 70px ${color}33`,
      }}
    >
      <Canvas camera={{ position: [0, 0, 4.2], fov: 42 }} dpr={[1, 1.6]}>
        <ambientLight intensity={0.6} />
        <pointLight position={[4, 3, 3]} intensity={2.2} color={color} />
        <pointLight position={[-3, -2, -2]} intensity={0.8} color="#ffffff" />
        <OrbMesh state={state} />
      </Canvas>
      <div className="pointer-events-none absolute inset-0 rounded-md border border-cyan-200/10" />
    </div>
  );
}

export type { OrbState };
