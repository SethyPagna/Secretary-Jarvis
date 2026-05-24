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

type OrbPalette = {
  core: string;
  rim: string;
  accent: string;
  secondary: string;
};

const STATE_PALETTE: Record<OrbState, OrbPalette> = {
  idle: {
    core: "#00d4ff",
    rim: "#42f8ff",
    accent: "#b86cff",
    secondary: "#00ff88",
  },
  listening: {
    core: "#00ff88",
    rim: "#b7ffd8",
    accent: "#00d4ff",
    secondary: "#b86cff",
  },
  thinking: {
    core: "#8bd8ff",
    rim: "#ffffff",
    accent: "#b86cff",
    secondary: "#00d4ff",
  },
  speaking: {
    core: "#ff6600",
    rim: "#ffd08a",
    accent: "#ff3dad",
    secondary: "#00d4ff",
  },
  executing: {
    core: "#f8fbff",
    rim: "#00ff88",
    accent: "#00d4ff",
    secondary: "#b86cff",
  },
  error: {
    core: "#ff3333",
    rim: "#ff8a8a",
    accent: "#ff3dad",
    secondary: "#b86cff",
  },
  offline: {
    core: "#6b7280",
    rim: "#a5adba",
    accent: "#3b4252",
    secondary: "#00d4ff",
  },
};

function fillSphericalGeometry(
  count: number,
  minRadius: number,
  maxRadius: number,
  colors: string[],
) {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const colorValues = new Float32Array(count * 3);
  const color = new THREE.Color();

  for (let index = 0; index < count; index += 1) {
    const radius = minRadius + Math.random() * (maxRadius - minRadius);
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);

    positions[index * 3] = radius * Math.sin(phi) * Math.cos(theta);
    positions[index * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
    positions[index * 3 + 2] = radius * Math.cos(phi);

    color.set(colors[index % colors.length]);
    colorValues[index * 3] = color.r;
    colorValues[index * 3 + 1] = color.g;
    colorValues[index * 3 + 2] = color.b;
  }

  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colorValues, 3));
  return geometry;
}

function StarField({ state }: JarvisOrbProps) {
  const starsRef = useRef<THREE.Points>(null);
  const palette = STATE_PALETTE[state];
  const starGeometry = useMemo(
    () =>
      fillSphericalGeometry(620, 5.6, 10.8, [
        "#ffffff",
        "#7df9ff",
        "#b86cff",
        palette.accent,
        palette.secondary,
      ]),
    [palette.accent, palette.secondary],
  );

  useFrame(({ clock }) => {
    if (!starsRef.current) return;
    const elapsed = clock.getElapsedTime();
    starsRef.current.rotation.y = elapsed * 0.011;
    starsRef.current.rotation.x = Math.sin(elapsed * 0.08) * 0.04;
  });

  return (
    <points ref={starsRef} geometry={starGeometry}>
      <pointsMaterial
        vertexColors
        size={0.024}
        transparent
        opacity={state === "offline" ? 0.24 : 0.72}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  );
}

