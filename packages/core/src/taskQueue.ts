import type { InterruptPolicy, SteeringEvent, TaskEvent, TaskRun, TaskStatus } from "./types.js";

export function canTransitionTaskStatus(from: TaskStatus, to: TaskStatus): boolean {
  if (from === to) {
    return true;
  }

  const allowed: Record<TaskStatus, TaskStatus[]> = {
    queued: ["running", "cancelled"],
    running: ["paused", "waiting-approval", "completed", "failed", "cancelled"],
    paused: ["running", "cancelled"],
    "waiting-approval": ["running", "cancelled"],
    completed: [],
    failed: [],
    cancelled: [],
  };

  return allowed[from].includes(to);
}

export function applyTaskStatus(task: TaskRun, nextStatus: TaskStatus, updatedAt: string): TaskRun {
  if (!canTransitionTaskStatus(task.status, nextStatus)) {
    throw new Error(`Invalid task transition from ${task.status} to ${nextStatus}`);
  }

  return {
    ...task,
    status: nextStatus,
    updatedAt,
  };
}

export function createSteeringEvent(params: {
  id: string;
  taskId: string;
  instruction: string;
  policy?: InterruptPolicy;
  createdAt: string;
}): SteeringEvent {
  const instruction = params.instruction.trim();
  if (instruction.length === 0) {
    throw new Error("Steering instruction cannot be empty");
  }

  return {
    id: params.id,
    taskId: params.taskId,
    instruction,
    policy: params.policy ?? "soft-steer",
    createdAt: params.createdAt,
  };
}

export function taskEvent(params: {
  id: string;
  taskId: string;
  kind: TaskEvent["kind"];
  message: string;
  createdAt: string;
  payload?: Record<string, unknown>;
}): TaskEvent {
  return {
    id: params.id,
    taskId: params.taskId,
    kind: params.kind,
    message: params.message,
    createdAt: params.createdAt,
    payload: params.payload,
  };
}
