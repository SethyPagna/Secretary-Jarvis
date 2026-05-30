export interface KnowledgeSection {
  id: string;
  label: string;
  summary: string;
}

export interface KnowledgeItem {
  id: string;
  section: string;
  title: string;
  summary: string;
  detail: string;
  badges?: string[];
  command?: string;
  source?: string;
}

export const commandSections: KnowledgeSection[] = [
  {
    id: "daily",
    label: "Daily Control",
    summary: "Fast actions for the unified Home terminal and voice bar.",
  },
  {
    id: "runtime",
    label: "Runtime",
    summary: "Health checks, shutdown, tray, and process hygiene.",
  },
  {
    id: "models",
    label: "Models",
    summary: "Local model tests and backend switching.",
  },
  {
    id: "voice",
    label: "Voice",
    summary: "STT, TTS, and audio loop checks.",
  },
  {
    id: "ops",
    label: "Operations",
    summary: "Gateways, workflows, skills, and memory checks.",
  },
];

export const commandItems: KnowledgeItem[] = [
  {
    id: "quick-task",
    section: "daily",
    title: "Ask JARVIS",
    summary: "Run one natural-language request without leaving Home.",
    detail:
      "Type into the Home input or use the voice button. JARVIS streams the same response to text and voice when voice output is on.",
    badges: ["Home", "streaming"],
    command: "Summarize today's active sessions and tell me what needs attention.",
  },
  {
    id: "status",
    section: "runtime",
    title: "Runtime Status",
    summary: "Check backend, model, gateway, voice, and token counters.",
    detail:
      "The status cards should use live API data, not placeholders. CPU, RAM, token counts, gateway state, and model latency should update from the running backend.",
    badges: ["live data", "health"],
    command: "status",
  },
  {
    id: "shutdown",
    section: "runtime",
    title: "Clean Shutdown",
    summary: "Save state and stop owned children before exit.",
    detail:
      "Close exits the app after the backend saves sessions, memory, workflows, gateway state, and scheduler state. Tray hide can be enabled separately in Settings.",
    badges: ["shutdown", "tray"],
    command: "shutdown check",
  },
  {
    id: "llamacpp-test",
    section: "models",
    title: "Test llama.cpp",
    summary: "Default local backend smoke test.",
    detail:
      "llama.cpp is the preferred default. Test latency, context, tokens/sec, GPU layers, and response streaming before switching to any other backend.",
    badges: ["default", "local"],
    command: "Open Models and test the active llama.cpp model.",
  },
  {
    id: "vllm-test",
    section: "models",
    title: "Test vLLM",
    summary: "High-throughput backend for larger local serving.",
    detail:
      "Use vLLM when batching, queue depth, or sustained tokens/sec matters. The Models page should show real queue, throughput, and VRAM data when connected.",
    badges: ["local", "throughput"],
    command: "Switch to vLLM and run a reasoning smoke test.",
  },
  {
    id: "ollama-last",
    section: "models",
    title: "Ollama Fallback",
    summary: "Convenient backend, lower priority than llama.cpp and vLLM.",
    detail:
      "Ollama remains configurable for users who already depend on it, but local preference order is llama.cpp first, vLLM second, Ollama last.",
    badges: ["fallback"],
    command: "Check Ollama only if llama.cpp and vLLM are unavailable.",
  },
  {
    id: "stt-test",
    section: "voice",
    title: "Test STT",
    summary: "Speak into Home and watch transcription appear in input.",
    detail:
      "The active Whisper model transcribes into the same input stream the terminal uses. The orb enters listening state and the live voice meter should move with microphone audio.",
    badges: ["Whisper", "local"],
    command: "Use the Home voice button and dictate a prompt.",
  },
  {
    id: "tts-test",
    section: "voice",
    title: "Test TTS",
    summary: "Speak the streamed response with the active local voice.",
    detail:
      "Kokoro and OmniVoice assets are the local voice path. The spoken response must match the assistant response shown in the terminal stream.",
    badges: ["Kokoro", "OmniVoice"],
    command: "Speak the next response using the active JARVIS voice.",
  },
  {
    id: "gateway-status",
    section: "ops",
    title: "Gateway Status",
    summary: "Inspect platform connections without opening logs first.",
    detail:
      "Platforms should show connection state, recent messages, and permission limits. Details stay collapsed until the info or more button is used.",
    badges: ["platforms"],
    command: "Show gateway status and recent platform errors.",
  },
  {
    id: "skill-check",
    section: "ops",
    title: "Skills Check",
    summary: "Review enabled skills and toolsets.",
    detail:
      "The Skills page should expose installed skills, toolsets, security level, and enablement state without dumping every skill body into the UI.",
    badges: ["skills", "tools"],
    command: "Open Skills and show enabled high-risk toolsets.",
  },
];

