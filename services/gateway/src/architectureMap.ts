export type ArchitectureLanguage = "TypeScript" | "Python" | "Rust/Tauri" | "Native/C++" | "PowerShell" | "SQLite";

export interface ArchitectureSubsystem {
  id: string;
  label: string;
  language: ArchitectureLanguage[];
  responsibility: string;
  runtimeBoundary: string;
  communicatesWith: string[];
  optimizationNotes: string[];
  hardeningNotes: string[];
}

export interface ArchitectureMap {
  generatedAt: string;
  localFirst: true;
  stackSummary: string;
  subsystems: ArchitectureSubsystem[];
  languageStrategy: Array<{
    language: ArchitectureLanguage;
    bestAt: string;
    keepBecause: string;
    avoidFor: string;
  }>;
  improvementBacklog: string[];
}

export function buildArchitectureMap(generatedAt: string): ArchitectureMap {
  return {
    generatedAt,
    localFirst: true,
    stackSummary:
      "Jarvis uses TypeScript for UI/API orchestration, Python for AI sidecars and automation, native runtimes for inference, PowerShell for Windows bootstrap, and SQLite for durable local state.",
    subsystems: [
      {
        id: "hud",
        label: "Electron HUD",
        language: ["TypeScript"],
        responsibility: "Centered orb, radial controls, command capsule, compact approvals, and live desktop presence.",
        runtimeBoundary: "Renderer talks to the local gateway through HTTP/SSE; desktop shell controls tray/window behavior.",
        communicatesWith: ["gateway", "desktop-shell"],
        optimizationNotes: ["Keep HUD state compact.", "Lazy-load heavy panels later to reduce renderer bundle size."],
        hardeningNotes: ["No protected core inspection from HUD.", "Risky actions route through approval endpoints."],
      },
      {
        id: "dashboard",
        label: "Dashboard / Control Room",
        language: ["TypeScript", "Rust/Tauri"],
        responsibility: "Deeper model, memory, workflow, setup, report, map, and security views.",
        runtimeBoundary: "Secondary UI; production desktop path stays HUD-first.",
        communicatesWith: ["gateway"],
        optimizationNotes: ["Prefer grouped summaries and collapsible detail drawers.", "Keep dashboard secondary to avoid clutter."],
        hardeningNotes: ["Shows audit state but should not bypass policy."],
      },
      {
        id: "gateway",
        label: "TypeScript Gateway",
        language: ["TypeScript", "SQLite"],
        responsibility: "HTTP/SSE API, policy decisions, queues, MemoryOS persistence, setup plans, and connector manifests.",
        runtimeBoundary: "Localhost API boundary between UI and automation/AI sidecars.",
        communicatesWith: ["hud", "dashboard", "python-brain", "ollama", "local-files"],
        optimizationNotes: ["Split oversized server routes into focused routers.", "Keep shared contracts in packages/core."],
        hardeningNotes: ["All sensitive actions evaluate policy first.", "Protected-core access is denied at runtime."],
      },
      {
        id: "python-brain",
        label: "Python Brain",
        language: ["Python"],
        responsibility: "AI sidecars for STT, TTS, vision, model probing, and privileged automation bridges.",
        runtimeBoundary: "Runs as a localhost sidecar; gateway owns approval and policy before invoking privileged actions.",
        communicatesWith: ["gateway", "native-inference", "windows-os"],
        optimizationNotes: ["Keep heavy model loading on demand.", "Move hot inference paths to native runtimes where practical."],
        hardeningNotes: ["Privilege is explicit and approval-gated.", "Sensor capture remains locked until approved."],
      },
      {
        id: "native-inference",
        label: "Native Inference Runtimes",
        language: ["Native/C++", "Python"],
        responsibility: "Ollama, llama.cpp, whisper.cpp, Piper, and future vLLM/SGLang/TGI model serving.",
        runtimeBoundary: "External local processes/endpoints; activation is dry-run and approval-gated.",
        communicatesWith: ["gateway", "python-brain"],
        optimizationNotes: ["Use quantized laptop models by default.", "Route large models to LM Studio, workstation, or homelab endpoints."],
        hardeningNotes: ["No surprise model loads.", "Hosted inference stays disabled unless explicitly enabled later."],
      },
      {
        id: "startup",
        label: "Windows Startup And Background Runtime",
        language: ["PowerShell"],
        responsibility: "Start Ollama, Brain, Gateway, HUD renderer, Electron HUD, and optional dashboard at login.",
        runtimeBoundary: "Scheduled task or Startup shortcut launches hidden background processes with PID/log files.",
        communicatesWith: ["windows-os", "gateway", "hud", "python-brain"],
        optimizationNotes: ["Prefer compiled/package start path later for fewer dev-process layers.", "Keep logs and PID files under data/runtime."],
        hardeningNotes: ["Elevated mode is explicit.", "Emergency stop and stop script preserve logs and checkpoints."],
      },
    ],
    languageStrategy: [
      {
        language: "TypeScript",
        bestAt: "HUD, dashboard, typed contracts, HTTP/SSE gateway, and real-time event UX.",
        keepBecause: "It gives fast UI iteration and shared types across desktop/frontend/API.",
        avoidFor: "Heavy model loading, GPU memory management, and low-level microphone pipelines.",
      },
      {
        language: "Python",
        bestAt: "AI ecosystem glue, model probes, voice/vision services, automation, and rapid sidecar iteration.",
        keepBecause: "It has mature libraries for Transformers, STT/TTS, OCR, vision, and local automation.",
        avoidFor: "High-frequency UI animation and long-lived desktop shell rendering.",
      },
      {
        language: "Native/C++",
        bestAt: "Inference engines such as llama.cpp, whisper.cpp, Piper-style audio, and performance-critical paths.",
        keepBecause: "It provides maximum local performance and avoids cloud dependency.",
        avoidFor: "Product UI and high-level orchestration where type-safe app code is faster to evolve.",
      },
      {
        language: "PowerShell",
        bestAt: "Windows startup, scheduled tasks, service bootstrap, and local diagnostics.",
        keepBecause: "It integrates directly with Windows logon, process, and admin tooling.",
        avoidFor: "Core Jarvis business logic and AI behavior.",
      },
    ],
    improvementBacklog: [
      "Split services/gateway/src/server.ts into route modules once endpoint coverage is stable.",
      "Add code health scanner for oversized files, duplicate concepts, and stale references.",
      "Add startup readiness endpoint that checks scheduled task, shortcut fallback, PID files, and elevated mode.",
      "Move repeated HUD setup-card styles into shared compact-card classes.",
      "Add package-size/code-splitting pass for HUD after feature behavior stabilizes.",
    ],
  };
}
