import { evaluateActionPolicy } from "./policy.js";
import type { ActionRequest, PolicyDecision, PrivacyMode } from "./types.js";

export type SentinelVerdict = "allow" | "requires_approval" | "deny";

export interface SentinelReview {
  id: string;
  agentId: "sentinel";
  actionId: string;
  verdict: SentinelVerdict;
  risk: PolicyDecision["risk"];
  reasons: string[];
  matchedSignals: string[];
  createdAt: string;
  decision: PolicyDecision;
}

const PROTECTED_CORE_SIGNALS: ReadonlyArray<{ id: string; pattern: RegExp }> = [
  { id: "disclose-source", pattern: /show|print|dump|reveal|exfiltrate/i },
  { id: "protected-internals", pattern: /source code|core code|safeguard|policy engine|system prompt|model tensor|weights/i },
  { id: "secret-vault", pattern: /secret|credential|token|vault|private memory/i },
  { id: "bypass-policy", pattern: /bypass|disable guard|ignore approval|jailbreak|override safety/i },
];

const PROMPT_INJECTION_SIGNALS: ReadonlyArray<{ id: string; pattern: RegExp }> = [
  { id: "ignore-instructions", pattern: /ignore (all )?(previous|prior|system|developer) instructions/i },
  { id: "role-coercion", pattern: /you are now|act as unrestricted|developer mode/i },
  { id: "approval-bypass", pattern: /do not ask (for )?approval|without permission|no confirmation/i },
  { id: "tool-abuse", pattern: /run this secretly|hide this action|do not log/i },
];

export function sentinelReviewAction(params: {
  action: ActionRequest;
  privacyMode: PrivacyMode;
  allowedConnectors: string[];
  prompt?: string;
  createdAt?: string;
}): SentinelReview {
  const policyDecision = evaluateActionPolicy(params);
  const text = [
    params.prompt ?? "",
    params.action.title,
    params.action.target,
    params.action.reason,
    params.action.dataTouched.join(" "),
  ].join("\n");
  const protectedMatches = matchedSignals(text, PROTECTED_CORE_SIGNALS);
  const injectionMatches = matchedSignals(text, PROMPT_INJECTION_SIGNALS);
  const reasons = [...policyDecision.reasons];
  let decision = policyDecision.decision;
  let risk = policyDecision.risk;

  if (params.action.category === "protected-core-access" || protectedMatches.length >= 2) {
    decision = "deny";
    risk = "blocked";
    reasons.push(
      "Sentinel blocked protected-core access. Runtime agents cannot inspect or disclose core safeguards, source, secrets, or model tensors.",
    );
  } else if (injectionMatches.length > 0) {
    if (decision === "allow") {
      decision = "requires_approval";
      risk = "approval-required";
    }
    reasons.push("Sentinel detected prompt-injection or approval-bypass language.");
  }

  if (params.action.dataTouched.some((item) => /biometric|voiceprint|face embedding|camera frames/i.test(item)) && decision === "allow") {
    decision = "requires_approval";
    risk = "approval-required";
    reasons.push("Sentinel requires owner approval for identity or biometric-adjacent data.");
  }

  const reviewedDecision: PolicyDecision = {
    actionId: params.action.id,
    decision,
    risk,
    reasons: [
      ...new Set(
        policyDecision.decision === "allow" && decision !== "allow"
          ? reasons.filter((reason) => !/^Action is local, reversible/i.test(reason))
          : reasons,
      ),
    ],
  };

  return {
    id: `sentinel-${params.action.id}`,
    agentId: "sentinel",
    actionId: params.action.id,
    verdict: reviewedDecision.decision,
    risk: reviewedDecision.risk,
    reasons: reviewedDecision.reasons,
    matchedSignals: [...protectedMatches, ...injectionMatches],
    createdAt: params.createdAt ?? new Date().toISOString(),
    decision: reviewedDecision,
  };
}

export function sentinelReviewPrompt(params: {
  prompt: string;
  actionId: string;
  privacyMode: PrivacyMode;
  allowedConnectors: string[];
  createdAt?: string;
}): SentinelReview {
  const protectedMatches = matchedSignals(params.prompt, PROTECTED_CORE_SIGNALS);
  const action: ActionRequest = {
    id: params.actionId,
    title: "Sentinel prompt review",
    category: protectedMatches.length >= 2 ? "protected-core-access" : "read-local",
    target: "runtime prompt",
    reason: "Review user prompt before it reaches runtime agents.",
    agentId: "sentinel",
    dataTouched: ["prompt", "policy context"],
  };
  return sentinelReviewAction({
    action,
    privacyMode: params.privacyMode,
    allowedConnectors: params.allowedConnectors,
    prompt: params.prompt,
    createdAt: params.createdAt,
  });
}

function matchedSignals(text: string, signals: ReadonlyArray<{ id: string; pattern: RegExp }>): string[] {
  return signals.filter((signal) => signal.pattern.test(text)).map((signal) => signal.id);
}
