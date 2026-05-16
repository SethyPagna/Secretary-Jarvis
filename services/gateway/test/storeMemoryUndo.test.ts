import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Conversation, ConversationTurn, MemoryWrite, UndoJournalEntry } from "@jarvis/core";
import { JarvisStore } from "../src/store.js";

const now = "2026-05-16T13:20:00.000Z";

describe("JarvisStore MemoryOS and undo journal", () => {
  let tempRoot: string;
  let store: JarvisStore;

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), "jarvis-store-"));
    store = new JarvisStore(join(tempRoot, "jarvis.sqlite"));
  });

  afterEach(() => {
    store.close();
    rmSync(tempRoot, { recursive: true, force: true });
  });

  it("persists conversation turns and mirrors them into the timeline", () => {
    const conversation: Conversation = {
      id: "conversation-memory-test",
      title: "Memory test",
      createdAt: now,
      updatedAt: now,
      summary: "A test conversation for long memory.",
      tokenBudget: 8192,
    };
    const userTurn: ConversationTurn = {
      id: "turn-user",
      conversationId: conversation.id,
      role: "user",
      content: "Remember that the owner prefers concise HUD summaries.",
      createdAt: now,
      tokenEstimate: 12,
    };
    const assistantTurn: ConversationTurn = {
      id: "turn-assistant",
      conversationId: conversation.id,
      role: "assistant",
      content: "Noted. I will keep HUD responses concise by default.",
      createdAt: "2026-05-16T13:20:02.000Z",
      tokenEstimate: 11,
    };

    store.upsertConversation(conversation);
    store.addTurn(userTurn);
    store.addTurn(assistantTurn);

    expect(store.getConversation(conversation.id)).toMatchObject({
      id: conversation.id,
      summary: conversation.summary,
    });
    expect(store.listTurns(conversation.id).map((turn) => turn.id)).toEqual(["turn-user", "turn-assistant"]);
    expect(store.searchTimelineEvents("concise HUD", 10)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "conversation",
          relatedConversationId: conversation.id,
          status: "remembered",
        }),
      ]),
    );
  });

  it("promotes memory writes into searchable records and timeline events", () => {
    const write: MemoryWrite = {
      id: "memory-preference-1",
      conversationId: "conversation-memory-test",
      kind: "semantic",
      content: "Owner preference: Jarvis should answer with a compact first response and expand details only on request.",
      importance: 0.94,
      createdAt: now,
      tags: ["preference", "hud", "summary"],
    };

    store.addMemoryWrite(write);

    expect(store.listMemoryWrites(5)).toEqual([write]);
    expect(store.searchMemoryRecords("compact first response", 5)[0]).toMatchObject({
      id: "record-memory-preference-1",
      layer: "semantic",
      kind: "semantic",
      tags: write.tags,
    });
    expect(store.searchTimelineEvents("compact first response", 5)[0]).toMatchObject({
      kind: "memory-write",
      source: "memory",
      status: "remembered",
    });
  });

  it("keeps active undo checkpoints available within the 20-minute window", () => {
    const entry: UndoJournalEntry = {
      id: "undo-active",
      actionId: "action-edit-file",
      label: "Edit config",
      target: join(tempRoot, "config.yaml"),
      reversible: true,
      status: "available",
      createdAt: now,
      expiresAt: "2026-05-16T13:40:00.000Z",
      rollbackNote: "Jarvis can restore this file content for 20 minutes.",
      snapshotSummary: "File checkpoint captured.",
      snapshot: {
        kind: "file-content",
        path: join(tempRoot, "config.yaml"),
        sizeBytes: 14,
        sha256: "fixture",
        contentBase64: Buffer.from("before: true\n").toString("base64"),
        capturedAt: now,
      },
      operation: {
        kind: "write-local",
        command: "edit config.yaml",
        dryRunOnly: false,
        restoreStrategy: "copy-back",
      },
    };

    store.addUndoJournalEntry(entry);

    expect(store.getUndoJournalEntry("action-edit-file")).toMatchObject({
      id: "undo-active",
      status: "available",
      operation: expect.objectContaining({ restoreStrategy: "copy-back" }),
      snapshot: expect.objectContaining({ kind: "file-content" }),
    });
  });

  it("marks expired undo checkpoints as expired when read", () => {
    const entry: UndoJournalEntry = {
      id: "undo-expired",
      actionId: "action-old-edit",
      label: "Old edit",
      target: join(tempRoot, "old.txt"),
      reversible: true,
      status: "available",
      createdAt: "2000-01-01T00:00:00.000Z",
      expiresAt: "2000-01-01T00:20:00.000Z",
      rollbackNote: "Expired checkpoint.",
      snapshotSummary: "Expired file checkpoint.",
      snapshot: { kind: "state-marker", path: join(tempRoot, "old.txt"), capturedAt: "2000-01-01T00:00:00.000Z" },
      operation: {
        kind: "write-local",
        command: "edit old.txt",
        dryRunOnly: false,
        restoreStrategy: "state-marker",
      },
    };

    store.addUndoJournalEntry(entry);

    expect(store.getUndoJournalEntry("undo-expired")?.status).toBe("expired");
    expect(store.listUndoJournal(5).find((item) => item.id === "undo-expired")?.status).toBe("expired");
  });
});
