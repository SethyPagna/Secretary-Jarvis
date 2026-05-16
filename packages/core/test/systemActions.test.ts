import { describe, expect, it } from "vitest";
import {
  allowedLocalActions,
  classifySystemCommand,
  createSystemActionDraft,
  createUndoJournalEntry,
  findLocalActionDefinition,
  isReversibleSystemCommand,
  localActionsForCategory,
  restoreStrategyForSystemCommand,
} from "../src/index.js";

const createdAt = "2026-05-14T12:00:00.000Z";
const expiresAt = "2026-05-14T12:20:00.000Z";

describe("system action undo helpers", () => {
  it("defines the full high-trust local action catalog", () => {
    const ids = new Set(allowedLocalActions.map((action) => action.id));

    expect(Array.from(ids)).toEqual(
      expect.arrayContaining([
        "inspect-system-state",
        "read-approved-folder",
        "open-local-app",
        "control-window",
        "control-audio-output",
        "create-folder",
        "copy-file",
        "move-file",
        "edit-file",
        "delete-file",
        "run-approved-script",
        "control-service",
        "launch-model-runtime",
        "organize-folder",
        "read-local-docs",
      ]),
    );
  });

  it("keeps risky local actions approval-gated and guarded with undo metadata", () => {
    const riskyActions = allowedLocalActions.filter((action) => action.risk === "owner-approved" || action.risk === "admin-approved");

    expect(riskyActions.length).toBeGreaterThan(0);
    for (const action of riskyActions) {
      expect(action.approval).toBe("requires_approval");
      expect(action.safeguards.length).toBeGreaterThan(0);
      if (action.reversible) {
        expect(action.rollback).not.toBe("none");
      }
    }
  });

  it("finds catalog definitions by id, label, and command intent", () => {
    expect(findLocalActionDefinition("open-local-app")?.id).toBe("open-local-app");
    expect(findLocalActionDefinition("Control audio output")?.id).toBe("control-audio-output");
    expect(findLocalActionDefinition("please organize Downloads")?.id).toBe("organize-folder");
    expect(localActionsForCategory("service-control").map((action) => action.id)).toEqual(
      expect.arrayContaining(["control-service", "launch-model-runtime"]),
    );
  });

  it("classifies folder organization as a reversible move-back operation", () => {
    const command = "organize my downloads by moving files into folders";
    const category = classifySystemCommand(command);

    expect(category).toBe("write-local");
    expect(isReversibleSystemCommand(category, command)).toBe(true);
    expect(restoreStrategyForSystemCommand(category, command)).toBe("move-back");
  });

  it("classifies app launches as non-reversible local control", () => {
    const command = "open Steam";
    const category = classifySystemCommand(command);

    expect(category).toBe("app-control");
    expect(isReversibleSystemCommand(category, command)).toBe(false);
    expect(restoreStrategyForSystemCommand(category, command)).toBe("none");
  });

  it("classifies local speaker changes as safe device control", () => {
    const command = "set volume to 50%";
    const category = classifySystemCommand(command);

    expect(category).toBe("device-control");
    expect(isReversibleSystemCommand(category, command)).toBe(false);
    expect(findLocalActionDefinition(command)?.approval).toBe("allow");
  });

  it("creates a 20-minute undo journal entry for reversible actions", () => {
    const action = createSystemActionDraft({
      id: "system-action-1",
      label: "Organize Downloads",
      command: "organize my downloads by moving files into folders",
      target: "C:\\Users\\user\\Downloads",
      createdAt,
      expiresAt,
      decision: {
        decision: "requires_approval",
        risk: "approval-required",
        reasons: ["write-local"],
      },
      actionRequest: {
        id: "system-action-1",
        title: "Organize Downloads",
        category: "write-local",
        target: "C:\\Users\\user\\Downloads",
        reason: "User requested file organization",
        connectorId: "filesystem",
        dataTouched: ["downloads"],
      },
    });

    const entry = createUndoJournalEntry({
      id: "undo-1",
      action,
      createdAt,
    });

    expect(entry.status).toBe("available");
    expect(entry.expiresAt).toBe(expiresAt);
    expect(entry.operation).toEqual({
      kind: "write-local",
      command: action.command,
      dryRunOnly: true,
      restoreStrategy: "move-back",
    });
  });
});
