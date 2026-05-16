import type { ActionRequest, RuntimeConstellation, RuntimeSmokeStatus, RuntimeServicesStatus } from "@jarvis/core";
import { buildRuntimeEventHealth } from "../eventHealth.js";
import type { JarvisStore } from "../store.js";

type SendJson = (statusCode: number, body: unknown) => void;

export function tryHandleRuntimeSummaryRoute(params: {
  method: string | undefined;
  pathname: string;
  now: () => string;
  sendJson: SendJson;
  runtimeConstellation: () => RuntimeConstellation;
  runtimeSmokeStatus: () => RuntimeSmokeStatus | null;
  runtimeServicesStatus: () => Promise<RuntimeServicesStatus>;
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