export const guideSections: KnowledgeSection[] = [
  {
    id: "home",
    label: "Home",
    summary: "Orb, terminal, voice, and live stats in one surface.",
  },
  {
    id: "models",
    label: "Models",
    summary: "Backends, model order, downloads, and performance.",
  },
  {
    id: "souls",
    label: "Souls",
    summary: "JARVIS coordination plus specialist delegates.",
  },
  {
    id: "automation",
    label: "Automation",
    summary: "Skills, tools, MCP, platforms, and schedules.",
  },
  {
    id: "safety",
    label: "Safety",
    summary: "Permissions, secrets, shutdown, and local-first defaults.",
  },
];

export const guideItems: KnowledgeItem[] = [
  {
    id: "home-loop",
    section: "home",
    title: "Unified Interaction Loop",
    summary: "Voice, terminal, and chat are one response stream.",
    detail:
      "Speech is transcribed into the Home input, submitted to the same assistant pipeline, streamed to the terminal, and spoken by the active TTS voice from that same response.",
    badges: ["Home", "voice"],
  },
  {
    id: "orb-states",
    section: "home",
    title: "Orb States",
    summary: "Idle, listening, thinking, speaking, executing, error, offline.",
    detail:
      "The orb should be unframed, full of layered particles, and reactive to audio amplitude, tool execution, response tone, and backend health.",
    badges: ["visual", "live"],
  },
  {
    id: "backend-priority",
    section: "models",
    title: "Backend Priority",
    summary: "llama.cpp first, vLLM second, Ollama last.",
    detail:
      "Use llama.cpp as the default local path for predictable single-user desktop inference. Use vLLM when throughput matters. Keep Ollama as a compatibility fallback.",
    badges: ["llama.cpp", "vLLM", "Ollama"],
  },
  {
    id: "api-models",
    section: "models",
    title: "API Models",
    summary: "Cloud providers are optional and key-gated.",
    detail:
      "OpenAI, Anthropic, Gemini, Groq, Together, and OpenAI-compatible endpoints should appear like editable model providers only when an API key or endpoint is configured.",
    badges: ["optional", "keys"],
  },
  {
    id: "local-voice",
    section: "models",
    title: "Local Voice Models",
    summary: "Whisper STT plus Kokoro or OmniVoice TTS.",
    detail:
      "Downloaded Whisper and Kokoro models under the model folders should be detected first. The UI can download more models, but local assets remain the default path.",
    badges: ["Whisper", "Kokoro", "OmniVoice"],
  },
  {
    id: "jarvis-primary",
    section: "souls",
    title: "JARVIS Primary Soul",
    summary: "Personal assistant, summaries, coordination, delegation.",
    detail:
      "JARVIS handles general enquiries, remembers preferences, keeps text and voice aligned, and delegates specialist work instead of pretending one persona does every job.",
    badges: ["primary"],
    source: "jarvis_cli/data/souls/jarvis_SOUL.md",
  },
  {
    id: "delegate-souls",
    section: "souls",
    title: "Delegate Souls",
    summary: "FRIDAY, ARGUS, FORGE, ORACLE, ATLAS, MUSE, SENTINEL.",
    detail:
      "FRIDAY handles code, ARGUS security and process hygiene, FORGE packaging, ORACLE research, ATLAS planning, MUSE creative work, and SENTINEL privacy decisions.",
    badges: ["delegation"],
    source: "jarvis_cli/data/souls/soul_manifest.json",
  },
  {
    id: "skills-tools",
    section: "automation",
    title: "Skills And Toolsets",
    summary: "Reusable capabilities grouped by risk and purpose.",
    detail:
      "Skills stay discoverable from the Skills page. Toolsets let platforms and workflows use only the capabilities they need instead of exposing every tool everywhere.",
    badges: ["skills", "toolsets"],
    source: "docs/jarvis/tools-and-toolsets.md",
  },
  {
    id: "mcp-platforms",
    section: "automation",
    title: "MCP And Platforms",
    summary: "External tools and messaging gateways stay permissioned.",
    detail:
      "MCP servers and social platforms should be configured through dedicated pages with credential tests, recent activity, and per-platform tool limits.",
    badges: ["MCP", "platforms"],
    source: "docs/jarvis/mcp-integration.md",
  },
  {
    id: "memory-context",
    section: "automation",
    title: "Memory And Context",
    summary: "Durable memory plus project context files.",
    detail:
      "JARVIS loads SOUL.md, memory files, and project context in defined priority order. It should not store secrets or repeat stale context when profiles switch.",
    badges: ["memory", "context"],
    source: "docs/jarvis/context-files.md",
  },
  {
    id: "least-privilege",
    section: "safety",
    title: "Least Privilege",
    summary: "Grant exactly the tools and paths a workflow needs.",
    detail:
      "Permissions should default to local, scoped access. Sensitive paths and credentials stay blocked unless the user explicitly allows a specific operation.",
    badges: ["permissions"],
    source: "docs/jarvis/security.md",
  },
  {
    id: "shutdown-hygiene",
    section: "safety",
    title: "Shutdown Hygiene",
    summary: "No owned child process stays idle after quit.",
    detail:
      "Electron sends the shutdown request, waits for state save, then terminates backend, gateway, and model helpers. Tray hide is a setting, not a leak.",
    badges: ["processes"],
  },
];

