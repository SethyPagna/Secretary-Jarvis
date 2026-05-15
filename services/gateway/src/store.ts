import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type {
  Conversation,
  ConversationTurn,
  MemoryWrite,
  TaskEvent,
  TaskQueueItem,
  TaskRun,
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
    `);
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
