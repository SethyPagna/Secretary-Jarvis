import { describe, expect, it } from "vitest";
import {
  classifySystemCommand,
  createSystemActionDraft,
  createUndoJournalEntry,
  isReversibleSystemCommand,
  restoreStrategyForSystemCommand,
} from "../src/index.js";

const createdAt = "2026-05-14T12:00:00.000Z";
const expiresAt = "2026-05-14T12:20:00.000Z";

describe("system action undo helpers", () => {
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