export const setupSections: KnowledgeSection[] = [
  {
    id: "deps",
    label: "Dependencies",
    summary: "Python, Node, cached wheels, and offline-friendly installs.",
  },
  {
    id: "models",
    label: "Models",
    summary: "Local LLM, STT, and TTS model setup.",
  },
  {
    id: "desktop",
    label: "Desktop",
    summary: "Electron, backend process, tray, and title bar.",
  },
  {
    id: "runtime",
    label: "Runtime",
    summary: "One packaged app with local model folder wiring.",
  },
  {
    id: "release",
    label: "Release",
    summary: "Smoke tests, packaging, installer, and artifact checks.",
  },
];

export const setupItems: KnowledgeItem[] = [
  {
    id: "python-deps",
    section: "deps",
    title: "Python Dependencies",
    summary: "Install from wheelhouse or a reachable mirror when PyPI blocks.",
    detail:
      "Use Python 3.11 or 3.12 for packaging. FastAPI, Uvicorn, PyInstaller, psutil, websockets, and model adapters must import before packaging.",
    badges: ["FastAPI", "PyInstaller"],
    command: "py -3.11 -m pip install --no-build-isolation -e \".[voice,pty]\" pyinstaller",
  },
  {
    id: "frontend-deps",
    section: "deps",
    title: "Frontend Dependencies",
    summary: "Build the React renderer before electron-builder.",
    detail:
      "The renderer must type-check and bundle cleanly. UI routes should avoid hidden runtime-only imports that break packaged startup.",
    badges: ["React", "Vite"],
    command: "npm --prefix web run build",
  },
  {
    id: "llm-models",
    section: "models",
    title: "LLM Models",
    summary: "Detect local files, then allow downloads and API keys.",
    detail:
      "Prefer local llama.cpp. Keep vLLM and Ollama editable in Models. API providers should be disabled until the user provides keys.",
    badges: ["local-first"],
  },
  {
    id: "voice-assets",
    section: "models",
    title: "Voice Assets",
    summary: "Use downloaded Whisper, Kokoro, and OmniVoice assets first.",
    detail:
      "STT and TTS setup should verify model presence, device selection, sample rate, microphone permissions, and a full speak-listen-response loop.",
    badges: ["STT", "TTS"],
  },
  {
    id: "titlebar",
    section: "desktop",
    title: "Title Bar And Sidebar",
    summary: "Custom title bar with sidebar minimize and window controls.",
    detail:
      "The title bar should include app identity, runtime status, time, sidebar collapse, minimize, maximize, and close. Close can quit or hide to tray based on settings.",
    badges: ["title bar"],
  },
  {
    id: "single-visible-app",
    section: "desktop",
    title: "Single Visible App",
    summary: "Packaged app owns backend and helper lifecycle.",
    detail:
      "The packaged build presents as JARVIS in normal app views while backend helpers remain owned children. Quit must terminate every owned child and leave no JARVIS process idle.",
    badges: ["packaging"],
  },
  {
    id: "local-runtime",
    section: "runtime",
    title: "Local Packaged Runtime",
    summary: "Run from the desktop package and point to local model folders.",
    detail:
      "JARVIS no longer starts Docker from the desktop app. The packaged backend reads JARVIS_MODELS_DIR, defaults to the sibling models folder, and keeps external model paths editable in the Models page.",
    badges: ["local", "models"],
    command: ".\\run-jarvis.cmd -ModelsDir ..\\models",
  },
  {
    id: "smoke-tests",
    section: "release",
    title: "Smoke Tests",
    summary: "Backend bind, API status, renderer build, and package launch.",
    detail:
      "A release is not ready until packaged backend smoke, renderer build, installer generation, and clean port/process shutdown checks pass.",
    badges: ["release"],
    command: "powershell -ExecutionPolicy Bypass -File ops/scripts/build/build-desktop.ps1 -SmokePort 18765",
  },
];

