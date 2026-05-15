import type {
  ActionRequest,
  OutboundMessageDraft,
  PolicyDecision,
} from "./types.js";

export function createOutboundMessageDraft(params: {
  id: string;
  connectorId: string;
  recipient: string;
  channel: string;
  content: string;
  createdAt: string;
  decision: PolicyDecision;
  action: ActionRequest;
}): OutboundMessageDraft {
  return {
    id: params.id,
    connectorId: params.connectorId,
    recipient: params.recipient,
    channel: params.channel,
    content: params.content.trim(),
    createdAt: params.createdAt,
    status: params.decision.decision === "deny" ? "blocked" : "waiting-approval",
    approvalActionId: params.action.id,
    rollback: "none",
    auditSummary: `Drafted ${params.channel} message for ${params.recipient}; no live send performed.`,
  };
}
