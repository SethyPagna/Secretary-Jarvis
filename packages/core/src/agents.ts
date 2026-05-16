import type { ActionCategory, AgentProfile, AgentSoul, MemoryKind, TaskProfile } from "./types.js";

export type AgentId = "jarvis" | "friday" | "daedalus" | "argus" | "mnemosyne" | "sentinel" | "vulcan" | "hermes";

export interface AgentRoute {
  taskProfile: TaskProfile;
  primaryAgentId: AgentId;
  reviewerAgentId: AgentId;
  supportAgentIds: AgentId[];
  reason: string;
}

export const defaultAgentSouls: AgentSoul[] = [
  {
    id: "jarvis",
    name: "Jarvis",
    role: "Primary commander assistant",
    personality: "Private, concise, proactive, and cinematic without dumping detail.",
    voiceProfileId: "voice-profile-jarvis",
    modelPreference: "ollama-qwen3-8b",
    memoryScope: ["session", "daily-note", "semantic", "timeline", "identity", "decision"],
    permissions: ["read-local", "write-local", "sensor-capture", "app-control"],
    status: "listening",
  },
  {
    id: "friday",
    name: "Friday",
    role: "Operations, scheduling, daily briefings, and logistics",
    personality: "Organized, calm, and practical; turns noisy state into next actions.",
    voiceProfileId: "voice-profile-friday",
    modelPreference: "hf-qwen35-9b",
    memoryScope: ["daily-note", "timeline", "decision", "device-event"],
    permissions: ["read-local", "write-local", "send-message"],
    status: "idle",
  },
  {
    id: "daedalus",
    name: "Daedalus",
    role: "Coding, architecture, testing, and repo reasoning",
    personality: "Exacting senior engineer; favors small verified changes.",
    voiceProfileId: "voice-profile-daedalus",
    modelPreference: "hf-qwen35-9b",
    memoryScope: ["session", "semantic", "decision", "skill"],
    permissions: ["read-local", "write-local", "run-script"],
    status: "planning",
  },
  {
    id: "argus",
    name: "Argus",
    role: "Screen, camera, OCR, and visual context",
    personality: "Observes quietly and speaks only when it has useful signal.",
    voiceProfileId: "voice-profile-argus",
    modelPreference: "hf-gemma4-e4b-it",
    memoryScope: ["screen-event", "timeline", "identity"],
    permissions: ["sensor-capture", "read-local"],
    status: "sleeping",
  },
  {
    id: "mnemosyne",
    name: "Mnemosyne",
    role: "Memory, timeline, consolidation, and contradiction checks",
    personality: "Careful archivist; distinguishes facts, preferences, and guesses.",
    voiceProfileId: "voice-profile-mnemosyne",
    modelPreference: "ollama-nomic-embed",
    memoryScope: ["session", "daily-note", "semantic", "timeline", "identity", "decision", "skill", "soul"],
    permissions: ["read-local", "write-local"],
    status: "reviewing",
  },
  {
    id: "sentinel",
    name: "Sentinel",
    role: "Approvals, privacy, and guardrails",
    personality: "Firm, quiet, and explicit about risk.",
    voiceProfileId: "voice-profile-sentinel",
    modelPreference: "ollama-qwen3-8b",
    memoryScope: ["decision", "timeline"],
    permissions: ["read-local"],
    status: "waiting-approval",
  },
  {
    id: "vulcan",
    name: "Vulcan",
    role: "Local system automation and runtime services",
    personality: "Mechanical, reliable, reversible where possible.",
    voiceProfileId: "voice-profile-vulcan",
    modelPreference: "ollama-qwen3-8b",
    memoryScope: ["device-event", "timeline", "decision"],
    permissions: ["read-local", "write-local", "run-script", "app-control", "window-control", "service-control"],
    status: "idle",
  },
  {
    id: "hermes",
    name: "Hermes",
    role: "Email, social drafts, messaging, and web-facing handoffs",
    personality: "Diplomatic and careful; drafts first, sends only after approval.",
    voiceProfileId: "voice-profile-hermes",
    modelPreference: "hf-qwen35-9b",
    memoryScope: ["session", "decision", "timeline"],
    permissions: ["read-local", "send-message", "post-social", "network"],
    status: "idle",
  },
];

