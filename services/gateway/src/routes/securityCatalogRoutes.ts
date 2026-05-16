import { allowedLocalActions, type JarvisStatus } from "@jarvis/core";

type SendJson = (statusCode: number, body: unknown) => void;

export function tryHandleSecurityCatalogRoute(params: {
  method: string | undefined;
  pathname: string;
  status: JarvisStatus;
  sendJson: SendJson;
}): boolean {
  if (params.method !== "GET") {
    return false;
  }

  if (params.pathname === "/api/security/status") {
    params.sendJson(200, {
      protectedCore: params.status.protectedCore,
      privacyMode: params.status.privacyMode,
      sentinel: params.status.agentSouls?.find((soul) => soul.id === "sentinel"),
      blockedCategories: ["network", "protected-core-access"],
      approvalCategories: [
        "delete-local",
        "send-message",
        "post-social",
        "purchase",
        "credential-access",
        "device-control",
        "model-download",
        "sensor-capture",
        "irreversible-edit",
      ],
    });
    return true;
  }

  if (params.pathname === "/api/system/actions") {
    params.sendJson(200, {
      actions: allowedLocalActions,
      count: allowedLocalActions.length,
      privacyMode: params.status.privacyMode,
      mode: "approved-admin",
      defaults: {
        approvalRequired: allowedLocalActions.filter((action) => action.approval === "requires_approval").map((action) => action.id),
        localOnly: true,
        undoWindowMinutes: 20,
      },
    });
    return true;
  }

  return false;
}
