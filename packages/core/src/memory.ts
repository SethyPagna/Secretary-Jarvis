import type { Conversation, ConversationTurn, MemoryEvent, MemoryKind, MemoryWrite, TaskStatus } from "./types.js";

export type MemoryLayer = "short-term" | "episodic" | "semantic" | "preference" | "project" | "identity";

export type TimelineEventKind =
  | "conversation"
  | "memory-write"
  | "task-checkpoint"
  | "decision"
  | "approval"
  | "model-choice"
  | "file-change"
  | "device-event"
  | "sensor-event"
  | "undo";

export interface MemoryRecord {
  id: string;
  layer: MemoryLayer;
  kind: MemoryKind;
  title: string;
  content: string;
  source: string;
  confidence: number;
  importance: number;
  tags: string[];
  createdAt: string;
  lastAccessedAt?: string;
  expiresAt?: string;
  supersedesMemoryId?: string;
}

export interface TimelineEvent {
  id: string;
  kind: TimelineEventKind;
  title: string;
  summary: string;
  occurredAt: string;
  source: "conversation" | "agent" | "connector" | "system" | "memory" | "owner";
  reversible: boolean;
  undoEntryId?: string;
  relatedConversationId?: string;
  relatedTaskId?: string;
  status?: TaskStatus | "remembered" | "approved" | "blocked" | "restored";
  tags: string[];
}

export interface MemorySearchQuery {
  query: string;
  layers?: MemoryLayer[];
  kinds?: MemoryKind[];
  tags?: string[];
  limit: number;
  includeTimeline: boolean;
}

export interface MemorySearchResult {
  memories: MemoryRecord[];
  timeline: TimelineEvent[];
  conversations: Conversation[];
  turns: ConversationTurn[];
}

export interface MemoryConsolidationJob {
  id: string;
  status: "queued" | "running" | "completed" | "failed";
  windowStart: string;
  windowEnd: string;
  promotedMemoryIds: string[];
  contradictionCount: number;
  staleMemoryCount: number;
  summary: string;
}

export interface ConversationMemoryBundle {
  conversation: Conversation;
  recentTurns: ConversationTurn[];
  recalledMemories: MemoryRecord[];
  pendingWrites: MemoryWrite[];
  promptBudgetTokens: number;
}

export function createTimelineEvent(input: Omit<TimelineEvent, "id" | "occurredAt"> & { id?: string; occurredAt?: string }): TimelineEvent {
  return {
    id: input.id ?? `timeline-${Date.now().toString(36)}`,
    occurredAt: input.occurredAt ?? new Date().toISOString(),
    kind: input.kind,
    title: input.title,
    summary: input.summary,
    source: input.source,
    reversible: input.reversible,
    undoEntryId: input.undoEntryId,
    relatedConversationId: input.relatedConversationId,
    relatedTaskId: input.relatedTaskId,
    status: input.status,
    tags: input.tags,
  };
}

export type { Conversation, ConversationTurn, MemoryEvent, MemoryKind, MemoryWrite };
