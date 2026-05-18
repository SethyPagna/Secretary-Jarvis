import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ActionRequest } from "@jarvis/core";
import { PermissionStore, permissionKeyForAction } from "../src/permissionStore.js";

describe("permission store", () => {
  let tempRoot: string;
  let permissionPath: string;

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), "jarvis-permissions-"));
    permissionPath = join(tempRoot, ".jarvis", "permissions.json");
  });

  afterEach(() => {
    rmSync(tempRoot, { recursive: true, force: true });
  });

  it("persists exact capability-scoped approval grants", () => {
    const store = new PermissionStore(permissionPath);
    const action = actionRequest({ category: "sensor-capture", target: "screen timeline", connectorId: "screen" });

    const record = store.rememberDecision(action, "granted", "2026-05-18T08:00:00.000Z");
    const reloaded = new PermissionStore(permissionPath);

    expect(record.key).toBe(permissionKeyForAction(action));
    expect(reloaded.isRememberedGrant(action)).toBe(true);
    expect(reloaded.isRememberedGrant({ ...action, target: "camera timeline" })).toBe(false);
    expect(reloaded.snapshot().records[0]).toMatchObject({
      category: "sensor-capture",
      target: "screen timeline",
      status: "granted",
      remember: true,
      connectorId: "screen",
    });
    expect(existsSync(permissionPath)).toBe(true);
  });

  it("does not auto-allow denied or high-risk protected actions", () => {
    const store = new PermissionStore(permissionPath);
    const protectedAction = actionRequest({ category: "protected-core-access", target: "core safeguards" });
    const deniedAction = actionRequest({ category: "send-message", target: "email to team", connectorId: "email" });

    store.rememberDecision(protectedAction, "granted", "2026-05-18T08:01:00.000Z");
    store.rememberDecision(deniedAction, "denied", "2026-05-18T08:02:00.000Z");

    expect(store.isRememberedGrant(protectedAction)).toBe(false);
    expect(store.isRememberedGrant(deniedAction)).toBe(false);
    expect(store.snapshot().records).toHaveLength(2);
  });

  it("recovers from corrupt permission JSON with a clean local file", () => {
    mkdirSync(join(tempRoot, ".jarvis"), { recursive: true });
    writeFileSync(permissionPath, "{not-json", "utf8");

    const store = new PermissionStore(permissionPath);

    expect(store.snapshot().records).toEqual([]);
    expect(JSON.parse(readFileSync(permissionPath, "utf8"))).toMatchObject({ version: 1, records: [] });
  });
});

function actionRequest(overrides: Partial<ActionRequest>): ActionRequest {
  return {
    id: "approval-test",
    title: "Test approval",
    category: "sensor-capture",
    target: "screen timeline",
    reason: "test",
    dataTouched: ["screen"],
    ...overrides,
  };
}
