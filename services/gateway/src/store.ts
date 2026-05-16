import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type {
  Conversation,
  ConversationTurn,
  MemoryRecord,
  MemoryWrite,
  TaskEvent,
  TaskQueueItem,
  TaskRun,
  TimelineEvent,
  UndoJournalEntry,
} from "@jarvis/core";

const DEFAULT_DB_PATH = join(process.cwd(), "data", "jarvis.sqlite");

export class JarvisStore {
  private readonly db: DatabaseSync;

  constructor(dbPath = process.env.JARVIS_DB_PATH ?? DEFAULT_DB_PATH) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec("PRAGMA journal_mode = WAL");
    this.db.exec("PRAGMA foreign_keys = ON");
    this.migrate();
  }

  close(): void {
    this.db.close();
  }

  createConversation(conversation: Conversation): void {
    this.db
      .prepare(
        `INSERT INTO conversations (id, title, created_at, updated_at, summary, token_budget)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        conversation.id,
        conversation.title,
        conversation.createdAt,
        conversation.updatedAt,
        conversation.summary,
        conversation.tokenBudget,
      );
  }

  upsertConversation(conversation: Conversation): void {
    this.db
      .prepare(
        `INSERT INTO conversations (id, title, created_at, updated_at, summary, token_budget)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           title = excluded.title,
           updated_at = excluded.updated_at,
           summary = excluded.summary,
           token_budget = excluded.token_budget`,
      )
      .run(
        conversation.id,
        conversation.title,
        conversation.createdAt,
        conversation.updatedAt,
        conversation.summary,
        conversation.tokenBudget,
      );
  }

  getConversation(id: string): Conversation | undefined {
    const row = this.db
      .prepare("SELECT id, title, created_at, updated_at, summary, token_budget FROM conversations WHERE id = ?")
      .get(id) as ConversationRow | undefined;
    return row ? conversationFromRow(row) : undefined;
  }

  listConversations(): Conversation[] {
    const rows = this.db
      .prepare("SELECT id, title, created_at, updated_at, summary, token_budget FROM conversations ORDER BY updated_at DESC")
      .all() as unknown as ConversationRow[];
    return rows.map(conversationFromRow);
  }

  addTurn(turn: ConversationTurn): void {
    this.db
      .prepare(
        `INSERT INTO turns (id, conversation_id, role, content, created_at, task_id, token_estimate)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        turn.id,
        turn.conversationId,
        turn.role,
        turn.content,
        turn.createdAt,
        turn.taskId ?? null,
        turn.tokenEstimate,
      );
    this.addTimelineEvent({
      id: `timeline-turn-${turn.id}`,
      kind: "conversation",
      title: `${turn.role} turn`,
      summary: turn.content.slice(0, 220),
      occurredAt: turn.createdAt,
      source: turn.role === "user" ? "owner" : "conversation",
      reversible: false,
      relatedConversationId: turn.conversationId,
      relatedTaskId: turn.taskId,
      status: "remembered",
      tags: ["conversation", turn.role],
    });
  }

  listTurns(conversationId: string): ConversationTurn[] {
    const rows = this.db
      .prepare(
        `SELECT id, conversation_id, role, content, created_at, task_id, token_estimate
         FROM turns WHERE conversation_id = ? ORDER BY created_at ASC`,
      )
      .all(conversationId) as unknown as TurnRow[];
    return rows.map(turnFromRow);
  }

  listRecentTurns(limit = 24): ConversationTurn[] {
    const rows = this.db
      .prepare(
        `SELECT id, conversation_id, role, content, created_at, task_id, token_estimate
         FROM turns ORDER BY created_at DESC LIMIT ?`,
      )
      .all(limit) as unknown as TurnRow[];
    return rows.map(turnFromRow);
  }

  upsertTask(task: TaskRun): void {
    this.db
      .prepare(
        `INSERT INTO tasks (id, conversation_id, title, status, active_agent_id, task_profile, created_at, updated_at, checkpoint, result)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           status = excluded.status,
           active_agent_id = excluded.active_agent_id,
           updated_at = excluded.updated_at,
           checkpoint = excluded.checkpoint,
           result = excluded.result`,
      )
      .run(
        task.id,
        task.conversationId,
        task.title,
        task.status,
        task.activeAgentId,
        task.taskProfile,
        task.createdAt,
        task.updatedAt,
        task.checkpoint ?? null,
        task.result ?? null,
      );
  }

  getTask(taskId: string): TaskRun | undefined {
    const row = this.db
      .prepare(
        `SELECT id, conversation_id, title, status, active_agent_id, task_profile, created_at, updated_at, checkpoint, result
         FROM tasks WHERE id = ?`,
      )
      .get(taskId) as TaskRow | undefined;
    return row ? taskFromRow(row) : undefined;
  }

  listTasks(): TaskRun[] {
    const rows = this.db
      .prepare(
        `SELECT id, conversation_id, title, status, active_agent_id, task_profile, created_at, updated_at, checkpoint, result
         FROM tasks ORDER BY updated_at DESC LIMIT 100`,
      )
      .all() as unknown as TaskRow[];
    return rows.map(taskFromRow);
  }

  upsertQueueItem(item: TaskQueueItem): void {
    this.db
      .prepare(
        `INSERT INTO queue (task_id, status, priority, enqueued_at, started_at, finished_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(task_id) DO UPDATE SET
           status = excluded.status,
           priority = excluded.priority,
           started_at = excluded.started_at,
           finished_at = excluded.finished_at`,
      )
      .run(item.taskId, item.status, item.priority, item.enqueuedAt, item.startedAt ?? null, item.finishedAt ?? null);
  }

  listQueue(): TaskQueueItem[] {
    const rows = this.db
      .prepare("SELECT task_id, status, priority, enqueued_at, started_at, finished_at FROM queue ORDER BY priority DESC, enqueued_at ASC")
      .all() as unknown as QueueRow[];
    return rows.map(queueFromRow);
  }

  addTaskEvent(event: TaskEvent): void {
    this.db
      .prepare(
        `INSERT INTO task_events (id, task_id, kind, message, created_at, payload_json)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(event.id, event.taskId, event.kind, event.message, event.createdAt, JSON.stringify(event.payload ?? {}));
    this.addTimelineEvent({
      id: `timeline-task-${event.id}`,
      kind: event.kind === "checkpoint" ? "task-checkpoint" : "decision",
      title: `Task ${event.kind}`,
      summary: event.message,
      occurredAt: event.createdAt,
      source: "agent",
      reversible: event.kind === "checkpoint",
      relatedTaskId: event.taskId,
      status: event.kind === "checkpoint" ? "checkpointed" : undefined,
      tags: ["task", event.kind],
    });
  }

  listTaskEvents(taskId: string): TaskEvent[] {
    const rows = this.db
      .prepare("SELECT id, task_id, kind, message, created_at, payload_json FROM task_events WHERE task_id = ? ORDER BY created_at ASC")
      .all(taskId) as unknown as TaskEventRow[];
    return rows.map(taskEventFromRow);
  }

  addMemoryWrite(write: MemoryWrite): void {
    this.db
      .prepare(
        `INSERT INTO memory_writes (id, conversation_id, task_id, kind, content, importance, created_at, tags_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        write.id,
        write.conversationId ?? null,
        write.taskId ?? null,
        write.kind,
        write.content,
        write.importance,
        write.createdAt,
        JSON.stringify(write.tags),
      );
    const layer = memoryLayerForKind(write.kind);
    const title = write.content.split(/[.\n]/)[0]?.trim().slice(0, 96) || `${write.kind} memory`;
    this.upsertMemoryRecord({
      id: `record-${write.id}`,
      layer,
      kind: write.kind,
      title,
      content: write.content,
      source: write.conversationId ? "conversation" : write.taskId ? "agent-task" : "gateway",
      confidence: Math.min(0.98, Math.max(0.5, write.importance)),
      importance: write.importance,
      tags: write.tags,
      createdAt: write.createdAt,
    });
    this.addTimelineEvent({
      id: `timeline-memory-${write.id}`,
      kind: "memory-write",
      title,
      summary: write.content.slice(0, 260),
      occurredAt: write.createdAt,
      source: "memory",
      reversible: false,
      relatedConversationId: write.conversationId,
      relatedTaskId: write.taskId,
      status: "remembered",
      tags: write.tags,
    });
  }

  upsertMemoryRecord(record: MemoryRecord): void {
    this.db
      .prepare(
        `INSERT INTO memory_records (
           id, layer, kind, title, content, source, confidence, importance, tags_json, created_at,
           last_accessed_at, expires_at, supersedes_memory_id, embedding_json
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           layer = excluded.layer,
           kind = excluded.kind,
           title = excluded.title,
           content = excluded.content,
           source = excluded.source,
           confidence = excluded.confidence,
           importance = excluded.importance,
           tags_json = excluded.tags_json,
           last_accessed_at = excluded.last_accessed_at,
           expires_at = excluded.expires_at,
           supersedes_memory_id = excluded.supersedes_memory_id,
           embedding_json = excluded.embedding_json`,
      )
      .run(
        record.id,
        record.layer,
        record.kind,
        record.title,
        record.content,
        record.source,
        record.confidence,
        record.importance,
        JSON.stringify(record.tags),
        record.createdAt,
        record.lastAccessedAt ?? null,
        record.expiresAt ?? null,
        record.supersedesMemoryId ?? null,
        JSON.stringify(localTextEmbedding(`${record.title} ${record.content} ${record.tags.join(" ")}`)),
      );
  }

  listMemoryRecords(limit = 100): MemoryRecord[] {
    const rows = this.db
      .prepare(
        `SELECT id, layer, kind, title, content, source, confidence, importance, tags_json, created_at,
         last_accessed_at, expires_at, supersedes_memory_id, embedding_json
         FROM memory_records ORDER BY importance DESC, created_at DESC LIMIT ?`,
      )
      .all(limit) as unknown as MemoryRecordRow[];
    return rows.map(memoryRecordFromRow);
  }

  searchMemoryRecords(query: string, limit = 40): MemoryRecord[] {
    const queryVector = localTextEmbedding(query);
    return this.listMemoryRecords(500)
      .map((record) => ({
        record,
        score:
          cosineSimilarity(queryVector, localTextEmbedding(`${record.title} ${record.content} ${record.tags.join(" ")}`)) +
          (record.content.toLowerCase().includes(query.toLowerCase()) ? 0.35 : 0) +
          record.importance * 0.1,
      }))
      .sort((left, right) => right.score - left.score)
      .slice(0, limit)
      .map((item) => item.record);
  }

  addTimelineEvent(event: TimelineEvent): void {
    this.db
      .prepare(
        `INSERT INTO timeline_events (
           id, kind, title, summary, occurred_at, source, reversible, undo_entry_id,
           related_conversation_id, related_task_id, status, tags_json
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           title = excluded.title,
           summary = excluded.summary,
           source = excluded.source,
           reversible = excluded.reversible,
           undo_entry_id = excluded.undo_entry_id,
           status = excluded.status,
           tags_json = excluded.tags_json`,
      )
      .run(
        event.id,
        event.kind,
        event.title,
        event.summary,
        event.occurredAt,
        event.source,
        event.reversible ? 1 : 0,
        event.undoEntryId ?? null,
        event.relatedConversationId ?? null,
        event.relatedTaskId ?? null,
        event.status ?? null,
        JSON.stringify(event.tags),
      );
  }

  listTimelineEvents(limit = 120): TimelineEvent[] {
    const rows = this.db
      .prepare(
        `SELECT id, kind, title, summary, occurred_at, source, reversible, undo_entry_id,
         related_conversation_id, related_task_id, status, tags_json
         FROM timeline_events ORDER BY occurred_at DESC LIMIT ?`,
      )
      .all(limit) as unknown as TimelineEventRow[];
    return rows.map(timelineEventFromRow);
  }

  searchTimelineEvents(query: string, limit = 80): TimelineEvent[] {
    const pattern = `%${query}%`;
    const rows = this.db
      .prepare(
        `SELECT id, kind, title, summary, occurred_at, source, reversible, undo_entry_id,
         related_conversation_id, related_task_id, status, tags_json
         FROM timeline_events
         WHERE title LIKE ? OR summary LIKE ? OR tags_json LIKE ? OR kind LIKE ?
         ORDER BY occurred_at DESC LIMIT ?`,
      )
      .all(pattern, pattern, pattern, pattern, limit) as unknown as TimelineEventRow[];
    return rows.map(timelineEventFromRow);
  }

  listMemoryWrites(limit = 100): MemoryWrite[] {
    const rows = this.db
      .prepare(
        `SELECT id, conversation_id, task_id, kind, content, importance, created_at, tags_json
         FROM memory_writes ORDER BY created_at DESC LIMIT ?`,
      )
      .all(limit) as unknown as MemoryWriteRow[];
    return rows.map(memoryWriteFromRow);
  }

  searchMemoryWrites(query: string, limit = 40): MemoryWrite[] {
    const pattern = `%${query}%`;
    const rows = this.db
      .prepare(
        `SELECT id, conversation_id, task_id, kind, content, importance, created_at, tags_json
         FROM memory_writes
         WHERE content LIKE ? OR tags_json LIKE ? OR kind LIKE ?
         ORDER BY importance DESC, created_at DESC
         LIMIT ?`,
      )
      .all(pattern, pattern, pattern, limit) as unknown as MemoryWriteRow[];
    return rows.map(memoryWriteFromRow);
  }

  addUndoJournalEntry(entry: UndoJournalEntry): void {
    this.db
      .prepare(
        `INSERT INTO undo_journal (
           id, action_id, label, target, reversible, status, created_at, expires_at, rollback_note, snapshot_summary, snapshot_json, operation_json
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           status = excluded.status,
           rollback_note = excluded.rollback_note,
           snapshot_summary = excluded.snapshot_summary,
           snapshot_json = excluded.snapshot_json,
           operation_json = excluded.operation_json`,
      )
      .run(
        entry.id,
        entry.actionId,
        entry.label,
        entry.target,
        entry.reversible ? 1 : 0,
        entry.status,
        entry.createdAt,
        entry.expiresAt,
        entry.rollbackNote,
        entry.snapshotSummary,
        JSON.stringify(entry.snapshot ?? { kind: "none", capturedAt: entry.createdAt }),
        JSON.stringify(entry.operation),
      );
  }

  getUndoJournalEntry(entryId: string): UndoJournalEntry | undefined {
    const row = this.db
      .prepare(
        `SELECT id, action_id, label, target, reversible, status, created_at, expires_at, rollback_note, snapshot_summary, snapshot_json,
         operation_json FROM undo_journal WHERE id = ? OR action_id = ?`,
      )
      .get(entryId, entryId) as UndoJournalRow | undefined;
    return row ? undoJournalFromRow(row) : undefined;
  }

  listUndoJournal(limit = 80): UndoJournalEntry[] {
    const rows = this.db
      .prepare(
        `SELECT id, action_id, label, target, reversible, status, created_at, expires_at, rollback_note, snapshot_summary, snapshot_json,
         operation_json FROM undo_journal ORDER BY created_at DESC LIMIT ?`,
      )
      .all(limit) as unknown as UndoJournalRow[];
    return rows.map(undoJournalFromRow);
  }

  markUndoJournalEntry(entryId: string, status: UndoJournalEntry["status"]): UndoJournalEntry | undefined {
    const entry = this.getUndoJournalEntry(entryId);
    if (!entry) {
      return undefined;
    }
    this.db.prepare("UPDATE undo_journal SET status = ? WHERE id = ?").run(status, entry.id);
    return { ...entry, status };
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        summary TEXT NOT NULL,
        token_budget INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS turns (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL,
        task_id TEXT,
        token_estimate INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        status TEXT NOT NULL,
        active_agent_id TEXT NOT NULL,
        task_profile TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        checkpoint TEXT,
        result TEXT
      );

      CREATE TABLE IF NOT EXISTS queue (
        task_id TEXT PRIMARY KEY REFERENCES tasks(id) ON DELETE CASCADE,
        status TEXT NOT NULL,
        priority INTEGER NOT NULL,
        enqueued_at TEXT NOT NULL,
        started_at TEXT,
        finished_at TEXT
      );

      CREATE TABLE IF NOT EXISTS task_events (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        kind TEXT NOT NULL,
        message TEXT NOT NULL,
        created_at TEXT NOT NULL,
        payload_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS memory_writes (
        id TEXT PRIMARY KEY,
        conversation_id TEXT,
        task_id TEXT,
        kind TEXT NOT NULL,
        content TEXT NOT NULL,
        importance REAL NOT NULL,
        created_at TEXT NOT NULL,
        tags_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS memory_records (
        id TEXT PRIMARY KEY,
        layer TEXT NOT NULL,
        kind TEXT NOT NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        source TEXT NOT NULL,
        confidence REAL NOT NULL,
        importance REAL NOT NULL,
        tags_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        last_accessed_at TEXT,
        expires_at TEXT,
        supersedes_memory_id TEXT,
        embedding_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS timeline_events (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        title TEXT NOT NULL,
        summary TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        source TEXT NOT NULL,
        reversible INTEGER NOT NULL,
        undo_entry_id TEXT,
        related_conversation_id TEXT,
        related_task_id TEXT,
        status TEXT,
        tags_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS undo_journal (
        id TEXT PRIMARY KEY,
        action_id TEXT NOT NULL,
        label TEXT NOT NULL,
        target TEXT NOT NULL,
        reversible INTEGER NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        rollback_note TEXT NOT NULL,
        snapshot_summary TEXT NOT NULL,
        snapshot_json TEXT NOT NULL DEFAULT '{"kind":"none","capturedAt":"1970-01-01T00:00:00.000Z"}',
        operation_json TEXT NOT NULL DEFAULT '{"kind":"write-local","command":"unknown","dryRunOnly":true,"restoreStrategy":"state-marker"}'
      );
    `);
    this.addColumnIfMissing(
      "undo_journal",
      "operation_json",
      `TEXT NOT NULL DEFAULT '{"kind":"write-local","command":"unknown","dryRunOnly":true,"restoreStrategy":"state-marker"}'`,
    );
    this.addColumnIfMissing(
      "undo_journal",
      "snapshot_json",
      `TEXT NOT NULL DEFAULT '{"kind":"none","capturedAt":"1970-01-01T00:00:00.000Z"}'`,
    );
  }

  private addColumnIfMissing(table: string, column: string, definition: string): void {
    try {
      this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    } catch (error) {
      if (!(error instanceof Error) || !/duplicate column name/i.test(error.message)) {
        throw error;
      }
    }
  }
}

interface ConversationRow {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  summary: string;
  token_budget: number;
}

interface TurnRow {
  id: string;
  conversation_id: string;
  role: ConversationTurn["role"];
  content: string;
  created_at: string;
  task_id: string | null;
  token_estimate: number;
}

interface TaskRow {
  id: string;
  conversation_id: string;
  title: string;
  status: TaskRun["status"];
  active_agent_id: string;
  task_profile: TaskRun["taskProfile"];
  created_at: string;
  updated_at: string;
  checkpoint: string | null;
  result: string | null;
}

interface QueueRow {
  task_id: string;
  status: TaskQueueItem["status"];
  priority: number;
  enqueued_at: string;
  started_at: string | null;
  finished_at: string | null;
}

interface TaskEventRow {
  id: string;
  task_id: string;
  kind: TaskEvent["kind"];
  message: string;
  created_at: string;
  payload_json: string;
}

interface MemoryWriteRow {
  id: string;
  conversation_id: string | null;
  task_id: string | null;
  kind: MemoryWrite["kind"];
  content: string;
  importance: number;
  created_at: string;
  tags_json: string;
}

interface MemoryRecordRow {
  id: string;
  layer: MemoryRecord["layer"];
  kind: MemoryRecord["kind"];
  title: string;
  content: string;
  source: string;
  confidence: number;
  importance: number;
  tags_json: string;
  created_at: string;
  last_accessed_at: string | null;
  expires_at: string | null;
  supersedes_memory_id: string | null;
  embedding_json: string;
}

interface TimelineEventRow {
  id: string;
  kind: TimelineEvent["kind"];
  title: string;
  summary: string;
  occurred_at: string;
  source: TimelineEvent["source"];
  reversible: number;
  undo_entry_id: string | null;
  related_conversation_id: string | null;
  related_task_id: string | null;
  status: TimelineEvent["status"] | null;
  tags_json: string;
}

interface UndoJournalRow {
  id: string;
  action_id: string;
  label: string;
  target: string;
  reversible: number;
  status: UndoJournalEntry["status"];
  created_at: string;
  expires_at: string;
  rollback_note: string;
  snapshot_summary: string;
  snapshot_json: string;
  operation_json: string;
}

function conversationFromRow(row: ConversationRow): Conversation {
  return {
    id: row.id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    summary: row.summary,
    tokenBudget: row.token_budget,
  };
}

function turnFromRow(row: TurnRow): ConversationTurn {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role,
    content: row.content,
    createdAt: row.created_at,
    taskId: row.task_id ?? undefined,
    tokenEstimate: row.token_estimate,
  };
}

function taskFromRow(row: TaskRow): TaskRun {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    title: row.title,
    status: row.status,
    activeAgentId: row.active_agent_id,
    taskProfile: row.task_profile,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    checkpoint: row.checkpoint ?? undefined,
    result: row.result ?? undefined,
  };
}

function queueFromRow(row: QueueRow): TaskQueueItem {
  return {
    taskId: row.task_id,
    status: row.status,
    priority: row.priority,
    enqueuedAt: row.enqueued_at,
    startedAt: row.started_at ?? undefined,
    finishedAt: row.finished_at ?? undefined,
  };
}

function taskEventFromRow(row: TaskEventRow): TaskEvent {
  return {
    id: row.id,
    taskId: row.task_id,
    kind: row.kind,
    message: row.message,
    createdAt: row.created_at,
    payload: JSON.parse(row.payload_json) as Record<string, unknown>,
  };
}

function memoryWriteFromRow(row: MemoryWriteRow): MemoryWrite {
  return {
    id: row.id,
    conversationId: row.conversation_id ?? undefined,
    taskId: row.task_id ?? undefined,
    kind: row.kind,
    content: row.content,
    importance: row.importance,
    createdAt: row.created_at,
    tags: JSON.parse(row.tags_json) as string[],
  };
}

function memoryRecordFromRow(row: MemoryRecordRow): MemoryRecord {
  return {
    id: row.id,
    layer: row.layer,
    kind: row.kind,
    title: row.title,
    content: row.content,
    source: row.source,
    confidence: row.confidence,
    importance: row.importance,
    tags: JSON.parse(row.tags_json) as string[],
    createdAt: row.created_at,
    lastAccessedAt: row.last_accessed_at ?? undefined,
    expiresAt: row.expires_at ?? undefined,
    supersedesMemoryId: row.supersedes_memory_id ?? undefined,
  };
}

function timelineEventFromRow(row: TimelineEventRow): TimelineEvent {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    summary: row.summary,
    occurredAt: row.occurred_at,
    source: row.source,
    reversible: row.reversible === 1,
    undoEntryId: row.undo_entry_id ?? undefined,
    relatedConversationId: row.related_conversation_id ?? undefined,
    relatedTaskId: row.related_task_id ?? undefined,
    status: row.status ?? undefined,
    tags: JSON.parse(row.tags_json) as string[],
  };
}

function undoJournalFromRow(row: UndoJournalRow): UndoJournalEntry {
  const expired = row.status === "available" && Date.parse(row.expires_at) < Date.now();
  return {
    id: row.id,
    actionId: row.action_id,
    label: row.label,
    target: row.target,
    reversible: row.reversible === 1,
    status: expired ? "expired" : row.status,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    rollbackNote: row.rollback_note,
    snapshotSummary: row.snapshot_summary,
    snapshot: JSON.parse(row.snapshot_json) as UndoJournalEntry["snapshot"],
    operation: JSON.parse(row.operation_json) as UndoJournalEntry["operation"],
  };
}

function memoryLayerForKind(kind: MemoryWrite["kind"]): MemoryRecord["layer"] {
  if (kind === "session") {
    return "short-term";
  }
  if (kind === "daily-note" || kind === "timeline" || kind === "screen-event" || kind === "device-event") {
    return "episodic";
  }
  if (kind === "identity") {
    return "identity";
  }
  if (kind === "skill" || kind === "soul") {
    return "project";
  }
  return "semantic";
}

function localTextEmbedding(text: string, dimensions = 32): number[] {
  const vector = new Array<number>(dimensions).fill(0);
  for (const token of text.toLowerCase().match(/[a-z0-9_:-]+/g) ?? []) {
    let hash = 2166136261;
    for (let index = 0; index < token.length; index += 1) {
      hash ^= token.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    vector[Math.abs(hash) % dimensions] += 1;
  }
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map((value) => Number((value / magnitude).toFixed(6)));
}

function cosineSimilarity(left: number[], right: number[]): number {
  const length = Math.min(left.length, right.length);
  let score = 0;
  for (let index = 0; index < length; index += 1) {
    score += left[index] * right[index];
  }
  return score;
}
