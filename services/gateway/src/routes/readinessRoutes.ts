import type { JarvisStatus } from "@jarvis/core";
import { buildArchitectureMap } from "../architectureMap.js";
import { buildAuthorityReadiness } from "../authorityReadiness.js";
import { buildCodeHealthReport } from "../codeHealth.js";
import { setupDoctor } from "../doctor.js";
import { buildStartupReadiness } from "../startupReadiness.js";

type SendJson = (statusCode: number, body: unknown) => void;

export function tryHandleReadinessRoute(params: {
  method: string | undefined;
  pathname: string;
  status: JarvisStatus;
  voiceAssetRoot: string;
  root: string;
  now: () => string;
  sendJson: SendJson;
}): boolean {
  if (params.method !== "GET") {
    return false;
  }

  if (params.pathname === "/api/health") {
    params.sendJson(200, {
      ok: true,
      privacyMode: params.status.privacyMode,
      activeModelId: params.status.activeModelId,
      localOnly: params.status.privacyMode === "strict-local",
      timestamp: params.now(),
    });
    return true;
  }

  if (params.pathname === "/api/architecture/map") {
    params.sendJson(200, {
      architecture: buildArchitectureMap(params.now()),
      note: "Local architecture map for language boundaries, runtime hierarchy, optimization backlog, and hardening review.",
    });
    return true;
  }

  if (params.pathname === "/api/architecture/code-health") {
    params.sendJson(200, {
      codeHealth: buildCodeHealthReport({
        root: params.root,
        generatedAt: params.now(),
      }),
      note: "Local code-health scan for cleanup planning. Findings are review hints, not deletion instructions.",
    });
    return true;
  }

  if (params.pathname === "/api/runtime/startup-readiness") {
    params.sendJson(200, {
      startup: buildStartupReadiness({
        root: params.root,
        generatedAt: params.now(),
      }),
      note: "Read-only Windows startup/background readiness. This endpoint does not register tasks or elevate privileges.",
    });
    return true;
  }

  if (params.pathname === "/api/security/authority-readiness") {
    const generatedAt = params.now();
    const startup = buildStartupReadiness({
      root: params.root,
      generatedAt,
    });
    params.sendJson(200, {
      authority: buildAuthorityReadiness({
        generatedAt,
        privacyMode: params.status.privacyMode,
        startup,
      }),
      note: "Authority hierarchy and approval rules for high-trust local control. This endpoint is read-only.",
    });
    return true;
  }

  if (params.pathname === "/api/setup/doctor") {
    params.sendJson(200, setupDoctor({ privacyMode: params.status.privacyMode, voiceAssetRoot: params.voiceAssetRoot }));
    return true;
  }

  return false;
}
