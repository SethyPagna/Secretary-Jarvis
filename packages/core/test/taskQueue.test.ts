import { describe, expect, it } from "vitest";
import { applyTaskStatus, createSteeringEvent, type TaskRun } from "../src/index.js";

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
});