function NebulaVeil({ state }: JarvisOrbProps) {
  const veilRef = useRef<THREE.Group>(null);
  const palette = STATE_PALETTE[state];

  useFrame(({ clock }) => {
    if (!veilRef.current) return;
    const elapsed = clock.getElapsedTime();
    veilRef.current.rotation.z = elapsed * 0.034;
    veilRef.current.rotation.y = Math.sin(elapsed * 0.16) * 0.1;
  });

  return (
    <group ref={veilRef} position={[0, 0, -0.9]}>
      <mesh rotation={[Math.PI / 2.35, 0.2, 0.4]} scale={[1.42, 1.42, 1.42]}>
        <torusGeometry args={[1.52, 0.018, 18, 180]} />
        <meshBasicMaterial
          color={palette.accent}
          transparent
          opacity={state === "offline" ? 0.1 : 0.34}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
      <mesh rotation={[Math.PI / 2.75, -0.48, -0.7]} scale={[1.05, 1.05, 1.05]}>
        <torusGeometry args={[1.72, 0.015, 18, 180]} />
        <meshBasicMaterial
          color={palette.secondary}
          transparent
          opacity={state === "offline" ? 0.08 : 0.26}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

function OrbitRings({ state }: JarvisOrbProps) {
  const ringsRef = useRef<THREE.Group>(null);
  const palette = STATE_PALETTE[state];

  useFrame(({ clock }) => {
    if (!ringsRef.current) return;
    const elapsed = clock.getElapsedTime();
    const speed = state === "thinking" || state === "executing" ? 0.9 : 0.34;
    ringsRef.current.rotation.y = elapsed * speed * 0.28;
    ringsRef.current.rotation.x = Math.sin(elapsed * 0.26) * 0.24;
  });

  return (
    <group ref={ringsRef}>
      {[
        [palette.rim, 1.28, 0.01, 0.48],
        [palette.accent, 1.52, 0.007, 0.3],
        [palette.secondary, 1.78, 0.005, 0.22],
      ].map(([color, radius, tube, opacity], index) => (
        <mesh
          key={`${color}-${radius}`}
          rotation={[
            Math.PI / (2.15 + index * 0.16),
            0.35 + index * 0.55,
            index * 0.72,
          ]}
        >
          <torusGeometry args={[Number(radius), Number(tube), 12, 180]} />
          <meshBasicMaterial
            color={String(color)}
            transparent
            opacity={state === "offline" ? Number(opacity) * 0.28 : Number(opacity)}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  );
}

function OrbMesh({ state }: JarvisOrbProps) {
  const groupRef = useRef<THREE.Group>(null);
  const coreRef = useRef<THREE.Mesh>(null);
  const shellRef = useRef<THREE.Mesh>(null);
  const particlesRef = useRef<THREE.Points>(null);
  const palette = STATE_PALETTE[state];

  const particleGeometry = useMemo(
    () =>
      fillSphericalGeometry(420, 1.35, 2.25, [
        palette.core,
        palette.rim,
        palette.accent,
        palette.secondary,
        "#ffffff",
      ]),
    [palette.accent, palette.core, palette.rim, palette.secondary],
  );

  useFrame(({ clock }) => {
    const elapsed = clock.getElapsedTime();
    const speed = state === "thinking" || state === "executing" ? 0.9 : 0.25;
    const speechPulse = state === "speaking" ? 10.5 : 2.4;
    const pulse = 1 + Math.sin(elapsed * speechPulse) * (state === "offline" ? 0.01 : 0.045);

    if (groupRef.current) {
      groupRef.current.rotation.y += 0.005 + speed * 0.004;
      groupRef.current.rotation.x = Math.sin(elapsed * 0.36) * 0.075;
    }

    if (coreRef.current) {
      coreRef.current.scale.setScalar(state === "offline" ? 0.9 : pulse);
    }

    if (shellRef.current) {
      shellRef.current.rotation.y = -elapsed * (0.18 + speed * 0.08);
      shellRef.current.rotation.z = elapsed * 0.07;
    }

    if (particlesRef.current) {
      particlesRef.current.rotation.y -= 0.004 + speed * 0.006;
      particlesRef.current.rotation.z = elapsed * 0.035;
    }
  });

  return (
    <group ref={groupRef}>
      <mesh ref={coreRef}>
        <sphereGeometry args={[1, 128, 128]} />
        <meshStandardMaterial
          color={palette.core}
          emissive={palette.rim}
          emissiveIntensity={state === "offline" ? 0.16 : 1}
          metalness={0.74}
          roughness={0.16}
          transparent
          opacity={state === "offline" ? 0.42 : 0.82}
        />
      </mesh>
      <mesh ref={shellRef} scale={1.065}>
        <icosahedronGeometry args={[1, 5]} />
        <meshBasicMaterial
          color={palette.accent}
          transparent
          opacity={state === "offline" ? 0.08 : 0.16}
          wireframe
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      <mesh scale={1.18}>
        <sphereGeometry args={[1, 64, 64]} />
        <meshBasicMaterial
          color={palette.rim}
          transparent
          opacity={state === "offline" ? 0.04 : 0.09}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
      <points ref={particlesRef} geometry={particleGeometry}>
        <pointsMaterial
          vertexColors
          size={0.021}
          transparent
          opacity={state === "offline" ? 0.26 : 0.88}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </points>
      <OrbitRings state={state} />
    </group>
  );
}

export function JarvisOrb({ state }: JarvisOrbProps) {
  const palette = STATE_PALETTE[state];

  return (
    <div
      className="relative aspect-square min-w-0 w-[clamp(180px,26vw,270px)] max-w-full overflow-visible"
      style={{
        filter: `drop-shadow(0 0 42px ${palette.core}55) drop-shadow(0 0 90px ${palette.accent}26)`,
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 z-20 h-[46%] w-[46%] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          background: `radial-gradient(circle at 38% 34%, #ffffff 0 8%, ${palette.rim} 22%, ${palette.core} 54%, ${palette.accent} 100%)`,
          boxShadow: `0 0 34px ${palette.core}8a, 0 0 96px ${palette.accent}42, inset -18px -20px 42px rgba(0,0,0,0.18)`,
          opacity: state === "offline" ? 0.42 : 0.72,
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 z-20 h-[68%] w-[68%] -translate-x-1/2 -translate-y-1/2 rounded-full border"
        style={{
          borderColor: `${palette.rim}33`,
          boxShadow: `0 0 48px ${palette.core}2f`,
          opacity: state === "offline" ? 0.24 : 0.56,
        }}
      />
      <Canvas
        className="absolute inset-[-34%] z-10 h-[168%] w-[168%]"
        camera={{ position: [0, 0, 5.8], fov: 34 }}
        dpr={[1, 1.8]}
        gl={{ alpha: true }}
      >
        <ambientLight intensity={0.32} />
        <pointLight position={[4, 3, 3]} intensity={2.4} color={palette.rim} />
        <pointLight position={[-3, -2, -2]} intensity={1.1} color={palette.accent} />
        <pointLight position={[0, 4, -2]} intensity={0.9} color={palette.secondary} />
        <StarField state={state} />
        <NebulaVeil state={state} />
        <OrbMesh state={state} />
      </Canvas>
    </div>
  );
}

export type { OrbState };