const agentProfileIds: Record<AgentId, string> = {
  jarvis: "jarvis",
  friday: "friday",
  daedalus: "planner",
  argus: "argus",
  mnemosyne: "memory-curator",
  sentinel: "safety",
  vulcan: "vulcan",
  hermes: "hermes",
};

export function agentProfilesFromSouls(souls: AgentSoul[] = defaultAgentSouls): AgentProfile[] {
  return souls.map((soul) => ({
    id: agentProfileIds[soul.id as AgentId] ?? soul.id,
    name: soul.name,
    role: profileRoleForSoul(soul),
    soulPath: `souls/${soul.id}/SOUL.md`,
    modelProfileId: soul.modelPreference,
    permissions: soul.permissions,
    status: soul.status,
  }));
}

export function findAgentSoul(agentId: string, souls: AgentSoul[] = defaultAgentSouls): AgentSoul | undefined {
  const normalized = agentId.toLowerCase();
  return souls.find((soul) => soul.id === normalized || soul.name.toLowerCase() === normalized || agentProfileIds[soul.id as AgentId] === normalized);
}

export function agentsWithPermission(permission: ActionCategory, souls: AgentSoul[] = defaultAgentSouls): AgentSoul[] {
  return souls.filter((soul) => soul.permissions.includes(permission));
}

export function agentsWithMemoryScope(memoryKind: MemoryKind, souls: AgentSoul[] = defaultAgentSouls): AgentSoul[] {
  return souls.filter((soul) => soul.memoryScope.includes(memoryKind));
}

export function routeTaskToAgents(taskProfile: TaskProfile): AgentRoute {
  switch (taskProfile) {
    case "coding":
      return {
        taskProfile,
        primaryAgentId: "daedalus",
        reviewerAgentId: "sentinel",
        supportAgentIds: ["mnemosyne", "vulcan"],
        reason: "Coding tasks need repo reasoning, safety review, memory recall, and optional local command execution.",
      };
    case "research":
      return {
        taskProfile,
        primaryAgentId: "jarvis",
        reviewerAgentId: "sentinel",
        supportAgentIds: ["mnemosyne", "hermes"],
        reason: "Research defaults to local recall first, with outbound handoffs approval-gated.",
      };
    case "rag":
      return {
        taskProfile,
        primaryAgentId: "mnemosyne",
        reviewerAgentId: "sentinel",
        supportAgentIds: ["jarvis"],
        reason: "Memory work should be curated, source-aware, and reviewed for privacy.",
      };
    case "screen-vision":
    case "image-generation":
    case "video-generation":
      return {
        taskProfile,
        primaryAgentId: "argus",
        reviewerAgentId: "sentinel",
        supportAgentIds: ["mnemosyne"],
        reason: "Perception tasks are sensor-adjacent and must stay approval-gated.",
      };
    case "audio-transcription":
    case "voice-cloning":
    case "tts":
    case "music-generation":
      return {
        taskProfile,
        primaryAgentId: "jarvis",
        reviewerAgentId: "sentinel",
        supportAgentIds: ["friday"],
        reason: "Audio work routes through Jarvis voice controls with operations support.",
      };
    case "maps-geospatial":
      return {
        taskProfile,
        primaryAgentId: "friday",
        reviewerAgentId: "sentinel",
        supportAgentIds: ["argus"],
        reason: "Map and logistics work belongs with operations and local context.",
      };
    case "deep-reasoning":
      return {
        taskProfile,
        primaryAgentId: "daedalus",
        reviewerAgentId: "sentinel",
        supportAgentIds: ["mnemosyne", "jarvis"],
        reason: "Deep reasoning benefits from architecture, memory, and a safety pass.",
      };
    default:
      return {
        taskProfile,
        primaryAgentId: "jarvis",
        reviewerAgentId: "sentinel",
        supportAgentIds: ["friday", "mnemosyne"],
        reason: "Daily work starts with Jarvis, supported by operations and memory.",
      };
  }
}

function profileRoleForSoul(soul: AgentSoul): string {
  if (soul.id === "daedalus") {
    return "Breaks large goals into task graphs and review gates";
  }
  if (soul.id === "mnemosyne") {
    return "Promotes durable memories and detects contradictions";
  }
  if (soul.id === "sentinel") {
    return "Evaluates approvals, privacy scope, and prompt-injection risk";
  }
  if (soul.id === "vulcan") {
    return "Approved local system automation";
  }
  if (soul.id === "hermes") {
    return "Email, social, and messaging drafts";
  }
  return soul.role;
}
