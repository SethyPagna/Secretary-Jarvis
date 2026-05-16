import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Conversation, TaskEvent, TaskQueueItem, TaskRun } from "@jarvis/core";
import { JarvisStore } from "../src/store.js";

const createdAt = "2026-05-16T13:45:00.000Z";

describe("JarvisStore task queue orchestration", () => {
  let tempRoot: string;
  let store: JarvisStore;

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), "jarvis-queue-"));
    store = new JarvisStore(join(tempRoot, "jarvis.sqlite"));
  });

  afterEach(() => {
    store.close();
    rmSync(tempRoot, { recursive: true, force: true });
  });

  it("keeps accepting queued work while another task is running", () => {
    const conversation: Conversation = {
      id: "conversation-queue",
      title: "Queue while running",
      createdAt,
      updatedAt: createdAt,
      summary: "Queue test",
      tokenBudget: 16384,
    };
    const runningTask: TaskRun = {
      id: "task-running",
      conversationId: conversation.id,
      title: "Research local models",
      status: "running",
      activeAgentId: "daedalus",
      taskProfile: "research",
      createdAt,
      updatedAt: createdAt,
    };
    const queuedTask: TaskRun = {
      ...runningTask,
      id: "task-queued",
      title: "Prepare follow-up summary",
      status: "queued",
      activeAgentId: "jarvis",
      taskProfile: "daily-assistant",
      updatedAt: "2026-05-16T13:45:02.000Z",
    };
    const queueItems: TaskQueueItem[] = [
      { taskId: runningTask.id, status: "running", priority: 10, enqueuedAt: createdAt, startedAt: createdAt },
      { taskId: queuedTask.id, status: "queued", priority: 5, enqueuedAt: "2026-05-16T13:45:02.000Z" },
    ];

    store.upsertConversation(conversation);
    store.upsertTask(runningTask);
    store.upsertTask(queuedTask);
    queueItems.forEach((item) => store.upsertQueueItem(item));

    expect(store.listTasks().map((task) => task.status)).toEqual(expect.arrayContaining(["running", "queued"]));
    expect(store.listQueue()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ taskId: "task-running", status: "running" }),
        expect.objectContaining({ taskId: "task-queued", status: "queued" }),
      ]),
    );
  });

  it("persists interruption checkpoints and exposes them on the timeline", () => {
    store.upsertConversation({
      id: "conversation-queue",
      title: "Queue checkpoint",
      createdAt,
      updatedAt: createdAt,
      summary: "Checkpoint conversation",
      tokenBudget: 16384,
    });
    const task: TaskRun = {
      id: "task-interrupt",
      conversationId: "conversation-queue",
      title: "Long running coding job",
      status: "checkpointed",
      activeAgentId: "daedalus",
      taskProfile: "coding",
      createdAt,
      updatedAt: "2026-05-16T13:46:00.000Z",
      checkpoint: "Soft interrupt: saved current plan before user steering.",
    };
    const event: TaskEvent = {
      id: "task-event-checkpoint",
      taskId: task.id,
      kind: "checkpoint",
      message: "Soft interrupt checkpoint saved before resuming with new instructions.",
      createdAt: task.updatedAt,
      payload: { policy: "soft-steer" },
    };

    store.upsertTask(task);
    store.addTaskEvent(event);

    expect(store.getTask(task.id)).toMatchObject({
      status: "checkpointed",
      checkpoint: expect.stringContaining("Soft interrupt"),
    });
    expect(store.listTaskEvents(task.id)).toEqual([event]);
    expect(store.searchTimelineEvents("Soft interrupt checkpoint", 5)[0]).toMatchObject({
      kind: "task-checkpoint",
      reversible: true,
      status: "checkpointed",
      relatedTaskId: task.id,
    });
  });
});
