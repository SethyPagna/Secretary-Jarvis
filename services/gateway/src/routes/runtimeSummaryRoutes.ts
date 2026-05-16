import type { ActionRequest, RuntimeConstellation, RuntimeSmokeStatus, RuntimeServicesStatus } from "@jarvis/core";
import type { AgentManagerReadiness } from "../agentManagerReadiness.js";
import { buildRuntimeEventHealth } from "../eventHealth.js";
import type { InteractionHealth } from "../interactionHealth.js";
import type { PackagingReadiness } from "../packagingReadiness.js";
import type { ProcessVisibilityStatus } from "../processVisibility.js";
import type { RuntimeSelfTest } from "../runtimeSelfTest.js";
import type { StartupRegistrationPlansManifest } from "../startupRegistrationPlans.js";
import type { JarvisStore } from "../store.js";
import type { WakeRuntimeActivationReadiness } from "../wakeRuntimeActivation.js";

type SendJson = (statusCode: number, body: unknown) => void;

export function tryHandleRuntimeSummaryRoute(params: {
  method: string | undefined;
  pathname: string;
  now: () => string;
  sendJson: SendJson;
  runtimeConstellation: () => RuntimeConstellation;
  runtimeSmokeStatus: () => RuntimeSmokeStatus | null;
  runtimeServicesStatus: () => Promise<RuntimeServicesStatus>;
  packagingReadiness?: () => PackagingReadiness;
  processVisibilityStatus?: () => ProcessVisibilityStatus;
  startupRegistrationPlans?: () => StartupRegistrationPlansManifest;
  wakeRuntimeActivation?: () => WakeRuntimeActivationReadiness;
  agentManagerReadiness?: () => AgentManagerReadiness;
  interactionHealth?: () => InteractionHealth;
  runtimeSelfTest?: () => Promise<RuntimeSelfTest> | RuntimeSelfTest;
  store: JarvisStore;
  approvals: ActionRequest[];
}): Promise<boolean> | boolean {
  if (params.method !== "GET") {
    return false;
  }

  if (params.pathname === "/api/runtime/constellation") {
    params.sendJson(200, { constellation: params.runtimeConstellation() });
    return true;
  }

  if (params.pathname === "/api/runtime/smoke-status") {
    params.sendJson(200, { smoke: params.runtimeSmokeStatus() });
    return true;
  }

  if (params.pathname === "/api/runtime/services") {
    return params.runtimeServicesStatus().then((runtime) => {
      params.sendJson(200, { runtime });
      return true;
    });
  }

  if (params.pathname === "/api/runtime/process-visibility" && params.processVisibilityStatus) {
    params.sendJson(200, { visibility: params.processVisibilityStatus() });
    return true;
  }

  if (params.pathname === "/api/runtime/packaging-readiness" && params.packagingReadiness) {
    params.sendJson(200, { packaging: params.packagingReadiness() });
    return true;
  }

  if (params.pathname === "/api/runtime/activation-readiness" && params.wakeRuntimeActivation) {
    params.sendJson(200, { activation: params.wakeRuntimeActivation() });
    return true;
  }

  if (params.pathname === "/api/agents/manager-readiness" && params.agentManagerReadiness) {
    params.sendJson(200, { manager: params.agentManagerReadiness() });
    return true;
  }

  if (params.pathname === "/api/runtime/interaction-health" && params.interactionHealth) {
    params.sendJson(200, { interaction: params.interactionHealth() });
    return true;
  }

  if (params.pathname === "/api/runtime/self-test" && params.runtimeSelfTest) {
    return Promise.resolve(params.runtimeSelfTest()).then((selfTest) => {
      params.sendJson(200, { selfTest });
      return true;
    });
  }

  if (params.pathname === "/api/runtime/startup-registration-plans" && params.startupRegistrationPlans) {
    params.sendJson(200, { manifest: params.startupRegistrationPlans() });
    return true;
  }

  if (params.pathname === "/api/runtime/event-health") {
    params.sendJson(200, {
      health: buildRuntimeEventHealth({
        checkedAt: params.now(),
        tasks: params.store.listTasks(),
        queue: params.store.listQueue(),
        approvals: params.approvals,
        timeline: params.store.listTimelineEvents(40),
        workflowRuns: params.store.listWorkflowRuns(40),
      }),
    });
    return true;
  }

  return false;
}
