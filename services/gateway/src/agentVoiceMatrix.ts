import type { AgentSoul, VoiceAsset, VoiceProfile, VoiceRuntimeReadiness } from "@jarvis/core";

const TEST_LINES: Record<string, string> = {
  jarvis: "Systems are online. I am ready to coordinate.",
  friday: "Your brief is ready, and the schedule is under control.",
  daedalus: "I have the repository map and the risk points in view.",
  argus: "Visual context is locked until you approve sensor access.",
  mnemosyne: "I remember the thread and can trace the decision history.",
  sentinel: "Approval is required before I allow that action.",
  vulcan: "Local systems are staged. I can proceed after confirmation.",
  hermes: "I can draft the message locally and wait for your approval.",
};

export interface AgentVoiceMatrix {
  generatedAt: string;
  localOnly: true;
  entries: AgentVoiceEntry[];
  summary: {
    agents: number;
    distinctProfiles: number;
    ready: number;
    staged: number;
    missing: number;
    ttsReady: boolean;
  };
  note: string;
}

export interface AgentVoiceEntry {
  agentId: string;
  agentName: string;
  role: string;
  personality: string;
  voiceProfileId: string;
  label: string;
  style: string;
  enginePreference: VoiceProfile["enginePreference"] | "missing";
  status: VoiceProfile["status"] | "missing";
  sampleAssetId?: string;
  samplePath?: string;
  testPhrase: string;
  ttsRequest: {
    agentId: string;
    voiceProfileId: string;
    text: string;
  };
}

export function buildAgentVoiceMatrix(params: {
  generatedAt: string;
  agents: AgentSoul[];
  voiceProfiles: VoiceProfile[];
  voiceAssets: VoiceAsset[];
  readiness: VoiceRuntimeReadiness;
}): AgentVoiceMatrix {
  const profileById = new Map(params.voiceProfiles.map((profile) => [profile.id, profile]));
  const assetById = new Map(params.voiceAssets.map((asset) => [asset.id, asset]));
  const entries = params.agents.map((agent) => {
    const profile = profileById.get(agent.voiceProfileId);
    const sample = profile?.sampleAssetId ? assetById.get(profile.sampleAssetId) : undefined;
    const testPhrase = TEST_LINES[agent.id] ?? `${agent.name} voice profile is ready for a local test.`;
    return {
      agentId: agent.id,
      agentName: agent.name,
      role: agent.role,
      personality: agent.personality,
      voiceProfileId: agent.voiceProfileId,
      label: profile?.label ?? "Missing voice profile",
      style: profile?.style ?? "No voice style configured.",
      enginePreference: profile?.enginePreference ?? "missing",
      status: profile?.status ?? "missing",
      sampleAssetId: sample?.id,
      samplePath: sample?.localPath,
      testPhrase,
      ttsRequest: {
        agentId: agent.id,
        voiceProfileId: agent.voiceProfileId,
        text: testPhrase,
      },
    } satisfies AgentVoiceEntry;
  });

  return {
    generatedAt: params.generatedAt,
    localOnly: true,
    entries,
    summary: {
      agents: entries.length,
      distinctProfiles: new Set(entries.map((entry) => entry.voiceProfileId)).size,
      ready: entries.filter((entry) => entry.status === "ready").length,
      staged: entries.filter((entry) => entry.status === "staged").length,
      missing: entries.filter((entry) => entry.status === "missing" || entry.status === "missing-dependency").length,
      ttsReady: params.readiness.summary.ttsReady,
    },
    note: "Each soul has a distinct voice profile; staged profiles become fully spoken after Piper or future clone assets are installed.",
  };
}
