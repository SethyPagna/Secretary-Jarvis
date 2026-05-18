import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ActionRequest } from "@jarvis/core";

export type PermissionDecisionStatus = "granted" | "denied";

export interface PermissionRecord {
  key: string;
  category: ActionRequest["category"];
  target: string;
  status: PermissionDecisionStatus;
  remember: boolean;
  updatedAt: string;
  sourceApprovalId?: string;
  agentId?: string;
  connectorId?: string;
  dataTouched: string[];
}

export interface PermissionStoreSnapshot {
  path: string;
  version: 1;
  records: PermissionRecord[];
}

interface PermissionStoreDisk {
  version?: number;
  records?: PermissionRecord[];
}

const DEFAULT_PERMISSION_PATH = join(process.env.USERPROFILE ?? process.cwd(), ".jarvis", "permissions.json");
const SENSITIVE_CATEGORIES = new Set<ActionRequest["category"]>([
  "credential-access",
  "delete-local",
  "irreversible-edit",
  "protected-core-access",
  "purchase",
]);

export class PermissionStore {
  private readonly records = new Map<string, PermissionRecord>();

  constructor(private readonly filePath = process.env.JARVIS_PERMISSION_STORE_PATH ?? DEFAULT_PERMISSION_PATH) {
    this.load();
  }

  snapshot(): PermissionStoreSnapshot {
    return {
      path: this.filePath,
      version: 1,
      records: [...this.records.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    };
  }

  isRememberedGrant(action: ActionRequest): boolean {
    if (SENSITIVE_CATEGORIES.has(action.category)) {
      return false;
    }
    const record = this.recordForAction(action);
    return Boolean(record?.remember && record.status === "granted");
  }

  recordForAction(action: ActionRequest): PermissionRecord | undefined {
    return this.records.get(permissionKeyForAction(action));
  }

  rememberDecision(action: ActionRequest, status: PermissionDecisionStatus, updatedAt: string, remember = true): PermissionRecord {
    const record: PermissionRecord = {
      key: permissionKeyForAction(action),
      category: action.category,
      target: action.target,
      status,
      remember,
      updatedAt,
      sourceApprovalId: action.id,
      agentId: action.agentId,
      connectorId: action.connectorId,
      dataTouched: action.dataTouched,
    };
    this.records.set(record.key, record);
    this.save();
    return record;
  }

  private load(): void {
    if (!existsSync(this.filePath)) {
      this.save();
      return;
    }
    try {
      const parsed = JSON.parse(readFileSync(this.filePath, "utf8")) as PermissionStoreDisk;
      for (const record of parsed.records ?? []) {
        if (!record?.key || !record.category || !record.target || !record.status) {
          continue;
        }
        this.records.set(record.key, {
          ...record,
          remember: record.remember !== false,
          dataTouched: Array.isArray(record.dataTouched) ? record.dataTouched : [],
        });
      }
    } catch {
      const backupPath = `${this.filePath}.corrupt-${Date.now()}`;
      try {
        renameSync(this.filePath, backupPath);
      } catch {
        // If backup fails, overwrite below with a clean local permission file.
      }
      this.records.clear();
      this.save();
    }
  }

  private save(): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, `${JSON.stringify(this.snapshot(), null, 2)}\n`, "utf8");
  }
}

export function permissionKeyForAction(action: Pick<ActionRequest, "category" | "target" | "agentId" | "connectorId">): string {
  return [
    normalizePart(action.category),
    normalizePart(action.connectorId ?? "any-connector"),
    normalizePart(action.agentId ?? "any-agent"),
    normalizePart(action.target),
  ].join(":");
}

function normalizePart(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "unknown";
}
