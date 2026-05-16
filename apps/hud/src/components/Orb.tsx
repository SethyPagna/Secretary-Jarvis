import { Canvas, useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { CSSProperties } from "react";
import type { Mesh } from "three";
import type { HudState } from "@jarvis/core";

interface OrbVisualTheme {
  core: string;
  emissive: string;
  wire: string;
  ring: string;
  speed: number;
  pulse: number;
}

function OrbSphere({ theme }: { theme: OrbVisualTheme }) {
  const coreRef = useRef<Mesh>(null);
  const meshRef = useRef<Mesh>(null);
  const ringRef = useRef<Mesh>(null);

  useFrame(({ clock }) => {
    const elapsed = clock.getElapsedTime();
    if (coreRef.current) {
      const pulse = 1 + Math.sin(elapsed * theme.speed) * theme.pulse;
      coreRef.current.scale.setScalar(pulse);
      coreRef.current.rotation.y = elapsed * 0.16 * theme.speed;
    }
    if (meshRef.current) {
      meshRef.current.rotation.y = elapsed * 0.32 * theme.speed;
      meshRef.current.rotation.x = elapsed * 0.08 * theme.speed;
    }
    if (ringRef.current) {
      ringRef.current.rotation.z = elapsed * 0.55 * theme.speed;
      ringRef.current.rotation.x = Math.PI / 2.8;
    }
  });

  return (
    <group>
      <mesh ref={coreRef}>
        <sphereGeometry args={[1.08, 64, 64]} />
        <meshStandardMaterial color={theme.core} emissive={theme.emissive} emissiveIntensity={1.15} roughness={0.22} metalness={0.38} />
      </mesh>
      <mesh ref={meshRef}>
        <icosahedronGeometry args={[1.16, 2]} />
        <meshBasicMaterial color={theme.wire} wireframe transparent opacity={0.24} />
      </mesh>
      <mesh ref={ringRef}>
        <torusGeometry args={[1.42, 0.018, 12, 140]} />
        <meshBasicMaterial color={theme.ring} transparent opacity={0.82} />
      </mesh>
      <pointLight position={[1.5, 1.8, 2]} color="#ffffff" intensity={3.2} />
      <pointLight position={[-2, -1.2, 1.3]} color={theme.ring} intensity={2.1} />
    </group>
  );
}

export function Orb({
  visualState,
  online,
  pendingApproval,
  onClick
}: {
  visualState: HudState;
  online: boolean;
  pendingApproval: boolean;
  onClick: () => void;
}) {
  const state = online ? visualState : "error";
  const theme = themeFor(state, pendingApproval);
  return (
    <button
      className={`orb-button orb-visual-${state} ${pendingApproval ? "has-approval" : ""}`}
      type="button"
      aria-label="Open Jarvis controls"
      data-state={state}
      onClick={onClick}
    >
      <span className="orb-aura" />
      <span className="orb-scan-ring" aria-hidden="true" />
      <span className="orb-data-arcs" aria-hidden="true" />
      <span className="orb-kinetic-frame" aria-hidden="true" />
      <span className="orb-particle-field" aria-hidden="true">
        {Array.from({ length: 12 }, (_, index) => (
          <i key={index} style={{ "--i": index } as CSSProperties} />
        ))}
      </span>
      <span className="orb-state-glyph" aria-hidden="true" />
      <Canvas className="orb-canvas" camera={{ position: [0, 0, 4.4], fov: 42 }} gl={{ alpha: true, antialias: true }}>
        <ambientLight intensity={0.55} />
        <OrbSphere theme={theme} />
      </Canvas>
    </button>
  );
}

function themeFor(state: HudState, pendingApproval: boolean): OrbVisualTheme {
  if (pendingApproval || state === "approval") {
    return { core: "#ffd45a", emissive: "#6e4e00", wire: "#fff1b8", ring: "#ffd45a", speed: 1.7, pulse: 0.045 };
  }
  if (state === "error") {
    return { core: "#ff2f7d", emissive: "#720026", wire: "#ffd1df", ring: "#ff007f", speed: 2.15, pulse: 0.06 };
  }
  if (state === "thinking" || state === "planning") {
    return { core: "#a64dff", emissive: "#3a006d", wire: "#f2ddff", ring: "#ff007f", speed: 1.9, pulse: 0.045 };
  }
  if (state === "listening" || state === "speaking") {
    return { core: "#00ff88", emissive: "#00643d", wire: "#cffff0", ring: "#00ff88", speed: 1.45, pulse: 0.052 };
  }
  if (state === "recognizing") {
    return { core: "#ffffff", emissive: "#0a8da0", wire: "#ffffff", ring: "#00e5ff", speed: 1.8, pulse: 0.04 };
  }
  if (state === "executing") {
    return { core: "#73f7ff", emissive: "#005b70", wire: "#d9fdff", ring: "#00e5ff", speed: 2, pulse: 0.04 };
  }
  return { core: "#00e5ff", emissive: "#006b7a", wire: "#bff8ff", ring: "#00e5ff", speed: 1, pulse: 0.035 };
}
