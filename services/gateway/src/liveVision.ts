import type { ActionRequest, PolicyDecision, VisionInsight } from "@jarvis/core";

export type LiveVisionMode = VisionInsight["mode"];

export interface LiveVisionRequestRecord {
  id: string;
  mode: LiveVisionMode;
  target: string;
  prompt: string;
  captured: false;
  retention: "not-retained";
  action: ActionRequest;
  decision: PolicyDecision;
  insight: VisionInsight;
}

export function createLiveVisionRequest(params: {
  id: string;
  actionId: string;
  mode: LiveVisionMode;
  target?: string;
  prompt?: string;
  createdAt: string;
  evaluate: (action: ActionRequest) => PolicyDecision;
}): LiveVisionRequestRecord {
  const target = params.target?.trim() || defaultTarget(params.mode);
  const prompt = params.prompt?.trim() || defaultPrompt(params.mode);
  const action: ActionRequest = {
    id: params.actionId,
    title: liveVisionTitle(params.mode),
    category: "sensor-capture",
    target,
    reason: liveVisionReason(params.mode),
    connectorId: params.mode === "screen" ? "screen" : params.mode === "camera" ? "camera" : undefined,
    agentId: "argus",
    dataTouched: dataTouched(params.mode),
  };
  const decision = params.evaluate(action);
  const insight: VisionInsight = {
    id: params.id,
    source: target,
    mode: params.mode,
    status: decision.decision === "deny" ? "blocked" : "requires-approval",
    summary:
      decision.decision === "deny"
        ? `Argus cannot inspect ${target} until policy allows it.`
        : `Argus staged ${params.mode} analysis and is waiting for owner approval.`,
    observations: [
      "No pixels, frames, or OCR text were captured.",
      `Prompt: ${prompt}`,
      decision.reasons[0] ?? "Sensor capture is approval-gated.",
    ],
    createdAt: params.createdAt,
  };

  return {
    id: params.id,
    mode: params.mode,
    target,
    prompt,
    captured: false,
    retention: "not-retained",
    action,
    decision,
    insight,
  };
}

function defaultTarget(mode: LiveVisionMode): string {
  if (mode === "camera") {
    return "webcam";
  }
  if (mode === "image") {
    return "selected local image";
  }
  return "active screen";
}

function defaultPrompt(mode: LiveVisionMode): string {
  if (mode === "camera") {
    return "Describe what is visible after approval.";
  }
  if (mode === "image") {
    return "Analyze the selected image after approval.";
  }
  return "Explain the current screen after approval.";
}

function liveVisionTitle(mode: LiveVisionMode): string {
  if (mode === "camera") {
    return "Analyze webcam frame";
  }
  if (mode === "image") {
    return "Analyze selected image";
  }
  return "Analyze current screen";
}

function liveVisionReason(mode: LiveVisionMode): string {
  if (mode === "camera") {
    return "Webcam analysis can touch biometric identity and private room context.";
  }
  if (mode === "image") {
    return "Selected-image analysis may expose private file content or OCR text.";
  }
  return "Screen analysis can expose private app data, OCR text, and active workspace context.";
}

function dataTouched(mode: LiveVisionMode): string[] {
  if (mode === "camera") {
    return ["camera frame", "face embedding", "room context"];
  }
  if (mode === "image") {
    return ["selected image pixels", "file metadata", "possible OCR text"];
  }
  return ["screen pixels", "OCR text", "active app context"];
}
