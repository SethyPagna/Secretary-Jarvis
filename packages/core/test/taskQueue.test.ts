import { describe, expect, it } from "vitest";
import { applyTaskStatus, canTransitionTaskStatus, createSteeringEvent, taskEvent, type TaskRun } from "../src/index.js";

const baseTask: TaskRun = {
  id: "task-1",
  conversationId: "conversation-1",
  title: "Research local AI models",
  status: "running",
  activeAgentId: "planner",
  taskProfile: "research",
  createdAt: "2026-05-14T00:00:00.000Z",
  updatedAt: "2026-05-14T00:00:00.000Z",
};

describe("task queue transitions", () => {
  it("allows a running task to pause for soft steering", () => {
    const paused = applyTaskStatus(baseTask, "paused", "2026-05-14T00:01:00.000Z");

    expect(paused.status).toBe("paused");
    expect(paused.updatedAt).toBe("2026-05-14T00:01:00.000Z");
  });

  it("supports soft checkpoint interruption and resume", () => {
    expect(canTransitionTaskStatus("running", "checkpointed")).toBe(true);
    expect(canTransitionTaskStatus("checkpointed", "running")).toBe(true);

    const checkpointed = {
      ...applyTaskStatus(baseTask, "checkpointed", "2026-05-14T00:03:00.000Z"),
      checkpoint: "Paused at a safe checkpoint for user steering.",
    };
    const resumed = applyTaskStatus(checkpointed, "running", "2026-05-14T00:04:00.000Z");

    expect(checkpointed.checkpoint).toContain("safe checkpoint");
    expect(resumed.status).toBe("running");
    expect(resumed.checkpoint).toBe(checkpointed.checkpoint);
  });

  it("allows waiting approval tasks to resume or checkpoint but not complete directly", () => {
    expect(canTransitionTaskStatus("waiting-approval", "running")).toBe(true);
    expect(canTransitionTaskStatus("waiting-approval", "checkpointed")).toBe(true);
    expect(canTransitionTaskStatus("waiting-approval", "completed")).toBe(false);
  });

  it("blocks completed tasks from being resumed", () => {
    const completed = { ...baseTask, status: "completed" as const };

    expect(() => applyTaskStatus(completed, "running", "2026-05-14T00:01:00.000Z")).toThrow(
      "Invalid task transition",
    );
  });
});

describe("steering events", () => {
  it("defaults to soft steer and trims the instruction", () => {
    const steer = createSteeringEvent({
      id: "steer-1",
      taskId: "task-1",
      instruction: "  focus on free tools  ",
      createdAt: "2026-05-14T00:02:00.000Z",
    });

    expect(steer.policy).toBe("soft-steer");
    expect(steer.instruction).toBe("focus on free tools");
  });

  it("records steer and checkpoint task events with payloads", () => {
    expect(
      taskEvent({
        id: "task-event-steer",
        taskId: "task-1",
        kind: "steered",
        message: "User steered the active task.",
        createdAt: "2026-05-14T00:05:00.000Z",
        payload: { instruction: "prioritize local tools" },
      }),
    ).toMatchObject({
      kind: "steered",
      payload: { instruction: "prioritize local tools" },
    });
    expect(
      taskEvent({
        id: "task-event-checkpoint",
        taskId: "task-1",
        kind: "checkpoint",
        message: "Checkpoint saved before interruption.",
        createdAt: "2026-05-14T00:06:00.000Z",
      }),
    ).toMatchObject({
      kind: "checkpoint",
      message: "Checkpoint saved before interruption.",
    });
  });
});
