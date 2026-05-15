import { Canvas, useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { Mesh } from "three";

function OrbSphere() {
  const coreRef = useRef<Mesh>(null);
  const meshRef = useRef<Mesh>(null);
  const ringRef = useRef<Mesh>(null);

  useFrame(({ clock }) => {
    const elapsed = clock.getElapsedTime();
    if (coreRef.current) {
      const pulse = 1 + Math.sin(elapsed * 2.1) * 0.035;
      coreRef.current.scale.setScalar(pulse);
      coreRef.current.rotation.y = elapsed * 0.16;
    }
    if (meshRef.current) {
      meshRef.current.rotation.y = elapsed * 0.32;
      meshRef.current.rotation.x = elapsed * 0.08;
    }
    if (ringRef.current) {
      ringRef.current.rotation.z = elapsed * 0.55;
      ringRef.current.rotation.x = Math.PI / 2.8;
    }
  });

  return (
    <group>
      <mesh ref={coreRef}>
        <sphereGeometry args={[1.08, 64, 64]} />
        <meshStandardMaterial color="#00e5ff" emissive="#006b7a" emissiveIntensity={1.15} roughness={0.22} metalness={0.38} />
      </mesh>
      <mesh ref={meshRef}>
        <icosahedronGeometry args={[1.16, 2]} />
        <meshBasicMaterial color="#bff8ff" wireframe transparent opacity={0.24} />
      </mesh>
      <mesh ref={ringRef}>
        <torusGeometry args={[1.42, 0.018, 12, 140]} />
        <meshBasicMaterial color="#00e5ff" transparent opacity={0.82} />
      </mesh>
      <pointLight position={[1.5, 1.8, 2]} color="#ffffff" intensity={3.2} />
      <pointLight position={[-2, -1.2, 1.3]} color="#00e5ff" intensity={2.1} />
    </group>
  );
}

export function Orb({ onClick }: { onClick: () => void }) {
  return (
    <button className="orb-button" type="button" aria-label="Open Jarvis controls" onClick={onClick}>
      <span className="orb-aura" />
      <Canvas className="orb-canvas" camera={{ position: [0, 0, 4.4], fov: 42 }} gl={{ alpha: true, antialias: true }}>
        <ambientLight intensity={0.55} />
        <OrbSphere />
      </Canvas>
    </button>
  );
}