export const referenceSections: KnowledgeSection[] = [
  {
    id: "core",
    label: "Core",
    summary: "Architecture, context, memory, and environment.",
  },
  {
    id: "automation",
    label: "Automation",
    summary: "Skills, tools, schedules, MCP, and platforms.",
  },
  {
    id: "security",
    label: "Security",
    summary: "Permissions, secrets, process boundaries, and reviews.",
  },
];

export const referenceItems: KnowledgeItem[] = [
  {
    id: "architecture",
    section: "core",
    title: "Architecture",
    summary: "Desktop shell, backend process, gateway, tools, and data paths.",
    detail:
      "Use this when changing process ownership, API routes, packaging, or long-running services.",
    badges: ["system"],
    source: "docs/jarvis/architecture.md",
  },
  {
    id: "context-files",
    section: "core",
    title: "Context Files",
    summary: "SOUL.md, AGENTS.md, project rules, and prompt injection order.",
    detail:
      "Use this when changing how JARVIS loads identity, project guidance, or memory into the prompt.",
    badges: ["context"],
    source: "docs/jarvis/context-files.md",
  },
  {
    id: "memory",
    section: "core",
    title: "Memory",
    summary: "Durable user and project memory without storing secrets.",
    detail:
      "Use this when adding retention rules, profile switching, search, or memory write behavior.",
    badges: ["memory"],
    source: "docs/jarvis/memory.md",
  },
  {
    id: "environment",
    section: "core",
    title: "Environment Variables",
    summary: "JARVIS_HOME, model keys, gateway tokens, and runtime switches.",
    detail:
      "Use this when adding a new setting, provider credential, or package-time runtime flag.",
    badges: ["env"],
    source: "docs/jarvis/environment-variables.md",
  },
  {
    id: "skills-hub",
    section: "automation",
    title: "Skills Hub",
    summary: "Skill install, trust, review, and enablement model.",
    detail:
      "Use this when wiring user skills, bundled skills, marketplace-style discovery, or safety levels.",
    badges: ["skills"],
    source: "docs/jarvis/skills-hub.md",
  },
  {
    id: "tools",
    section: "automation",
    title: "Tools And Toolsets",
    summary: "Tool registry, risk groups, platform limits, and delegation.",
    detail:
      "Use this when changing tool availability, approval rules, or per-platform execution rights.",
    badges: ["tools"],
    source: "docs/jarvis/tools-and-toolsets.md",
  },
  {
    id: "mcp",
    section: "automation",
    title: "MCP Integration",
    summary: "Remote and local tool servers exposed through JARVIS.",
    detail:
      "Use this when adding external tool servers or debugging MCP startup and permissions.",
    badges: ["MCP"],
    source: "docs/jarvis/mcp-integration.md",
  },
  {
    id: "platforms",
    section: "automation",
    title: "Social Media And Platforms",
    summary: "Telegram, Discord, WhatsApp, Slack, Email, and webhooks.",
    detail:
      "Use this when adjusting gateway configuration, setup wizards, message routing, or platform credentials.",
    badges: ["platforms"],
    source: "docs/jarvis/social-media-and-platforms.md",
  },
  {
    id: "scheduling",
    section: "automation",
    title: "Scheduling",
    summary: "Cron, recurring jobs, workflow triggers, and state persistence.",
    detail:
      "Use this when adding scheduled workflows, recurring tasks, or shutdown-safe job handling.",
    badges: ["cron"],
    source: "docs/jarvis/scheduling.md",
  },
  {
    id: "security",
    section: "security",
    title: "Security",
    summary: "Secrets, allowlists, approvals, sandboxing, and process hygiene.",
    detail:
      "Use this when changing permissions, credential storage, network access, or destructive actions.",
    badges: ["security"],
    source: "docs/jarvis/security.md",
  },
];
